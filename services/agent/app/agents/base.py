from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from langgraph.graph.state import CompiledStateGraph

@dataclass(frozen=True)
class AgentResult:
    response: str
    tools_executed: List[str] = field(default_factory=list)
    requires_approval: bool = False
    pending_action: Optional[Dict[str, Any]] = None
    findings: List[Dict[str, Any]] = field(default_factory=list)

class BaseAgent(ABC):
    @property
    @abstractmethod
    def is_ready(self) -> bool:
        pass

    @abstractmethod
    def compile(self) -> CompiledStateGraph:
        pass

    @abstractmethod
    async def execute(self, query: str, session_id: str, trace_id: str) -> AgentResult:
        pass

    @abstractmethod
    async def resume_approval(self, session_id: str, approved: bool, notes: Optional[str], trace_id: str) -> AgentResult:
        pass
