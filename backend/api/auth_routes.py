"""
Authentication endpoints (public; everything else requires a session).

  GET  /auth/config     Google client ID + whether dev login is enabled (for the sign-in page)
  POST /auth/google     exchange a Google ID token for a session cookie
  GET  /auth/me         the signed-in user (401 if none)
  POST /auth/logout     clear the session cookie
  POST /auth/dev-login  development only: sign in a local test user without Google
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend import settings
from backend.auth import google
from backend.auth.deps import check_csrf, require_user
from backend.auth.session import clear_session_cookie, set_session_cookie
from backend.db.models import UserModel
from backend.db.repository import Repository
from backend.db.session import get_db
from contracts.schemas import AuthConfig, User

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleLoginRequest(BaseModel):
    credential: str = Field(..., description="ID token from Google Identity Services")


class DevLoginRequest(BaseModel):
    email: str = Field("dev@futurefork.local", description="Any address; one local user per address")
    name: str = Field("Local Developer")


def to_user(u: UserModel) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "picture": u.picture}


@router.get("/config", response_model=AuthConfig)
def auth_config():
    return {"google_client_id": settings.GOOGLE_CLIENT_ID or None, "dev_login": settings.AUTH_DEV_LOGIN}


@router.post("/google", response_model=User)
def login_with_google(req: GoogleLoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    check_csrf(request)
    try:
        ident = google.verify_google_id_token(req.credential)
    except google.GoogleTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "GOOGLE_TOKEN_INVALID", "message": str(exc)}) from exc
    user = Repository(db).upsert_google_user(ident.sub, ident.email, ident.name, ident.picture)
    set_session_cookie(response, user.id)
    return to_user(user)


@router.post("/dev-login", response_model=User)
def dev_login(request: Request, response: Response, req: DevLoginRequest | None = None, db: Session = Depends(get_db)):
    if not settings.AUTH_DEV_LOGIN:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "NOT_FOUND", "message": "Not found"})
    check_csrf(request)
    req = req or DevLoginRequest()
    email = req.email.strip().lower()
    user = Repository(db).upsert_google_user(f"dev:{email}", email, req.name, None)
    set_session_cookie(response, user.id)
    return to_user(user)


@router.get("/me", response_model=User)
def me(user: UserModel = Depends(require_user)):
    return to_user(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response):
    check_csrf(request)
    clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
