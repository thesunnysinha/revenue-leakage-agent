from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Type, TypeVar

from pydantic import BaseModel

from app.config import config
from app.domain.models import ActionDraft, AppliedAction, BillingPlan, CreditMemo, ExchangeRate, Invoice

T = TypeVar("T", bound=BaseModel)


class BillingRepository:
    def __init__(self, data_dir: Path) -> None:
        self._data_dir = data_dir
        self._plans: Dict[str, BillingPlan] = {
            p.plan_id: p for p in self._load("billing_plans", BillingPlan)
        }
        self._invoices: List[Invoice] = self._load("invoices", Invoice)
        self._credit_memos: List[CreditMemo] = self._load("credit_memos", CreditMemo)
        self._rates: List[ExchangeRate] = self._load("exchange_rates", ExchangeRate)

    def _load(self, name: str, model: Type[T]) -> List[T]:
        raw: List[Dict[str, Any]] = json.loads(
            (self._data_dir / f"{name}.json").read_text(),
            parse_float=Decimal,
        )
        return [model.model_validate(row) for row in raw]

    def _sandbox_path(self, name: str) -> Path:
        path = self._data_dir / "sandbox" / f"{name}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _read_sandbox(self, name: str) -> List[Dict[str, Any]]:
        p = self._sandbox_path(name)
        if not p.exists():
            return []
        return json.loads(p.read_text(), parse_float=Decimal)

    def _write_sandbox(self, name: str, records: List[Dict[str, Any]]) -> None:
        self._sandbox_path(name).write_text(json.dumps(records, indent=2, default=str))

    # ---- reads -----------------------------------------------------------------------

    def get_plan(self, plan_id: str) -> Optional[BillingPlan]:
        return self._plans.get(plan_id.strip())

    def all_plans(self) -> List[BillingPlan]:
        return list(self._plans.values())

    def invoices_for(self, plan_id: str) -> List[Invoice]:
        return [i for i in self._invoices if i.plan_id == plan_id]

    def all_invoices(
        self,
        plan_id: Optional[str] = None,
        customer_name: Optional[str] = None,
        status: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
    ) -> List[Invoice]:
        result = self._invoices
        if plan_id is not None:
            result = [i for i in result if i.plan_id == plan_id]
        if customer_name is not None:
            result = [i for i in result if customer_name.lower() in i.customer_name.lower()]
        if status is not None:
            result = [i for i in result if i.status == status]
        if from_date is not None:
            result = [i for i in result if i.issue_date >= from_date]
        if to_date is not None:
            result = [i for i in result if i.issue_date <= to_date]
        return result

    def fx_rate(self, from_ccy: str, to_ccy: str, on_date: str) -> Optional[Decimal]:
        if from_ccy == to_ccy:
            return Decimal("1")
        for r in self._rates:
            if r.date == on_date and r.from_currency == from_ccy and r.to_currency == to_ccy:
                return r.rate
        # try reverse
        for r in self._rates:
            if r.date == on_date and r.from_currency == to_ccy and r.to_currency == from_ccy:
                return Decimal("1") / r.rate
        return None

    # ---- sandbox writes --------------------------------------------------------------

    def apply_action(self, draft: ActionDraft) -> AppliedAction:
        action_id = f"ACT-{uuid.uuid4().hex[:8].upper()}"
        applied_at = datetime.now(tz=timezone.utc).isoformat()
        file_map = {
            "make_good_invoice": "make_good_invoices",
            "credit_memo": "credit_memos",
            "plan_amendment": "plan_amendments",
        }
        ledger = file_map[draft.action_type]
        records = self._read_sandbox(ledger)
        applied = AppliedAction(
            action_id=action_id,
            draft_id=draft.draft_id,
            action_type=draft.action_type,
            plan_id=draft.plan_id,
            applied_at=applied_at,
            details=draft.model_dump(),
        )
        records.append(applied.model_dump())
        self._write_sandbox(ledger, records)
        self._append_audit(applied)
        return applied

    def rollback_action(self, action_id: str) -> str:
        for name in ("make_good_invoices", "credit_memos", "plan_amendments"):
            records = self._read_sandbox(name)
            filtered = [r for r in records if r.get("action_id") != action_id]
            if len(filtered) < len(records):
                self._write_sandbox(name, filtered)
                self._append_audit(AppliedAction(
                    action_id=f"ROLLBACK-{action_id}",
                    draft_id="",
                    action_type="rollback",
                    plan_id="",
                    applied_at=datetime.now(tz=timezone.utc).isoformat(),
                    details={"rolled_back_action_id": action_id},
                ))
                return f"Action {action_id} rolled back successfully."
        return f"Action {action_id} not found in sandbox."

    def _append_audit(self, entry: AppliedAction) -> None:
        records = self._read_sandbox("audit_log")
        records.append(entry.model_dump())
        self._write_sandbox("audit_log", records)


@lru_cache(maxsize=1)
def get_repository() -> BillingRepository:
    return BillingRepository(config.data_dir)
