"""
Alembic migrations: a fresh database upgrades to head, and a database created the old way
(Base.metadata.create_all, before user accounts) is brought up to date without losing rows.
Each test uses its own throwaway SQLite file.
"""

from __future__ import annotations

from pathlib import Path

import sqlalchemy as sa
from alembic import command
from alembic.config import Config

ROOT = Path(__file__).resolve().parents[2]


def _upgrade(engine: sa.Engine) -> None:
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "backend" / "db" / "migrations"))
    cfg.attributes["embedded"] = True
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")


def test_fresh_database_upgrades_to_head(tmp_path):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'fresh.db'}")
    _upgrade(engine)
    insp = sa.inspect(engine)
    tables = set(insp.get_table_names())
    assert {"users", "uploads", "datasets", "decisions", "scenarios", "runs", "results", "cache", "tax_profiles", "alembic_version"} <= tables
    for t in ("uploads", "datasets", "decisions"):
        assert "user_id" in {c["name"] for c in insp.get_columns(t)}
    with engine.connect() as c:
        assert c.execute(sa.text("select version_num from alembic_version")).scalar() == "0003"
    _upgrade(engine)  # running again is a no-op


def test_pre_accounts_database_is_upgraded_in_place(tmp_path):
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as c:  # the shape create_all produced before accounts existed
        c.execute(sa.text("create table decisions (id varchar(100) primary key, text text not null, dataset_id varchar(100) not null, "
                          "status varchar(50), message text, spec json not null, created_at datetime)"))
        c.execute(sa.text("create table datasets (id varchar(100) primary key, name varchar(255) not null, description text, "
                          "stats json not null, baseline_metrics json not null, payload json, created_at datetime)"))
        c.execute(sa.text("insert into decisions (id, text, dataset_id, status, spec) values ('dec_old', 'old one', 'sample_personal', 'ok', '{}')"))
    _upgrade(engine)
    insp = sa.inspect(engine)
    assert "users" in insp.get_table_names()
    assert "user_id" in {c["name"] for c in insp.get_columns("decisions")}
    with engine.connect() as c:
        row = c.execute(sa.text("select id, user_id from decisions")).one()
    assert row == ("dec_old", None)  # kept, with no owner
