from __future__ import annotations

from typing import Callable, Optional

from langchain_core.language_models import BaseChatModel
from langgraph.graph.state import CompiledStateGraph

from app.agents.base import AgentResult, BaseAgent
from app.config import config
from app.core.llm import build_chat_model
from app.core.tool_logging import ToolCallLoggingHandler
from app.domain.prompts import PromptRegistry
from app.domain.tools import REGISTERED_TOOLS
from app.guardrails.financial import ApprovalPolicyGuardrail
from app.guardrails.groundedness import GroundednessGuardrail
from app.guardrails.loop_guard import LoopGuardrail
from shared.services.agent import tool_agent as shared_tool_agent
from shared.services.agent.tool_agent import ToolAgent


class FinancialDetective(BaseAgent):
    """Revenue-leakage agent: this project's prompt, tools, approval policy and groundedness check on the shared ToolAgent."""

    MAX_VERIFY_RETRIES: int = ToolAgent.MAX_VERIFY_RETRIES
    RECURSION_LIMIT: int = ToolAgent.RECURSION_LIMIT
    NODE_TIMEOUT_SECONDS: int = ToolAgent.NODE_TIMEOUT_SECONDS

    # Same helper the agent has always exposed; the tool-call record format lives in the shared runtime.
    _tool_call_records = staticmethod(ToolAgent._tool_call_records)

    def __init__(self, llm: Optional[BaseChatModel] = None) -> None:
        self._agent = ToolAgent(
            name="financial-detective",
            system_prompt=PromptRegistry.get_system_directive(),
            tools=REGISTERED_TOOLS,
            llm=llm,
            model_factory=build_chat_model,
            approval_policy=ApprovalPolicyGuardrail().approval_reason,
            verifier=GroundednessGuardrail().find_ungrounded,
            loop_guard=LoopGuardrail(),
            provider_name=config.model_name,
            callbacks_factory=lambda on_progress: [ToolCallLoggingHandler(on_progress)],
        )

    @property
    def is_ready(self) -> bool:
        return self._agent.is_ready

    def compile(self) -> CompiledStateGraph:
        return self._agent.compile()

    async def startup(self, database_url: str) -> None:
        await self._agent.startup(database_url)

    async def shutdown(self) -> None:
        await self._agent.shutdown()

    async def execute(
        self, query: str, session_id: str, trace_id: str, openai_api_key: str, progress_callback: Optional[Callable[[str, str, str], None]] = None
    ) -> AgentResult:
        result = await self._agent.execute(query, session_id, trace_id, {"api_key": openai_api_key}, progress_callback)
        return _to_result(result)

    async def resume_approval(self, session_id: str, approved: bool, notes: Optional[str], trace_id: str, openai_api_key: str) -> AgentResult:
        result = await self._agent.resume_approval(session_id, approved, notes, trace_id, {"api_key": openai_api_key})
        return _to_result(result)


def _to_result(result: shared_tool_agent.AgentResult) -> AgentResult:
    return AgentResult(
        response=result.response,
        tools_executed=result.tools_executed,
        tool_calls=result.tool_calls,
        requires_approval=result.requires_approval,
        pending_action=result.pending_action,
    )
