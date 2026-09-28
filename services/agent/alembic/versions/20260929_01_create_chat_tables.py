"""create persistent chat tables

Revision ID: 20260929_01
Revises:
Create Date: 2026-09-29
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260929_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_sessions",
        sa.Column("session_id", sa.String(length=80), primary_key=True),
        sa.Column("title", sa.String(length=200), nullable=False, server_default="New investigation"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("pending_approval_details", postgresql.JSONB(), nullable=True),
    )
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.String(length=80), sa.ForeignKey("chat_sessions.session_id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tools_executed", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("metadata", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("role IN ('user', 'assistant')", name="ck_chat_messages_role"),
    )
    op.create_index("ix_chat_messages_session_id", "chat_messages", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_session_id", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_table("chat_sessions")
