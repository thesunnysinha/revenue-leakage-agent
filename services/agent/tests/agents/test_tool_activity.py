from langchain_core.messages import AIMessage, ToolMessage

from app.agents.financial_detective import FinancialDetective


def test_records_completed_failed_and_approval_pending_tool_calls() -> None:
    messages = [
        AIMessage(
            content="",
            tool_calls=[
                {"id": "call-done", "name": "load_plan", "args": {"plan_id": "C-1001"}, "type": "tool_call"},
                {"id": "call-failed", "name": "query_invoices", "args": {"status": "paid"}, "type": "tool_call"},
                {"id": "call-pending", "name": "apply", "args": {"draft": {"draft_id": "D-1"}}, "type": "tool_call"},
            ],
        ),
        ToolMessage(content='{"plan_id":"C-1001"}', tool_call_id="call-done", name="load_plan"),
        ToolMessage(content="Tool error", tool_call_id="call-failed", name="query_invoices", status="error"),
    ]

    calls = FinancialDetective._tool_call_records(messages)

    assert [call["status"] for call in calls] == ["completed", "failed", "awaiting_approval"]
    assert calls[0]["arguments"] == {"plan_id": "C-1001"}
    assert calls[0]["result"] == '{"plan_id":"C-1001"}'
    assert calls[2]["result"] is None


def test_truncates_long_tool_results_for_chat_transcripts() -> None:
    messages = [
        AIMessage(content="", tool_calls=[{"id": "call-long", "name": "query_invoices", "args": {}, "type": "tool_call"}]),
        ToolMessage(content="x" * 1500, tool_call_id="call-long", name="query_invoices"),
    ]

    calls = FinancialDetective._tool_call_records(messages)

    assert calls[0]["status"] == "completed"
    assert calls[0]["result"].endswith("… (truncated)")
    assert len(calls[0]["result"]) < 1250


def test_approval_resume_keeps_the_previously_pending_write_call() -> None:
    messages = [
        AIMessage(
            content="",
            tool_calls=[
                {"id": "call-read", "name": "load_plan", "args": {}, "type": "tool_call"},
                {"id": "call-write", "name": "apply", "args": {"draft": {}}, "type": "tool_call"},
            ],
        ),
        ToolMessage(content="Plan data", tool_call_id="call-read", name="load_plan"),
        ToolMessage(content="Action applied", tool_call_id="call-write", name="apply"),
    ]

    calls = FinancialDetective._tool_call_records(messages, {"call-read"})

    assert len(calls) == 1
    assert calls[0]["tool_call_id"] == "call-write"
    assert calls[0]["status"] == "completed"
