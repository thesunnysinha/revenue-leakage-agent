from __future__ import annotations

import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config


def _upgrade(database_url: str) -> None:
    ini_path = Path(__file__).resolve().parents[2] / "alembic.ini"
    alembic_config = Config(str(ini_path))
    alembic_config.attributes["database_url"] = database_url
    command.upgrade(alembic_config, "head")


async def upgrade_database(database_url: str) -> None:
    """Apply pending Alembic migrations before the API accepts requests."""
    # Alembic uses a synchronous psycopg engine; keep its blocking work off the event loop.
    await asyncio.to_thread(_upgrade, database_url)
