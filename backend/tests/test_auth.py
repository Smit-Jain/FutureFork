"""
Authentication, sessions, CSRF, ownership and history, through the real HTTP stack (TestClient).
Google's token verification is replaced with a stub, so no network access or Google account is needed.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

from backend import settings
from backend.auth import google
from backend.main import app

CSRF = {"X-FutureFork": "1"}


@pytest.fixture(scope="module")
def started():
    with TestClient(app) as c:  # runs the lifespan once: migrations + sample seeding
        yield c


@pytest.fixture(autouse=True)
def fake_google(monkeypatch):
    """Tokens look like 'ok:<sub>:<email>'; anything else is rejected like a bad Google token."""

    def verify(token: str) -> google.GoogleIdentity:
        if token.startswith("ok:"):
            _, sub, email = token.split(":", 2)
            return google.GoogleIdentity(sub=sub, email=email, name=email.split("@")[0].title(), picture=None)
        if token == "unverified":
            raise google.GoogleTokenError("Your Google account's email address isn't verified.")
        raise google.GoogleTokenError("Google sign-in could not be verified: bad signature")

    monkeypatch.setattr(google, "verify_google_id_token", verify)


def client_for(sub: str, email: str) -> TestClient:
    c = TestClient(app, headers=CSRF)
    r = c.post("/auth/google", json={"credential": f"ok:{sub}:{email}"})
    assert r.status_code == 200, r.text
    return c


# ─── Sessions ────────────────────────────────────────────────────────────────

def test_api_requires_a_session(started):
    anon = TestClient(app, headers=CSRF)
    for path in ("/datasets", "/me/decisions", "/auth/me"):
        r = anon.get(path)
        assert r.status_code == 401, path
        assert r.json()["detail"]["error"] == "NOT_SIGNED_IN"
    assert anon.get("/health").status_code == 200
    assert anon.get("/auth/config").status_code == 200


def test_google_login_creates_user_and_sets_httponly_cookie(started):
    c = TestClient(app, headers=CSRF)
    r = c.post("/auth/google", json={"credential": "ok:sub-alice:alice@example.com"})
    assert r.status_code == 200
    user = r.json()
    assert user["email"] == "alice@example.com"
    cookie = r.headers["set-cookie"]
    assert settings.SESSION_COOKIE_NAME in cookie and "HttpOnly" in cookie and "samesite=lax" in cookie.lower()
    assert c.get("/auth/me").json()["id"] == user["id"]

    # Logging in again maps to the same account
    again = TestClient(app, headers=CSRF).post("/auth/google", json={"credential": "ok:sub-alice:alice@example.com"})
    assert again.json()["id"] == user["id"]


@pytest.mark.parametrize("credential", ["garbage", "unverified"])
def test_bad_google_tokens_are_rejected(started, credential):
    r = TestClient(app, headers=CSRF).post("/auth/google", json={"credential": credential})
    assert r.status_code == 401
    assert r.json()["detail"]["error"] == "GOOGLE_TOKEN_INVALID"
    assert settings.SESSION_COOKIE_NAME not in r.headers.get("set-cookie", "")


def test_expired_and_tampered_cookies_are_rejected(started):
    c = client_for("sub-exp", "exp@example.com")
    uid = c.get("/auth/me").json()["id"]
    past = datetime.now(timezone.utc) - timedelta(days=1)
    expired = jwt.encode({"sub": uid, "iat": past - timedelta(days=8), "exp": past}, settings.SESSION_SECRET, algorithm="HS256")
    forged = jwt.encode({"sub": uid, "exp": int(time.time()) + 3600}, "an-attacker-guess-that-is-not-the-real-secret-key", algorithm="HS256")
    for token in (expired, forged, "not-a-jwt"):
        probe = TestClient(app, headers=CSRF, cookies={settings.SESSION_COOKIE_NAME: token})
        assert probe.get("/auth/me").status_code == 401


def test_state_changing_requests_need_the_csrf_header(started):
    c = client_for("sub-csrf", "csrf@example.com")
    no_header = TestClient(app, cookies=c.cookies)
    r = no_header.post("/decisions", json={"text": "Buy a laptop for 1.2 lakh", "dataset_id": "sample_personal"})
    assert r.status_code == 403
    assert r.json()["detail"]["error"] == "CSRF_HEADER_MISSING"
    assert no_header.post("/auth/google", json={"credential": "ok:x:x@example.com"}).status_code == 403
    # reads don't need it
    assert no_header.get("/datasets").status_code == 200


def test_logout_clears_the_session(started):
    c = client_for("sub-out", "out@example.com")
    assert c.post("/auth/logout").status_code == 204
    assert c.get("/auth/me").status_code == 401


# ─── Ownership & history ─────────────────────────────────────────────────────

def test_decisions_are_private_and_samples_are_shared(started):
    alice = client_for("sub-own-a", "own-a@example.com")
    bob = client_for("sub-own-b", "own-b@example.com")

    # both see the shared samples
    for c in (alice, bob):
        ids = {d["id"] for d in c.get("/datasets").json()}
        assert {"sample_personal", "sample_institute", "sample_startup"} <= ids

    dec = alice.post("/decisions", json={"text": "Buy a laptop for 1.2 lakh next month, keep at least 50k", "dataset_id": "sample_personal"})
    assert dec.status_code == 201, dec.text
    did = dec.json()["id"]
    assert alice.post(f"/decisions/{did}/scenarios").status_code == 200

    # Bob can't see, run, compare, stress or branch Alice's decision; it looks like it doesn't exist
    assert bob.post(f"/decisions/{did}/scenarios").status_code == 404
    assert bob.post(f"/decisions/{did}/run").status_code == 404
    assert bob.get(f"/decisions/{did}/compare").status_code == 404
    assert bob.post(f"/decisions/{did}/stress", json={}).status_code == 404
    assert bob.post(f"/scenarios/{did}_baseline/branch", json={"name": "x", "change": {"type": "emi"}}).status_code == 404
    assert bob.get(f"/scenarios/{did}_baseline/result").status_code == 404


def test_history_lists_only_your_decisions_newest_first(started):
    carol = client_for("sub-hist-c", "hist-c@example.com")
    dave = client_for("sub-hist-d", "hist-d@example.com")
    first = carol.post("/decisions", json={"text": "Take a ₹2L vacation without dropping below ₹50k reserve", "dataset_id": "sample_personal"}).json()
    time.sleep(1.1)  # created_at has second resolution on SQLite
    second = carol.post("/decisions", json={"text": "Add a ₹15k/month gym subscription", "dataset_id": "sample_personal"}).json()

    items = carol.get("/me/decisions").json()["items"]
    assert [i["id"] for i in items][:2] == [second["id"], first["id"]]
    assert items[0]["dataset_name"].startswith("Sample: Personal")
    assert items[0]["decision_kind"] == "recurring_expense" and items[0]["understood"]
    assert items[0]["run_status"] is None
    assert dave.get("/me/decisions").json()["items"] == []


def test_uploaded_datasets_are_private(started):
    erin = client_for("sub-up-e", "up-e@example.com")
    frank = client_for("sub-up-f", "up-f@example.com")
    csv = b"Date,Description,Amount\n2024-01-05,Salary,50000\n2024-01-10,Rent,-15000\n2024-02-05,Salary,50000\n2024-02-10,Rent,-15000\n"
    insp = erin.post("/datasets/inspect", files={"file": ("mine.csv", csv, "text/csv")}).json()
    # Frank can't commit Erin's upload
    r = frank.post("/datasets/commit", json={"upload_id": insp["upload_id"], "confirmed_mapping": insp["proposed_mapping"]})
    assert r.status_code == 404
    ds = erin.post("/datasets/commit", json={"upload_id": insp["upload_id"], "confirmed_mapping": insp["proposed_mapping"]}).json()
    assert ds["dataset_id"] in {d["id"] for d in erin.get("/datasets").json()}
    assert ds["dataset_id"] not in {d["id"] for d in frank.get("/datasets").json()}
    assert frank.get(f"/datasets/{ds['dataset_id']}").status_code == 404


# ─── Dev login & configuration ───────────────────────────────────────────────

def test_dev_login_only_when_enabled(started, monkeypatch):
    c = TestClient(app, headers=CSRF)
    monkeypatch.setattr(settings, "AUTH_DEV_LOGIN", False)
    assert c.post("/auth/dev-login", json={}).status_code == 404
    assert c.get("/auth/config").json()["dev_login"] is False
    monkeypatch.setattr(settings, "AUTH_DEV_LOGIN", True)
    r = c.post("/auth/dev-login", json={"email": "dev@futurefork.local"})
    assert r.status_code == 200 and r.json()["email"] == "dev@futurefork.local"
    assert c.get("/auth/me").status_code == 200


def test_production_requires_auth_settings(monkeypatch):
    monkeypatch.setattr(settings, "IS_PRODUCTION", True)
    monkeypatch.setattr(settings, "SESSION_SECRET", "")
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    with pytest.raises(RuntimeError, match="SESSION_SECRET"):
        settings.validate_auth_settings()
    monkeypatch.setattr(settings, "SESSION_SECRET", "x" * 40)
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "id.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "COOKIE_SAMESITE", "none")
    monkeypatch.setattr(settings, "COOKIE_SECURE", False)
    with pytest.raises(RuntimeError, match="COOKIE_SECURE"):
        settings.validate_auth_settings()


def test_real_verifier_refuses_when_unconfigured(monkeypatch):
    from importlib import reload

    real = reload(google)  # the un-stubbed module function
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")
    with pytest.raises(real.GoogleTokenError, match="isn't configured"):
        real.verify_google_id_token("anything")
