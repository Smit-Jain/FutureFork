"""
FutureFork backend settings, read once from the environment (and `.env` if present).
"""

from __future__ import annotations

import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT.lower() == "production"

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000",
    ).split(",")
    if o.strip()
]

NUM_SIMULATION_RUNS = int(os.getenv("NUM_SIMULATION_RUNS", "300"))
RANDOM_SEED = int(os.getenv("RANDOM_SEED", "42"))
CACHE_ENABLED = _bool("CACHE_ENABLED", True)

# --- Authentication (Google Sign-In + signed session cookie) ---
# OAuth "Web application" client ID from Google Cloud Console. No client secret is needed:
# the browser gets an ID token from Google and the backend verifies it.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()

# Signs the session cookie. Must be set (and stable) in production; a random one is
# generated in development, which signs everyone out on restart.
SESSION_SECRET = os.getenv("SESSION_SECRET", "").strip()
if not SESSION_SECRET and not IS_PRODUCTION:
    SESSION_SECRET = secrets.token_urlsafe(48)
    logging.getLogger("futurefork.settings").warning(
        "SESSION_SECRET is not set; using a random one (sessions end when the server restarts)."
    )

SESSION_COOKIE_NAME = "ff_session"
SESSION_TTL_DAYS = int(os.getenv("SESSION_TTL_DAYS", "7"))
COOKIE_SECURE = _bool("COOKIE_SECURE", IS_PRODUCTION)
# "lax" when frontend and API share a site; "none" (with COOKIE_SECURE) for separate domains
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax").strip().lower()

# Development-only shortcut: POST /auth/dev-login signs in a local test user without Google.
# Never honoured in production.
AUTH_DEV_LOGIN = _bool("AUTH_DEV_LOGIN", False) and not IS_PRODUCTION

# Header every state-changing request must carry (CSRF defence for cookie auth)
CSRF_HEADER = "X-FutureFork"


def validate_auth_settings() -> None:
    """Fail fast in production when auth isn't configured."""
    if IS_PRODUCTION:
        missing = [n for n, v in (("SESSION_SECRET", SESSION_SECRET), ("GOOGLE_CLIENT_ID", GOOGLE_CLIENT_ID)) if not v]
        if missing:
            raise RuntimeError(f"Missing required settings for production: {', '.join(missing)}")
        if COOKIE_SAMESITE == "none" and not COOKIE_SECURE:
            raise RuntimeError("COOKIE_SAMESITE=none requires COOKIE_SECURE=1")
