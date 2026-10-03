"""End-to-end graph behaviour of FinancialDetective with a scripted model (no network, no database)."""

from __future__ import annotations

from typing import Any, List

import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from app.agents.financial_detective import FinancialDetective
from app.exceptions import ApprovalPendingError, NoPendingApprovalError, OutputHallucinationError

KEY = "k" * 24


class ScriptedModel(BaseChatModel):
    """Replays AI messages in order; the last one repeats."""

    script: List[Any]
    calls: int = 0

    @property
    def _llm_type(self) -> str:
        return "scripted"

    def bind_tools(self, tools: Any, **kwargs: Any) -> "ScriptedModel":
        return self

    def _generate(self, messages: List[BaseMessage], stop: Any = None, run_manager: Any = None, **kwargs: Any) -> ChatResult:
        message = self.script[min(self.calls, len(self.script) - 1)]
        self.calls += 1
        return ChatResult(generations=[ChatGeneration(message=message)])


def tool_call(name: str, args: dict, call_id: str) -> AIMessage:
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": call_id, "type": "tool_call"}])


def agent_with(*script: AIMessage) -> FinancialDetective:
    agent = FinancialDetective(llm=ScriptedModel(script=list(script)))
    agent.compile()
    return agent


async def test_plain_answer() -> None:
    result = await agent_with(AIMessage(content="Nothing to report.")).execute("hello", "s1", "t1", KEY)
    assert result.response == "Nothing to report."
    assert result.tools_executed == [] and result.requires_approval is False


async def test_read_tool_runs_then_answers(repo, monkeypatch) -> None:
    monkeypatch.setattr("app.domain.tools.get_repository", lambda: repo)
    agent = agent_with(tool_call("load_plan", {"plan_id": "C-1001"}, "c1"), AIMessage(content="I loaded the plan."))
    result = await agent.execute("look at C-1001", "s1", "t1", KEY)
    assert result.response == "I loaded the plan."
    assert result.tools_executed == ["load_plan"]
    assert result.tool_calls[0]["status"] == "completed" and "C-1001" in result.tool_calls[0]["result"]


async def test_write_tool_pauses_for_approval_and_rejection_never_runs_it() -> None:
    agent = agent_with(tool_call("apply", {"draft": {"action_type": "credit_memo"}}, "c1"))
    paused = await agent.execute("apply the credit memo", "s1", "t1", KEY)
    assert paused.requires_approval is True
    assert paused.response == "Action requires human approval before it can be applied."
    assert paused.pending_action["reasons"] == ["Sandbox write: apply credit_memo requires human approval before execution."]
    assert paused.tool_calls[0]["status"] == "awaiting_approval"

    with pytest.raises(ApprovalPendingError):
        await agent.execute("another question", "s1", "t2", KEY)

    rejected = await agent.resume_approval("s1", False, "not now", "t3", KEY)
    assert rejected.response == "Action cancelled by the reviewer. Notes: not now"
    assert rejected.requires_approval is False

    with pytest.raises(NoPendingApprovalError):
        await agent.resume_approval("s1", True, None, "t4", KEY)


async def test_ungrounded_figure_is_retried_then_rejected() -> None:
    agent = agent_with(AIMessage(content="The shortfall is $999.00."))
    with pytest.raises(OutputHallucinationError) as caught:
        await agent.execute("how much?", "s1", "t1", KEY)
    assert caught.value.details["hallucinated_values"] == ["$999.00"]


async def test_repeating_the_same_call_hits_the_loop_guard(repo, monkeypatch) -> None:
    monkeypatch.setattr("app.domain.tools.get_repository", lambda: repo)
    agent = agent_with(*[tool_call("load_plan", {"plan_id": "C-1001"}, f"c{i}") for i in range(1, 9)])
    result = await agent.execute("look at C-1001", "s1", "t1", KEY)
    assert "repetitive execution pattern" in result.response
