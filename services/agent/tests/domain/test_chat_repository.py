from __future__ import annotations

import os

import pytest
from sqlalchemy import delete

from app.core.migrations import upgrade_database
from app.domain.chat_models import ChatSession
from app.domain.chat_repository import ChatRepository, _async_url


def test_async_url_uses_psycopg_async_dialect() -> None:
    assert _async_url("postgresql://user:pass@localhost/db") == "postgresql+psycopg://user:pass@localhost/db"
    assert _async_url("postgresql+psycopg://user:pass@localhost/db") == "postgresql+psycopg://user:pass@localhost/db"


@pytest.mark.asyncio
async def test_chat_and_approval_history_round_trip() -> None:
    database_url = os.getenv("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("Set TEST_DATABASE_URL to run Postgres persistence integration coverage")

    await upgrade_database(database_url)
    repository = ChatRepository(database_url)
    await repository.connect()
    session_id: str | None = None
    try:
        chat = await repository.create_chat()
        session_id = chat.session_id
        await repository.append_turn(
            session_id=session_id,
            user_content="Inspect plan C-1001",
            assistant_content="A corrective action is ready for review.",
            tools_executed=["load_plan", "query_invoices"],
            pending_approval_details={"action_type": "make_good_invoice"},
            tool_calls=[{"tool_call_id": "call-plan", "name": "load_plan", "arguments": {"plan_id": "C-1001"}, "status": "completed", "result": "plan data"}],
        )

        transcript = await repository.get_chat(session_id)
        assert transcript is not None
        assert transcript.title == "Inspect plan C-1001"
        assert [message.role for message in transcript.messages] == ["user", "assistant"]
        assert transcript.pending_approval_details == {"action_type": "make_good_invoice"}
        assert transcript.messages[1].tool_calls[0].name == "load_plan"
        assert transcript.messages[1].tool_calls[0].status == "completed"
        activity = await repository.list_tool_activity()
        assert activity[0]["event_type"] == "tool_call"
        assert activity[0]["tool_call"]["name"] == "load_plan"

        await repository.append_approval_turn(
            session_id=session_id,
            approved=True,
            reviewer_notes="Reviewed",
            assistant_content="The action was applied.",
            tools_executed=["apply"],
            pending_approval_details=None,
            tool_calls=[{"tool_call_id": "call-apply", "name": "apply", "arguments": {}, "status": "completed", "result": "action applied"}],
        )
        restored = await repository.get_chat(session_id)
        assert restored is not None
        assert len(restored.messages) == 4
        assert restored.messages[2].metadata["approval_decision"] == {"approved": True, "reviewer_notes": "Reviewed"}
        assert restored.messages[3].tool_calls[0].name == "apply"
        assert restored.pending_approval_details is None
        assert any(summary.session_id == session_id for summary in await repository.list_chats())
    finally:
        if session_id is not None:
            async with repository.sessions.begin() as session:
                await session.execute(delete(ChatSession).where(ChatSession.session_id == session_id))
        await repository.close()
