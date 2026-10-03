"""POST /api/v1/agent/approval must persist each decision exactly once."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.agents.base import AgentResult
from app.config import config
from server import ServerApplication

TOKEN = "t" * 40


class FakeAgent:
    is_ready = True

    async def resume_approval(self, session_id: str, approved: bool, notes: str | None, trace_id: str, openai_api_key: str) -> AgentResult:
        return AgentResult(response="Done.", tools_executed=["apply"])


class FakeChatRepository:
    def __init__(self) -> None:
        self.approval_turns: list[dict[str, Any]] = []

    async def exists(self, session_id: str) -> bool:
        return True

    async def append_approval_turn(self, **kwargs: Any) -> None:
        self.approval_turns.append(kwargs)


@pytest.fixture
def repo() -> FakeChatRepository:
    return FakeChatRepository()


@pytest.fixture
def client(repo: FakeChatRepository, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(config, "backend_api_token", TOKEN)
    server = ServerApplication(agent=FakeAgent(), chat_repository=repo)  # type: ignore[arg-type]
    return TestClient(server.app)


def test_approval_decision_is_recorded_once(client: TestClient, repo: FakeChatRepository) -> None:
    response = client.post(
        "/api/v1/agent/approval",
        json={"session_id": "chat-1", "approved": True, "reviewer_notes": "looks right"},
        headers={"Authorization": f"Bearer {TOKEN}", "X-OpenAI-API-Key": "k" * 24},
    )
    assert response.status_code == 200
    assert len(repo.approval_turns) == 1
    assert repo.approval_turns[0]["approved"] is True and repo.approval_turns[0]["session_id"] == "chat-1"
