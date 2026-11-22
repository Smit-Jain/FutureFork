"""ITR helper API through the real HTTP stack: auth, CSRF, ownership, engine numbers, export."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from backend.auth import google
from backend.main import app

CSRF = {"X-FutureFork": "1"}

SALARIED_13L = {"basic_da": 600_000, "other_salary": 700_000, "tds": 20_000}


@pytest.fixture(scope="module")
def started():
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def fake_google(monkeypatch):
    def verify(token: str) -> google.GoogleIdentity:
        _, sub, email = token.split(":", 2)
        return google.GoogleIdentity(sub=sub, email=email, name=None, picture=None)

    monkeypatch.setattr(google, "verify_google_id_token", verify)


def client_for(sub: str) -> TestClient:
    c = TestClient(app, headers=CSRF)
    assert c.post("/auth/google", json={"credential": f"ok:{sub}:{sub}@example.com"}).status_code == 200
    return c


def test_tax_routes_need_a_session_and_csrf(started):
    anon = TestClient(app, headers=CSRF)
    assert anon.get("/tax/profiles").status_code == 401
    c = client_for("tax-csrf")
    no_header = TestClient(app, cookies=c.cookies)
    r = no_header.post("/tax/compute", json=SALARIED_13L)
    assert r.status_code == 403 and r.json()["detail"]["error"] == "CSRF_HEADER_MISSING"


def test_rules_lists_supported_years(started):
    body = client_for("tax-rules").get("/tax/rules").json()
    assert body["default_fy"] == "2025-26"
    fy = {y["fy"]: y for y in body["years"]}
    assert fy["2025-26"]["cap_80c"] == 150_000 and fy["2025-26"]["status"] == "filing"
    assert fy["2026-27"]["status"] == "planning"


def test_compute_returns_engine_numbers(started):
    r = client_for("tax-compute").post("/tax/compute", json=SALARIED_13L)
    assert r.status_code == 200, r.text
    body = r.json()
    # 13L salary, new regime: marginal relief → ₹26,000 (see engine/tests/test_tax.py)
    assert body["new"]["total_tax"] == 26_000
    assert body["form"]["form"] == "ITR-1"
    assert body["explanation"] is None  # preview skips the explainer


def test_invalid_inputs_are_422(started):
    c = client_for("tax-invalid")
    assert c.post("/tax/compute", json={"basic_da": -5}).status_code == 422
    r = c.post("/tax/compute", json={"gross_receipts": 10, "digital_receipts": 20, "taxpayer_type": "freelancer"})
    assert r.status_code == 422 and r.json()["detail"]["error"] == "INVALID_TAX_INPUTS"
    assert c.post("/tax/compute", json={"fy": "1999-00"}).status_code == 422


def test_save_list_update_export_delete(started):
    c = client_for("tax-owner")
    r = c.post("/tax/profiles", json={"inputs": SALARIED_13L})
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["label"] == "Salaried · FY 2025-26"
    assert p["report"]["new"]["total_tax"] == 26_000
    assert p["report"]["explanation"]["guard_passed"] is True
    assert p["report"]["explanation"]["source"] == "template"  # offline in tests

    items = c.get("/tax/profiles").json()["items"]
    assert items[0]["id"] == p["id"] and items[0]["form"] == "ITR-1"

    upd = c.put(f"/tax/profiles/{p['id']}", json={"label": "My return", "inputs": {**SALARIED_13L, "tds": 30_000}})
    assert upd.status_code == 200
    assert upd.json()["label"] == "My return"
    assert upd.json()["report"]["new"]["refund"] == 4_000

    exp = c.get(f"/tax/profiles/{p['id']}/export")
    assert exp.status_code == 200 and "attachment" in exp.headers["content-disposition"]
    assert exp.json()["tax"]["new"] == 26_000

    assert c.delete(f"/tax/profiles/{p['id']}").status_code == 204
    assert c.get(f"/tax/profiles/{p['id']}").status_code == 404


def test_other_users_cannot_see_or_change_a_profile(started):
    alice = client_for("tax-alice")
    pid = alice.post("/tax/profiles", json={"inputs": SALARIED_13L}).json()["id"]
    bob = client_for("tax-bob")
    assert bob.get(f"/tax/profiles/{pid}").status_code == 404
    assert bob.put(f"/tax/profiles/{pid}", json={"inputs": SALARIED_13L}).status_code == 404
    assert bob.get(f"/tax/profiles/{pid}/export").status_code == 404
    assert bob.delete(f"/tax/profiles/{pid}").status_code == 404
    assert all(i["id"] != pid for i in bob.get("/tax/profiles").json()["items"])
    assert alice.get(f"/tax/profiles/{pid}").status_code == 200
