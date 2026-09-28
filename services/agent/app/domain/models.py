from __future__ import annotations
from decimal import Decimal
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class BillingPlan(BaseModel):
    plan_id: str
    customer_name: str
    total_value: Decimal
    currency: str
    cadence: Literal["Monthly", "Quarterly", "Annual"]
    start_date: str
    entitlements: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    amends: Optional[str] = None


class Invoice(BaseModel):
    invoice_id: str
    plan_id: str
    customer_name: str
    issue_date: str
    due_date: str
    amount_invoiced: Decimal
    currency: str
    status: Literal["paid", "unpaid", "void"]
    description: str


class CreditMemo(BaseModel):
    memo_id: str
    invoice_id: str
    plan_id: str
    customer_name: Optional[str] = None
    issue_date: str
    amount: Decimal
    currency: str
    reason: str


class ExchangeRate(BaseModel):
    date: str
    from_currency: str
    to_currency: str
    rate: Decimal


class ActionDraft(BaseModel):
    action_type: Literal["make_good_invoice", "credit_memo", "plan_amendment"]
    draft_id: str
    plan_id: str = ""
    invoice_id: str = ""
    amount: Optional[Decimal] = None
    currency: str = "USD"
    reason: str
    change_set: Optional[Dict[str, Any]] = None


class AppliedAction(BaseModel):
    action_id: str
    draft_id: str
    action_type: str
    plan_id: str
    applied_at: str
    details: Dict[str, Any]
