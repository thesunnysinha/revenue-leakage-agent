from __future__ import annotations
import sys
from typing import Any, Callable, Dict, List, Optional
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, RemoveMessage, SystemMessage, ToolMessage
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.errors import GraphRecursionError
from langgraph.graph import StateGraph, START, END
from langgraph.runtime import Runtime
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode
from langgraph.types import Command, interrupt

from app.agents.base import AgentResult, BaseAgent
from app.agents.state import AgentContext, AgentState
from app.core.llm import build_chat_model
from app.core.telemetry import get_logger, trace_context, tracing_callbacks
from app.core.tool_logging import ToolCallLoggingHandler
from app.domain.prompts import PromptRegistry
from app.domain.tools import REGISTERED_TOOLS, handle_tool_error
from app.exceptions import (
    AgentServiceError,
    ApprovalPendingError,
    GraphUninitializedError,
    LoopBreakerError,
    NoPendingApprovalError,
    OutputHallucinationError,
    ProviderModelError,
)
from app.guardrails.financial import ApprovalPolicyGuardrail
from app.guardrails.groundedness import GroundednessGuardrail
from app.guardrails.loop_guard import DUPLICATE_PREFIX, FEEDBACK_FLAG, LoopGuardrail, current_turn

logger = get_logger(__name__)


