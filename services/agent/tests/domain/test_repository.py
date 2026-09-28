"""Tests for BillingRepository — reads, filters, FX, sandbox writes, rollback."""

from __future__ import annotations

from decimal import Decimal
from app.domain.models import ActionDraft
from app.domain.repository import BillingRepository


class TestReads:
    def test_billing_data_keeps_decimal_amounts_exact(self, repo: BillingRepository) -> None:
        data = repo.billing_data()
        assert len(data["plans"]) == 4
        assert len(data["invoices"]) == 13
        assert data["plans"][0]["total_value"] == "96000"
        assert data["invoices"][0]["amount_invoiced"] == "8000"

    def test_sandbox_activity_reads_audit_events(self, repo: BillingRepository) -> None:
        activity = repo.sandbox_activity()
        assert activity == []

    def test_demo_overview_reports_fixture_counts(self, repo: BillingRepository) -> None:
        overview = repo.demo_overview()
        assert overview["environment"] == "test"
        assert overview["dataset_status"] == "ready"
        assert overview["counts"] == {
            "plans": 4,
            "invoices": 13,
            "credit_memos": 1,
            "exchange_rates": 1,
            "sandbox_actions": 0,
        }
        assert {row["plan_id"] for row in overview["plans"]} == {"C-1001", "C-1007", "C-1007-A1", "C-1010"}

    def test_get_known_plan(self, repo: BillingRepository) -> None:
        plan = repo.get_plan("C-1001")
        assert plan is not None
        assert plan.customer_name == "ACME Corp"
        assert plan.currency == "USD"
        assert plan.cadence == "Monthly"

    def test_get_missing_plan_returns_none(self, repo: BillingRepository) -> None:
        assert repo.get_plan("DOES-NOT-EXIST") is None

    def test_get_plan_strips_whitespace(self, repo: BillingRepository) -> None:
        assert repo.get_plan("  C-1001  ") is not None

    def test_all_plans_count(self, repo: BillingRepository) -> None:
        assert len(repo.all_plans()) == 4

    def test_invoices_for_plan(self, repo: BillingRepository) -> None:
        invoices = repo.invoices_for("C-1001")
        assert len(invoices) == 9
        assert all(i.plan_id == "C-1001" for i in invoices)

    def test_invoices_for_unknown_plan_empty(self, repo: BillingRepository) -> None:
        assert repo.invoices_for("GHOST") == []

    def test_total_invoices_loaded(self, repo: BillingRepository) -> None:
        assert len(repo.all_invoices()) == 13


class TestInvoiceFilters:
    def test_filter_by_plan_id(self, repo: BillingRepository) -> None:
        result = repo.all_invoices(plan_id="C-1001")
        assert all(i.plan_id == "C-1001" for i in result)
        assert len(result) > 0

    def test_filter_by_customer_name_case_insensitive(self, repo: BillingRepository) -> None:
        result = repo.all_invoices(customer_name="acme")
        assert len(result) > 0
        assert all("acme" in i.customer_name.lower() for i in result)

    def test_filter_by_status(self, repo: BillingRepository) -> None:
        paid = repo.all_invoices(status="paid")
        assert len(paid) > 0
        assert all(i.status == "paid" for i in paid)

    def test_filter_from_date(self, repo: BillingRepository) -> None:
        result = repo.all_invoices(from_date="2025-09-01")
        assert all(i.issue_date >= "2025-09-01" for i in result)

    def test_filter_to_date(self, repo: BillingRepository) -> None:
        result = repo.all_invoices(to_date="2024-12-31")
        assert all(i.issue_date <= "2024-12-31" for i in result)

    def test_combined_filters(self, repo: BillingRepository) -> None:
        result = repo.all_invoices(plan_id="C-1001", status="paid")
        assert all(i.plan_id == "C-1001" and i.status == "paid" for i in result)


class TestFxRate:
    def test_known_rate_eur_to_usd(self, repo: BillingRepository) -> None:
        rate = repo.fx_rate("EUR", "USD", "2025-09-12")
        assert rate == Decimal("1.08")

    def test_reverse_rate_usd_to_eur(self, repo: BillingRepository) -> None:
        rate = repo.fx_rate("USD", "EUR", "2025-09-12")
        assert rate is not None
        assert abs(rate - Decimal("1") / Decimal("1.08")) < Decimal("0.001")

    def test_same_currency_returns_one(self, repo: BillingRepository) -> None:
        assert repo.fx_rate("USD", "USD", "2025-01-01") == Decimal("1")

    def test_missing_date_returns_none(self, repo: BillingRepository) -> None:
        assert repo.fx_rate("EUR", "USD", "1900-01-01") is None

    def test_unknown_pair_returns_none(self, repo: BillingRepository) -> None:
        assert repo.fx_rate("JPY", "CHF", "2025-09-12") is None


class TestSandboxWrites:
    def _make_good_draft(self) -> ActionDraft:
        return ActionDraft(
            action_type="make_good_invoice",
            draft_id="DRAFT-MG-TEST01",
            plan_id="C-1001",
            amount=Decimal("8000"),
            currency="USD",
            reason="Missing October billing",
        )

    def test_apply_writes_to_sandbox(self, repo: BillingRepository) -> None:
        draft = self._make_good_draft()
        applied = repo.apply_action(draft)
        assert applied.action_id.startswith("ACT-")
        assert applied.action_type == "make_good_invoice"
        sandbox = repo._read_sandbox("make_good_invoices")
        assert any(r["action_id"] == applied.action_id for r in sandbox)

    def test_apply_appends_audit_log(self, repo: BillingRepository) -> None:
        repo.apply_action(self._make_good_draft())
        audit = repo._read_sandbox("audit_log")
        assert len(audit) == 1

    def test_rollback_removes_from_sandbox(self, repo: BillingRepository) -> None:
        applied = repo.apply_action(self._make_good_draft())
        msg = repo.rollback_action(applied.action_id)
        assert "rolled back" in msg
        sandbox = repo._read_sandbox("make_good_invoices")
        assert not any(r["action_id"] == applied.action_id for r in sandbox)

    def test_rollback_appends_rollback_audit(self, repo: BillingRepository) -> None:
        applied = repo.apply_action(self._make_good_draft())
        repo.rollback_action(applied.action_id)
        audit = repo._read_sandbox("audit_log")
        assert any("ROLLBACK" in r["action_id"] for r in audit)

    def test_rollback_unknown_id_returns_not_found(self, repo: BillingRepository) -> None:
        result = repo.rollback_action("ACT-NONEXISTENT")
        assert "not found" in result

    def test_apply_credit_memo_routes_to_correct_ledger(self, repo: BillingRepository) -> None:
        draft = ActionDraft(
            action_type="credit_memo",
            draft_id="DRAFT-CM-TEST01",
            invoice_id="I-1001",
            amount=Decimal("2000"),
            currency="USD",
            reason="Overbilling correction",
        )
        repo.apply_action(draft)
        assert len(repo._read_sandbox("credit_memos")) == 1
        assert len(repo._read_sandbox("make_good_invoices")) == 0
