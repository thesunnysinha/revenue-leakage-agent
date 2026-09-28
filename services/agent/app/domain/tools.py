from __future__ import annotations

import json
import uuid
from decimal import Decimal
from typing import Any, Optional

from langchain_core.tools import tool

from app.domain.models import ActionDraft
from app.domain.repository import get_repository
from app.exceptions import ToolExecutionError

WRITE_TOOLS = frozenset({"apply", "rollback"})


def _json(obj: Any) -> str:
    return json.dumps(obj, default=str)


@tool
def load_plan(plan_id: str) -> str:
    """Load full details of a billing plan by plan_id."""
    plan = get_repository().get_plan(plan_id)
    if plan is None:
        return f"Plan '{plan_id}' not found."
    return _json(plan.model_dump())


@tool
def query_invoices(
    plan_id: Optional[str] = None,
    customer_name: Optional[str] = None,
    status: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> str:
    """Filter invoices. All parameters are optional and combinable.
    Returns matching invoices as a JSON array.
    status must be one of: paid, unpaid, void.
    from_date / to_date are ISO date strings (YYYY-MM-DD).
    """
    invoices = get_repository().all_invoices(
        plan_id=plan_id,
        customer_name=customer_name,
        status=status,
        from_date=from_date,
        to_date=to_date,
    )
    return _json([i.model_dump() for i in invoices])


@tool
def fx_convert(amount: float, from_currency: str, to_currency: str, on_date: str) -> str:
    """Convert an amount between currencies using available exchange rates for a specific date.
    on_date must be ISO format YYYY-MM-DD.
    Returns JSON with converted_amount and rate, or an error string if no rate exists.
    """
    rate = get_repository().fx_rate(from_currency, to_currency, on_date)
    if rate is None:
        return f"No exchange rate found for {from_currency}→{to_currency} on {on_date}."
    converted = round(Decimal(str(amount)) * rate, 2)
    return _json({"converted_amount": float(converted), "rate": float(rate)})


@tool
def propose_make_good_invoice(plan_id: str, amount: float, currency: str, reason: str) -> str:
    """Draft a make-good invoice to recover missed or underbilled revenue.
    Does NOT write to sandbox — returns a draft object for human approval.
    Pass the returned draft to apply() after user confirms.
    """
    draft = ActionDraft(
        action_type="make_good_invoice",
        draft_id=f"DRAFT-MG-{uuid.uuid4().hex[:8].upper()}",
        plan_id=plan_id,
        amount=Decimal(str(amount)),
        currency=currency,
        reason=reason,
    )
    return _json(draft.model_dump())


@tool
def propose_credit_memo(invoice_id: str, amount: float, currency: str, reason: str) -> str:
    """Draft a credit memo to correct an overbilled invoice.
    Does NOT write to sandbox — returns a draft object for human approval.
    Pass the returned draft to apply() after user confirms.
    """
    draft = ActionDraft(
        action_type="credit_memo",
        draft_id=f"DRAFT-CM-{uuid.uuid4().hex[:8].upper()}",
        invoice_id=invoice_id,
        amount=Decimal(str(amount)),
        currency=currency,
        reason=reason,
    )
    return _json(draft.model_dump())


@tool
def propose_plan_amendment(plan_id: str, change_set: dict, reason: str) -> str:
    """Draft a billing plan amendment (e.g. change total_value, cadence, entitlements).
    Does NOT write to sandbox — returns a draft object for human approval.
    Pass the returned draft to apply() after user confirms.
    change_set is a dict of fields to update, e.g. {"total_value": 110000}.
    """
    draft = ActionDraft(
        action_type="plan_amendment",
        draft_id=f"DRAFT-PA-{uuid.uuid4().hex[:8].upper()}",
        plan_id=plan_id,
        reason=reason,
        change_set=change_set,
    )
    return _json(draft.model_dump())


@tool
def apply(draft: dict) -> str:
    """Apply a previously proposed action draft to the sandbox.
    REQUIRES human approval — this call triggers the approval gate before execution.
    draft must be the complete dict returned by a propose_* tool.
    """
    try:
        action_draft = ActionDraft.model_validate(draft)
    except Exception as exc:
        raise ToolExecutionError("apply", f"Invalid draft: {exc}") from exc
    result = get_repository().apply_action(action_draft)
    return _json(result.model_dump())


@tool
def rollback(action_id: str) -> str:
    """Undo a previously applied action by its action_id.
    REQUIRES human approval — this call triggers the approval gate before execution.
    """
    return get_repository().rollback_action(action_id)


def handle_tool_error(error: Exception) -> str:
    if isinstance(error, ToolExecutionError):
        return f"Tool error ({error.tool_name}): {error.message}"
    return f"Tool error: {error}"


REGISTERED_TOOLS = [
    load_plan,
    query_invoices,
    fx_convert,
    propose_make_good_invoice,
    propose_credit_memo,
    propose_plan_amendment,
    apply,
    rollback,
]
