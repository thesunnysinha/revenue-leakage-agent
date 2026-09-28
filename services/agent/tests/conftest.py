"""Shared fixtures for the test suite."""
from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app.domain.repository import BillingRepository

# Root data directory — source JSON files live here (not inside the service).
_SOURCE_DATA = Path(__file__).resolve().parents[3] / "data"


@pytest.fixture()
def data_dir(tmp_path: Path) -> Path:
    """Temporary data directory pre-populated with source JSON, isolated sandbox."""
    for fname in ("billing_plans.json", "invoices.json", "credit_memos.json", "exchange_rates.json"):
        shutil.copy(_SOURCE_DATA / fname, tmp_path / fname)
    (tmp_path / "sandbox").mkdir()
    return tmp_path


@pytest.fixture()
def repo(data_dir: Path) -> BillingRepository:
    """BillingRepository backed by an isolated temp data directory."""
    return BillingRepository(data_dir)
