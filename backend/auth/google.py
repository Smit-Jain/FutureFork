"""
Verifies Google Sign-In ID tokens.

The browser gets an ID token (a JWT signed by Google) from Google Identity Services and posts it
to /auth/google. We check its signature against Google's published keys, the audience (our
OAuth client ID), the issuer, expiry and that the email is verified. No client secret is involved.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from backend import settings

GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


class GoogleTokenError(ValueError):
    """The ID token is missing, invalid, expired, for another app, or the email isn't verified."""


@dataclass
class GoogleIdentity:
    sub: str
    email: str
    name: Optional[str]
    picture: Optional[str]


def verify_google_id_token(token: str) -> GoogleIdentity:
    if not settings.GOOGLE_CLIENT_ID:
        raise GoogleTokenError("Google Sign-In isn't configured on this server (GOOGLE_CLIENT_ID is not set).")
    if not token:
        raise GoogleTokenError("Missing Google credential.")

    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        info = id_token.verify_oauth2_token(token, google_requests.Request(), settings.GOOGLE_CLIENT_ID, clock_skew_in_seconds=10)
    except ValueError as exc:  # bad signature, wrong audience, expired, malformed
        raise GoogleTokenError(f"Google sign-in could not be verified: {exc}") from exc

    if info.get("iss") not in GOOGLE_ISSUERS:
        raise GoogleTokenError("Token was not issued by Google.")
    if not info.get("email") or not info.get("email_verified"):
        raise GoogleTokenError("Your Google account's email address isn't verified.")
    return GoogleIdentity(sub=str(info["sub"]), email=info["email"], name=info.get("name"), picture=info.get("picture"))
