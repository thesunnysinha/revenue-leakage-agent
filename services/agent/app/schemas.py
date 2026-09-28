from __future__ import annotations
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=4000)
    session_id: Optional[str] = Field(default=None)
    user_context: Optional[Dict[str, Any]] = Field(default_factory=dict)


class ToolCallRecord(BaseModel):
    tool_call_id: str
    name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)
    status: Literal["completed", "failed", "awaiting_approval", "skipped"]
    result: Optional[str] = None


class ChatResponse(BaseModel):
    session_id: str
    trace_id: str
    response: str
    tools_executed: List[str] = Field(default_factory=list)
    tool_calls: List[ToolCallRecord] = Field(default_factory=list)
    latency_ms: float
    requires_human_approval: bool = False
    pending_approval_details: Optional[Dict[str, Any]] = None


class HumanApprovalRequest(BaseModel):
    session_id: str
    approved: bool
    reviewer_notes: Optional[str] = Field(default=None)


class ChatMessageRecord(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    tools_executed: List[str] = Field(default_factory=list)
    tool_calls: List[ToolCallRecord] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class ChatSummary(BaseModel):
    session_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    last_message: str = ""
    pending_approval_details: Optional[Dict[str, Any]] = None


class ChatTranscript(ChatSummary):
    messages: List[ChatMessageRecord] = Field(default_factory=list)


class ErrorEnvelope(BaseModel):
    error_code: str
    message: str
    trace_id: str
    details: Optional[Dict[str, Any]] = None


class HealthStatus(BaseModel):
    status: str
    version: str
    environment: str
    uptime_seconds: float
    graph_compiled: bool
