from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=4000)
    session_id: Optional[str] = Field(default=None)
    user_context: Optional[Dict[str, Any]] = Field(default_factory=dict)


class ChatResponse(BaseModel):
    session_id: str
    trace_id: str
    response: str
    tools_executed: List[str] = Field(default_factory=list)
    latency_ms: float
    requires_human_approval: bool = False
    pending_approval_details: Optional[Dict[str, Any]] = None


class HumanApprovalRequest(BaseModel):
    session_id: str
    approved: bool
    reviewer_notes: Optional[str] = Field(default=None)


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
