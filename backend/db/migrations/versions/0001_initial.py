"""Initial schema: the tables FutureFork had before user accounts.

Idempotent: tables that already exist (e.g. created earlier by Base.metadata.create_all) are left alone,
so existing local databases can be brought under Alembic with a plain `alembic upgrade head`.

Revision ID: 0001
Revises:
Create Date: 2026-11-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def _create(name: str, *cols: sa.Column) -> None:
    if name not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(name, *cols)


def upgrade() -> None:
    _create(
        "uploads",
        sa.Column("upload_id", sa.String(100), primary_key=True, index=True),
        sa.Column("filename", sa.String(500), nullable=True),
        sa.Column("csv_bytes", sa.Text(), nullable=False),
        sa.Column("preview_rows", sa.JSON(), nullable=True),
        sa.Column("column_mapping", sa.JSON(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    _create(
        "datasets",
        sa.Column("id", sa.String(100), primary_key=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("stats", sa.JSON(), nullable=False),
        sa.Column("baseline_metrics", sa.JSON(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    _create(
        "decisions",
        sa.Column("id", sa.String(100), primary_key=True, index=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("dataset_id", sa.String(100), nullable=False, index=True),
        sa.Column("status", sa.String(50), server_default="ok"),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("spec", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    _create(
        "scenarios",
        sa.Column("id", sa.String(100), primary_key=True, index=True),
        sa.Column("decision_id", sa.String(100), nullable=False, index=True),
        sa.Column("parent_id", sa.String(100), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("change", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(50), server_default="queued"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    _create(
        "runs",
        sa.Column("id", sa.String(100), primary_key=True, index=True),
        sa.Column("decision_id", sa.String(100), nullable=False, index=True),
        sa.Column("overall_status", sa.String(50), server_default="queued"),
        sa.Column("progress_percent", sa.Float(), server_default="0"),
        sa.Column("scenario_statuses", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    _create(
        "results",
        sa.Column("scenario_id", sa.String(100), primary_key=True, index=True),
        sa.Column("decision_id", sa.String(100), nullable=True, index=True),
        sa.Column("branch_type", sa.String(50), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    _create(
        "cache",
        sa.Column("cache_key", sa.String(255), primary_key=True, index=True),
        sa.Column("result", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    for name in ("cache", "results", "runs", "scenarios", "decisions", "datasets", "uploads"):
        op.drop_table(name)
