"""
FastAPI dependencies for the signed-in user.

`require_user` protects every API route except /health, /ping and /auth/*:
  - the session cookie must hold a valid token for an existing user (else 401), and
  - state-changing requests (POST/PUT/PATCH/DELETE) must send the X-FutureFork header (else 403).
    Browsers only add custom headers from our own origin (CORS blocks others), so a cross-site
    form or image can't forge a request with the user's cookie.
"""

from __future__ import annotations

from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend import settings
from backend.auth.session import read_session_token
from backend.db.models import UserModel
from backend.db.repository import Repository
from backend.db.session import get_db

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def check_csrf(request: Request) -> None:
    if request.method in UNSAFE_METHODS and request.headers.get(settings.CSRF_HEADER) != "1":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": "CSRF_HEADER_MISSING", "message": f"Missing {settings.CSRF_HEADER} header."},
        )


def optional_user(request: Request, db: Session = Depends(get_db)) -> Optional[UserModel]:
    user_id = read_session_token(request.cookies.get(settings.SESSION_COOKIE_NAME))
    return Repository(db).get_user(user_id) if user_id else None


def require_user(request: Request, db: Session = Depends(get_db)) -> UserModel:
    check_csrf(request)
    user = optional_user(request, db)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "NOT_SIGNED_IN", "message": "Please sign in to continue."},
        )
    return user
