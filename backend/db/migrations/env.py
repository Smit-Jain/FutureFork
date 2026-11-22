"""
Alembic environment for FutureFork.

Uses the application's own engine (backend.db.session), so migrations always target the same
DATABASE_URL as the app, loaded from the environment / .env by backend.settings.
"""

from __future__ import annotations

import logging.config
import sys
from pathlib import Path

from alembic import context

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend import settings  # noqa: E402,F401  (loads .env before the engine is created)
from backend.db import models  # noqa: E402,F401  (registers every table on Base.metadata)
from backend.db.session import DATABASE_URL, Base, engine  # noqa: E402

config = context.config
# Only configure logging when run from the CLI; inside the app the app's logging stays in charge.
if config.config_file_name and not config.attributes.get("embedded"):
    logging.config.fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=DATABASE_URL.startswith("sqlite"),
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def _run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # A caller (e.g. a test) may hand us its own connection; otherwise use the app's engine.
    supplied = config.attributes.get("connection")
    if supplied is not None:
        _run(supplied)
        return
    with engine.connect() as connection:
        _run(connection)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
