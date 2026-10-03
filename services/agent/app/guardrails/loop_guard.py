from __future__ import annotations

from typing import Iterable, Optional

from shared.services.agent.guardrails.loop_guard import DUPLICATE_PREFIX, FEEDBACK_FLAG, current_turn
from shared.services.agent.guardrails.loop_guard import LoopGuardrail as _SharedLoopGuardrail

# A call to one of these starts a fresh no-progress window. Kept as it was before the shared runtime was adopted.
WRITE_TOOLS = frozenset({"create_billing_adjustment"})


class LoopGuardrail(_SharedLoopGuardrail):
    def __init__(self, write_tools: Optional[Iterable[str]] = None) -> None:
        super().__init__(WRITE_TOOLS if write_tools is None else write_tools)


__all__ = ["DUPLICATE_PREFIX", "FEEDBACK_FLAG", "LoopGuardrail", "WRITE_TOOLS", "current_turn"]
