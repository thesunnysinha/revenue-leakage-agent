from __future__ import annotations
from typing import Any, Dict, Optional
from app.guardrails.base import BaseGuardrail

WRITE_TOOLS = frozenset({"apply", "rollback"})


class ApprovalPolicyGuardrail(BaseGuardrail):
    """Requires human approval before any tool that writes to the sandbox."""

    def approval_reason(self, tool_name: str, tool_args: Dict[str, Any]) -> Optional[str]:
        if tool_name == "apply":
            action_type = (tool_args.get("draft") or {}).get("action_type", "action")
            return f"Sandbox write: apply {action_type} requires human approval before execution."
        if tool_name == "rollback":
            action_id = tool_args.get("action_id", "unknown")
            return f"Sandbox write: rollback of action {action_id} requires human approval."
        return None

    def evaluate(self, target: Any) -> Any:
        return target
