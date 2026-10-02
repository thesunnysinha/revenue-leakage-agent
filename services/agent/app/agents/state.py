from __future__ import annotations
from typing import Annotated, Any, Dict, List, Optional
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing import TypedDict


class AgentState(TypedDict):
    messages: Annotated[List[BaseMessage], add_messages]
    step_count: int
    loop_detected: bool
    requires_approval: bool
    pending_action: Optional[Dict[str, Any]]
    verify_attempts: int
    ungrounded_values: List[str]


class AgentContext(TypedDict):
    """Per-invocation secrets and settings; never persisted in graph state."""

    openai_api_key: str
