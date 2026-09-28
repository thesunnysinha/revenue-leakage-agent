from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import desc, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.domain.chat_models import ChatMessage, ChatSession
from app.schemas import ChatMessageRecord, ChatSummary, ChatTranscript


def _async_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


class ChatRepository:
    def __init__(self, database_url: str) -> None:
        self.engine = create_async_engine(_async_url(database_url), pool_pre_ping=True)
        self.sessions: async_sessionmaker[AsyncSession] = async_sessionmaker(self.engine, expire_on_commit=False)

    async def connect(self) -> None:
        async with self.engine.connect() as connection:
            await connection.execute(text("SELECT 1"))

    async def close(self) -> None:
        await self.engine.dispose()

    async def create_chat(self) -> ChatSummary:
        async with self.sessions.begin() as session:
            chat = ChatSession(session_id=f"chat-{uuid.uuid4().hex}")
            session.add(chat)
            await session.flush()
            return self._summary(chat)

    async def exists(self, session_id: str) -> bool:
        async with self.sessions() as session:
            return await session.scalar(select(func.count()).select_from(ChatSession).where(ChatSession.session_id == session_id)) > 0

    async def list_chats(self) -> list[ChatSummary]:
        async with self.sessions() as session:
            chats = (await session.scalars(select(ChatSession).order_by(desc(ChatSession.updated_at)))).all()
            result = []
            for chat in chats:
                last = await session.scalar(
                    select(ChatMessage.content).where(ChatMessage.session_id == chat.session_id).order_by(desc(ChatMessage.id)).limit(1)
                )
                result.append(self._summary(chat, last or ""))
            return result

    async def list_tool_activity(self, limit: int = 100) -> list[dict[str, Any]]:
        """Flatten recent persisted tool calls into activity entries across all chats."""
        async with self.sessions() as session:
            rows = (
                await session.execute(
                    select(ChatMessage, ChatSession.title)
                    .join(ChatSession, ChatSession.session_id == ChatMessage.session_id)
                    .where(ChatMessage.role == "assistant")
                    .order_by(desc(ChatMessage.created_at), desc(ChatMessage.id))
                    .limit(limit)
                )
            ).all()

        activity: list[dict[str, Any]] = []
        for message, title in rows:
            for call in message.tool_calls or []:
                activity.append(
                    {
                        "event_id": f"tool-{message.id}-{call.get('tool_call_id', 'unknown')}",
                        "event_type": "tool_call",
                        "timestamp": message.created_at.isoformat(),
                        "session_id": message.session_id,
                        "chat_title": title,
                        "tool_call": call,
                    }
                )
        activity.sort(key=lambda entry: entry["timestamp"], reverse=True)
        return activity[:limit]

    async def get_chat(self, session_id: str) -> ChatTranscript | None:
        async with self.sessions() as session:
            chat = await session.get(ChatSession, session_id)
            if chat is None:
                return None
            messages = (await session.scalars(select(ChatMessage).where(ChatMessage.session_id == session_id).order_by(ChatMessage.id))).all()
            records = [
                ChatMessageRecord(
                    id=str(message.id),
                    role=message.role,
                    content=message.content,
                    tools_executed=message.tools_executed or [],
                    tool_calls=message.tool_calls or [],
                    metadata=message.extra_data or {},
                    created_at=message.created_at,
                )
                for message in messages
            ]
            return ChatTranscript(**self._summary(chat, records[-1].content if records else "").model_dump(), messages=records)

    async def append_turn(
        self,
        session_id: str,
        user_content: str,
        assistant_content: str,
        tools_executed: list[str],
        pending_approval_details: dict[str, Any] | None,
        tool_calls: list[dict[str, Any]] | None = None,
    ) -> None:
        async with self.sessions.begin() as session:
            chat = await session.get(ChatSession, session_id)
            if chat is None:
                raise ValueError(f"Chat session {session_id} does not exist")
            is_first = await session.scalar(select(func.count()).select_from(ChatMessage).where(ChatMessage.session_id == session_id)) == 0
            session.add_all(
                [
                    ChatMessage(session_id=session_id, role="user", content=user_content),
                    ChatMessage(
                        session_id=session_id,
                        role="assistant",
                        content=assistant_content,
                        tools_executed=tools_executed,
                        tool_calls=tool_calls or [],
                        extra_data={"pending_approval_details": pending_approval_details} if pending_approval_details else {},
                    ),
                ]
            )
            if is_first:
                chat.title = user_content.strip()[:197] + ("…" if len(user_content.strip()) > 200 else "")
            chat.pending_approval_details = pending_approval_details
            chat.updated_at = func.now()

    async def append_approval_turn(
        self,
        session_id: str,
        approved: bool,
        reviewer_notes: str | None,
        assistant_content: str,
        tools_executed: list[str],
        pending_approval_details: dict[str, Any] | None,
        tool_calls: list[dict[str, Any]] | None = None,
    ) -> None:
        async with self.sessions.begin() as session:
            chat = await session.get(ChatSession, session_id)
            if chat is None:
                raise ValueError(f"Chat session {session_id} does not exist")
            decision: dict[str, Any] = {"approved": approved}
            if reviewer_notes:
                decision["reviewer_notes"] = reviewer_notes
            session.add_all(
                [
                    ChatMessage(session_id=session_id, role="user", content="Approved" if approved else "Rejected", extra_data={"approval_decision": decision}),
                    ChatMessage(
                        session_id=session_id,
                        role="assistant",
                        content=assistant_content,
                        tools_executed=tools_executed,
                        tool_calls=tool_calls or [],
                        extra_data={"pending_approval_details": pending_approval_details} if pending_approval_details else {},
                    ),
                ]
            )
            chat.pending_approval_details = pending_approval_details
            chat.updated_at = func.now()

    @staticmethod
    def _summary(chat: ChatSession, last_message: str = "") -> ChatSummary:
        return ChatSummary(
            session_id=chat.session_id,
            title=chat.title,
            created_at=chat.created_at,
            updated_at=chat.updated_at,
            last_message=last_message,
            pending_approval_details=chat.pending_approval_details,
        )
