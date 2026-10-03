"""In-memory fan-out of sanitized tool lifecycle events to active UI streams."""

from __future__ import annotations

import asyncio
from collections import defaultdict


class ToolProgressHub:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, str]]]] = defaultdict(set)

    async def subscribe(self, session_id: str) -> asyncio.Queue[dict[str, str]]:
        queue: asyncio.Queue[dict[str, str]] = asyncio.Queue(maxsize=64)
        self._subscribers[session_id].add(queue)
        return queue

    async def unsubscribe(self, session_id: str, queue: asyncio.Queue[dict[str, str]]) -> None:
        subscribers = self._subscribers.get(session_id)
        if subscribers is None:
            return
        subscribers.discard(queue)
        if not subscribers:
            self._subscribers.pop(session_id, None)

    def publish_from_thread(self, session_id: str, event: dict[str, str], loop: asyncio.AbstractEventLoop) -> None:
        loop.call_soon_threadsafe(self._publish, session_id, event)

    def _publish(self, session_id: str, event: dict[str, str]) -> None:
        for queue in tuple(self._subscribers.get(session_id, ())):
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            queue.put_nowait(event)


tool_progress_hub = ToolProgressHub()
