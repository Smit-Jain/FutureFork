"""ITR helper: saved tax profiles per user.

Idempotent like 0001/0002: only creates the table if it is missing.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "tax_profiles" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "tax_profiles",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("fy", sa.String(10), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("inputs", sa.JSON(), nullable=False),
        sa.Column("report", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_tax_profiles_user_id", "tax_profiles", ["user_id"])
    op.create_index("ix_tax_profiles_updated_at", "tax_profiles", ["updated_at"])


def downgrade() -> None:
    op.drop_index("ix_tax_profiles_updated_at", table_name="tax_profiles")
    op.drop_index("ix_tax_profiles_user_id", table_name="tax_profiles")
    op.drop_table("tax_profiles")