class FinancialDetective(BaseAgent):
    MAX_VERIFY_RETRIES: int = 1
    RECURSION_LIMIT: int = 40
    NODE_TIMEOUT_SECONDS: int = 90

    def __init__(self, llm: Optional[BaseChatModel] = None) -> None:
        self._llm = llm
        self._system_prompt = PromptRegistry.get_system_directive()
        self._checkpointer = InMemorySaver()
        self._approval_guardrail = ApprovalPolicyGuardrail()
        self._groundedness_guardrail = GroundednessGuardrail()
        self._loop_guardrail = LoopGuardrail()
        self._compiled_graph: Optional[CompiledStateGraph] = None
        self._llm_with_tools: Any = None
        self._checkpointer_context: Any = None

    async def startup(self, database_url: str) -> None:
        from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver

        self._checkpointer_context = AsyncPostgresSaver.from_conn_string(database_url)
        self._checkpointer = await self._checkpointer_context.__aenter__()
        try:
            await self._checkpointer.setup()
            self.compile()
        except Exception:
            await self._checkpointer_context.__aexit__(*sys.exc_info())
            self._checkpointer_context = None
            raise

    async def shutdown(self) -> None:
        if self._checkpointer_context is not None:
            await self._checkpointer_context.__aexit__(None, None, None)
            self._checkpointer_context = None

    # ---- nodes -----------------------------------------------------------------------

    async def _agent_node(self, state: AgentState, runtime: Runtime[AgentContext]) -> Dict[str, Any]:
        messages = list(state["messages"])
        turn = current_turn(messages)
        step_count = state.get("step_count", 0) + 1

        if step_count > self._loop_guardrail.MAX_TOTAL_STEPS or self._loop_guardrail.no_progress(turn):
            logger.warning("agent.loop.halted", step_count=step_count)
            return {"step_count": step_count, "loop_detected": True}

        llm_with_tools = self._llm_with_tools
        if self._llm is None:
            llm_with_tools = build_chat_model(runtime.context["openai_api_key"]).bind_tools(REGISTERED_TOOLS)
        response = await llm_with_tools.ainvoke([SystemMessage(content=self._system_prompt), *messages])

        reasons: List[str] = []
        calls: List[Dict[str, Any]] = []
        for call in getattr(response, "tool_calls", None) or []:
            reason = self._approval_guardrail.approval_reason(call["name"], call["args"])
            logger.info(
                "agent.tool.requested",
                tool_name=call["name"],
                tool_call_id=call["id"],
                argument_names=sorted(str(key) for key in call["args"]),
                approval_required=bool(reason),
            )
            if self._loop_guardrail.would_repeat_too_often(call["name"], call["args"], turn):
                logger.warning(
                    "agent.tool.blocked",
                    tool_name=call["name"],
                    tool_call_id=call["id"],
                    block_reason="loop_guard",
                )
                return {"step_count": step_count, "loop_detected": True}
            if reason:
                reasons.append(reason)
                calls.append({"tool": call["name"], "args": call["args"], "id": call["id"]})

        return {
            "messages": [response],
            "step_count": step_count,
            "loop_detected": False,
            "requires_approval": bool(reasons),
            "pending_action": {"reasons": reasons, "calls": calls} if reasons else None,
        }

    def _fallback_node(self, state: AgentState) -> Dict[str, Any]:
        logger.warning("agent.fallback.routed")
        verified: List[str] = []
        for msg in current_turn(list(state["messages"])):
            text = str(msg.content)
            if isinstance(msg, ToolMessage) and not text.startswith(DUPLICATE_PREFIX) and msg.status != "error" and text not in verified:
                verified.append(text if len(text) <= 800 else text[:800] + " ...")
        content = "I stopped because a repetitive execution pattern was detected. Please refine your query."
        if verified:
            content += "\n\nVerified information collected:\n" + "\n".join(verified)
        return {"messages": [AIMessage(content=content)], "loop_detected": False}

    def _approval_node(self, state: AgentState) -> Command:
        pending = state.get("pending_action")
        logger.info("agent.approval.requested", pending=pending)
        decision = interrupt(pending)
        cleared = {"requires_approval": False, "pending_action": None}
        if decision.get("approved"):
            logger.info("agent.approval.granted")
            return Command(goto="tools", update=cleared)
        notes = decision.get("notes") or "no notes"
        logger.info("agent.approval.rejected", notes=notes)
        rejected = [
            ToolMessage(
                content=f"Action rejected by reviewer. Notes: {notes}",
                tool_call_id=c["id"],
                name=c["tool"],
                status="error",
            )
            for c in (pending or {}).get("calls", [])
        ]
        closing = AIMessage(content=f"Action cancelled by the reviewer. Notes: {notes}")
        return Command(goto=END, update={**cleared, "messages": [*rejected, closing]})

    def _verify_node(self, state: AgentState) -> Command:
        last = state["messages"][-1]
        sources = [
            str(m.content)
            for m in state["messages"]
            if isinstance(m, ToolMessage) or (isinstance(m, HumanMessage) and not m.additional_kwargs.get(FEEDBACK_FLAG))
        ]
        ungrounded = self._groundedness_guardrail.find_ungrounded(str(last.content), sources)
        scaffolding = [
            RemoveMessage(id=m.id) for m in current_turn(list(state["messages"])) if isinstance(m, HumanMessage) and m.additional_kwargs.get(FEEDBACK_FLAG)
        ]
        if not ungrounded:
            return Command(goto=END, update={"messages": scaffolding} if scaffolding else None)
        attempts = state.get("verify_attempts", 0)
        logger.warning("agent.verify.failed", ungrounded=ungrounded, attempt=attempts + 1)
        if attempts < self.MAX_VERIFY_RETRIES:
            feedback = HumanMessage(
                content=(
                    f"Verification failed: these values are not present in any tool result: {', '.join(ungrounded)}. "
                    "Rewrite your answer using only figures from tool results."
                ),
                additional_kwargs={FEEDBACK_FLAG: True},
            )
            return Command(goto="agent", update={"messages": [RemoveMessage(id=last.id), feedback], "verify_attempts": attempts + 1})
        return Command(goto=END, update={"messages": [RemoveMessage(id=last.id), *scaffolding], "ungrounded_values": ungrounded})

    # ---- graph -----------------------------------------------------------------------

    def compile(self) -> CompiledStateGraph:
        self._llm_with_tools = self._llm.bind_tools(REGISTERED_TOOLS) if self._llm is not None else None

        builder = StateGraph(AgentState, context_schema=AgentContext)
        builder.add_node("agent", self._agent_node, timeout=self.NODE_TIMEOUT_SECONDS)
        builder.add_node("fallback", self._fallback_node)
        builder.add_node("approval_gate", self._approval_node, destinations=("tools", END))
        builder.add_node("verify", self._verify_node, destinations=("agent", END))
        builder.add_node("tools", ToolNode(REGISTERED_TOOLS, handle_tool_errors=handle_tool_error))

        builder.add_edge(START, "agent")

        def route(state: AgentState) -> str:
            if state.get("loop_detected"):
                return "fallback"
            if state.get("requires_approval"):
                return "approval_gate"
            if getattr(state["messages"][-1], "tool_calls", None):
                return "tools"
            return "verify"

        builder.add_conditional_edges(
            "agent",
            route,
            {
                "fallback": "fallback",
                "approval_gate": "approval_gate",
                "tools": "tools",
                "verify": "verify",
            },
        )
        builder.add_edge("fallback", END)
        builder.add_edge("tools", "agent")

        self._compiled_graph = builder.compile(checkpointer=self._checkpointer)
        return self._compiled_graph

    @property
    def is_ready(self) -> bool:
        return self._compiled_graph is not None

    # ---- execution -------------------------------------------------------------------

    @staticmethod
    def _thread_config(session_id: str) -> Dict[str, Any]:
        return {"configurable": {"thread_id": session_id}, "recursion_limit": FinancialDetective.RECURSION_LIMIT}

    def _require_graph(self) -> CompiledStateGraph:
        if self._compiled_graph is None:
            raise GraphUninitializedError()
        return self._compiled_graph

    async def execute(
        self, query: str, session_id: str, trace_id: str, openai_api_key: str, progress_callback: Optional[Callable[[str, str, str], None]] = None
    ) -> AgentResult:
        graph = self._require_graph()
        cfg = self._thread_config(session_id)
        snapshot = await graph.aget_state(cfg)
        if snapshot.next:
            raise ApprovalPendingError(session_id)
        initial: Dict[str, Any] = {
            "messages": [HumanMessage(content=query)],
            "step_count": 0,
            "loop_detected": False,
            "requires_approval": False,
            "pending_action": None,
            "verify_attempts": 0,
            "ungrounded_values": [],
        }
        return await self._run(graph, initial, cfg, trace_id, openai_api_key, progress_callback=progress_callback)

    async def resume_approval(self, session_id: str, approved: bool, notes: Optional[str], trace_id: str, openai_api_key: str) -> AgentResult:
        graph = self._require_graph()
        cfg = self._thread_config(session_id)
        snapshot = await graph.aget_state(cfg)
        if not snapshot.next:
            raise NoPendingApprovalError(session_id)
        completed_tool_call_ids = {str(message.tool_call_id) for message in snapshot.values.get("messages", []) if isinstance(message, ToolMessage)}
        return await self._run(
            graph,
            Command(resume={"approved": approved, "notes": notes}),
            cfg,
            trace_id,
            openai_api_key,
            completed_tool_call_ids=completed_tool_call_ids,
        )

    async def _run(
        self,
        graph: CompiledStateGraph,
        graph_input: Any,
        cfg: Dict[str, Any],
        trace_id: str,
        openai_api_key: str,
        completed_tool_call_ids: Optional[set[str]] = None,
        progress_callback: Optional[Callable[[str, str, str], None]] = None,
    ) -> AgentResult:
        session_id = cfg["configurable"]["thread_id"]
        run_config = {
            **cfg,
            "callbacks": [*tracing_callbacks(), ToolCallLoggingHandler(progress_callback)],
            "run_name": "financial-detective",
        }
        try:
            with trace_context(session_id, trace_id):
                result = await graph.ainvoke(graph_input, config=run_config, context={"openai_api_key": openai_api_key})
        except GraphRecursionError as exc:
            raise LoopBreakerError(reason=f"recursion limit of {self.RECURSION_LIMIT} reached") from exc
        except AgentServiceError:
            raise
        except Exception as exc:
            logger.error("agent.model.invocation_failed", error_type=type(exc).__name__)
            from app.config import config as app_config

            raise ProviderModelError(
                provider=app_config.model_name,
                reason=f"upstream request failed ({type(exc).__name__})",
                details={"upstream_status": getattr(exc, "status_code", None)},
            ) from exc

        messages: List[BaseMessage] = result.get("messages", [])
        turn = current_turn(messages)
        tools_executed = [m.name or "tool" for m in turn if isinstance(m, ToolMessage) and not str(m.content).startswith(DUPLICATE_PREFIX)]
        tool_calls = self._tool_call_records(turn, completed_tool_call_ids)

        interrupts = result.get("__interrupt__")
        if interrupts:
            logger.info("agent.paused_for_approval", tools=tools_executed)
            return AgentResult(
                response="Action requires human approval before it can be applied.",
                tools_executed=tools_executed,
                tool_calls=tool_calls,
                requires_approval=True,
                pending_action=interrupts[0].value,
            )

        if result.get("ungrounded_values"):
            raise OutputHallucinationError(hallucinated_values=result["ungrounded_values"])

        if not messages:
            return AgentResult(response="No response generated.")
        return AgentResult(response=str(messages[-1].content), tools_executed=tools_executed, tool_calls=tool_calls)

    @staticmethod
    def _tool_call_records(messages: List[BaseMessage], exclude_tool_call_ids: Optional[set[str]] = None) -> List[Dict[str, Any]]:
        records: Dict[str, Dict[str, Any]] = {}
        ordered_ids: List[str] = []
        for message in messages:
            if isinstance(message, AIMessage):
                for call in message.tool_calls:
                    call_id = str(call.get("id") or f"tool-{len(ordered_ids)}")
                    records[call_id] = {
                        "tool_call_id": call_id,
                        "name": str(call.get("name") or "unknown"),
                        "arguments": call.get("args") if isinstance(call.get("args"), dict) else {},
                        "status": "awaiting_approval",
                        "result": None,
                    }
                    ordered_ids.append(call_id)
            elif isinstance(message, ToolMessage):
                call_id = str(message.tool_call_id)
                record = records.get(call_id)
                if record is None:
                    continue
                content = str(message.content)
                if content.startswith(DUPLICATE_PREFIX):
                    record["status"] = "skipped"
                elif message.status == "error":
                    record["status"] = "failed"
                else:
                    record["status"] = "completed"
                record["result"] = content if len(content) <= 1200 else content[:1200] + " … (truncated)"
        return [records[call_id] for call_id in ordered_ids if call_id not in (exclude_tool_call_ids or set())]
