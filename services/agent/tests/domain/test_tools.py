"""Tests for domain tools — all read/propose tools (no LLM, no sandbox writes)."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

import pytest

from app.domain.repository import BillingRepository
from app.domain.tools import (
    fx_convert,
    load_plan,
    propose_credit_memo,
    propose_make_good_invoice,
    propose_plan_amendment,
    query_invoices,
)


@pytest.fixture(autouse=True)
def _patch_repo(repo: BillingRepository):
    """Redirect all tool calls to use the isolated test repository."""
    with patch("app.domain.tools.get_repository", return_value=repo):
        yield


class TestLoadPlan:
    def test_returns_plan_json(self) -> None:
        result = json.loads(load_plan.invoke({"plan_id": "C-1001"}))
        assert result["plan_id"] == "C-1001"
        assert result["customer_name"] == "ACME Corp"

    def test_unknown_plan_returns_not_found(self) -> None:
        result = load_plan.invoke({"plan_id": "GHOST"})
        assert "not found" in result.lower()


class TestQueryInvoices:
    def test_returns_all_invoices_no_filter(self) -> None:
        result = json.loads(query_invoices.invoke({}))
        assert len(result) == 13

    def test_filter_by_plan_id(self) -> None:
        result = json.loads(query_invoices.invoke({"plan_id": "C-1001"}))
        assert len(result) == 9
        assert all(i["plan_id"] == "C-1001" for i in result)

    def test_filter_by_status(self) -> None:
        result = json.loads(query_invoices.invoke({"status": "paid"}))
        assert all(i["status"] == "paid" for i in result)

    def test_empty_when_no_match(self) -> None:
        result = json.loads(query_invoices.invoke({"plan_id": "GHOST"}))
        assert result == []


class TestFxConvert:
    def test_eur_to_usd(self) -> None:
        result = json.loads(fx_convert.invoke({"amount": 25000, "from_currency": "EUR", "to_currency": "USD", "on_date": "2025-09-12"}))
        assert result["converted_amount"] == pytest.approx(27000.0)
        assert result["rate"] == pytest.approx(1.08)

    def test_same_currency(self) -> None:
        result = json.loads(fx_convert.invoke({"amount": 1000, "from_currency": "USD", "to_currency": "USD", "on_date": "2025-09-12"}))
        assert result["converted_amount"] == 1000.0

    def test_missing_rate_returns_error_string(self) -> None:
        result = fx_convert.invoke({"amount": 100, "from_currency": "JPY", "to_currency": "CHF", "on_date": "2025-09-12"})
        assert "No exchange rate" in result


class TestPropose:
    def test_propose_make_good_invoice_returns_draft(self) -> None:
        result = json.loads(propose_make_good_invoice.invoke({"plan_id": "C-1001", "amount": 8000.0, "currency": "USD", "reason": "Missing October billing"}))
        assert result["action_type"] == "make_good_invoice"
        assert result["draft_id"].startswith("DRAFT-MG-")
        assert result["plan_id"] == "C-1001"
        assert Decimal(result["amount"]) == Decimal("8000")

    def test_propose_credit_memo_returns_draft(self) -> None:
        result = json.loads(propose_credit_memo.invoke({"invoice_id": "I-9123", "amount": 2000.0, "currency": "USD", "reason": "Overbilling correction"}))
        assert result["action_type"] == "credit_memo"
        assert result["draft_id"].startswith("DRAFT-CM-")
        assert result["invoice_id"] == "I-9123"

    def test_propose_plan_amendment_returns_draft(self) -> None:
        result = json.loads(propose_plan_amendment.invoke({"plan_id": "C-1001", "change_set": {"total_value": 110000}, "reason": "Contract renewal"}))
        assert result["action_type"] == "plan_amendment"
        assert result["draft_id"].startswith("DRAFT-PA-")
        assert result["change_set"] == {"total_value": 110000}

    def test_propose_does_not_write_sandbox(self, data_dir: Path) -> None:
        propose_make_good_invoice.invoke({"plan_id": "C-1001", "amount": 5000.0, "currency": "USD", "reason": "test"})
        assert not (data_dir / "sandbox" / "make_good_invoices.json").exists()
