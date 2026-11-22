"""
Session cookie: a short HS256 JWT ({sub: user id, exp, iat}) in an httpOnly cookie.

httpOnly keeps it away from page JavaScript; SameSite=Lax (default) stops it being sent on
cross-site POSTs; every state-changing request must also carry the X-FutureFork header (see deps.py).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Response

from backend import settings

ALGORITHM = "HS256"


def issue_session_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(days=settings.SESSION_TTL_DAYS)}
    return jwt.encode(payload, settings.SESSION_SECRET, algorithm=ALGORITHM)


def read_session_token(token: Optional[str]) -> Optional[str]:
    """Returns the user id from a valid, unexpired token, else None."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SESSION_SECRET, algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
    except jwt.PyJWTError:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) and sub else None


def set_session_cookie(response: Response, user_id: str) -> None:
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=issue_session_token(user_id),
        max_age=settings.SESSION_TTL_DAYS * 24 * 3600,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,  # type: ignore[arg-type]
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,  # type: ignore[arg-type]
    )
