"""User accounts (Google Sign-In) and per-user ownership of datasets, uploads and decisions.

Idempotent like 0001: only creates what is missing. Uses batch mode so SQLite can add the
foreign-key columns.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

OWNED = ("uploads", "datasets", "decisions")


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "users" not in insp.get_table_names():
        op.create_table(
            "users",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("google_sub", sa.String(255), nullable=False),
            sa.Column("email", sa.String(320), nullable=False),
            sa.Column("name", sa.String(255), nullable=True),
            sa.Column("picture", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("last_login_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index("ix_users_google_sub", "users", ["google_sub"], unique=True)
        op.create_index("ix_users_email", "users", ["email"])

    for table in OWNED:
        cols = {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}
        if "user_id" in cols:
            continue
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("user_id", sa.String(64), nullable=True))
            batch.create_foreign_key(f"fk_{table}_user_id", "users", ["user_id"], ["id"], ondelete="CASCADE")
            batch.create_index(f"ix_{table}_user_id", ["user_id"])

    existing = {ix["name"] for ix in sa.inspect(op.get_bind()).get_indexes("decisions")}
    if "ix_decisions_created_at" not in existing:
        op.create_index("ix_decisions_created_at", "decisions", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_decisions_created_at", table_name="decisions")
    for table in OWNED:
        with op.batch_alter_table(table) as batch:
            batch.drop_index(f"ix_{table}_user_id")
            batch.drop_constraint(f"fk_{table}_user_id", type_="foreignkey")
            batch.drop_column("user_id")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_google_sub", table_name="users")
    op.drop_table("users")
