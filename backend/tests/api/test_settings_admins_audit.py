"""Settings, alert rules, audit query, admin-account CRUD (docs/03)."""

from __future__ import annotations

from httpx import AsyncClient

from openredius.models import AdminRole
from tests.conftest import create_admin_user

OPERATOR_PW = "Operator-Password-1"
AUDITOR_PW = "Auditor-Password-1"


async def _token(client: AsyncClient, username: str, password: str) -> str:
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


# ------------------------------------------------------------ settings ----


async def test_settings_defaults_and_update(client, admin_headers):
    resp = await client.get("/api/settings", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["radius_auth_port"] == 1812

    body = {
        "radius_auth_port": 1812,
        "radius_acct_port": 1813,
        "coa_port": 3799,
        "alerts_enabled": False,
        "audit_enabled": True,
    }
    # Non-core change needs no confirm.
    resp = await client.put("/api/settings", json=body, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["radius_reload_required"] is False
    assert resp.json()["settings"]["alerts_enabled"] is False


async def test_settings_core_port_requires_confirm(client, admin_headers):
    body = {
        "radius_auth_port": 11812,
        "radius_acct_port": 1813,
        "coa_port": 3799,
        "alerts_enabled": True,
        "audit_enabled": True,
    }
    resp = await client.put("/api/settings", json=body, headers=admin_headers)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "confirm_required"

    resp = await client.put("/api/settings", json=dict(body, confirm=True), headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["radius_reload_required"] is True
    assert resp.json()["settings"]["radius_auth_port"] == 11812


async def test_alert_rules_roundtrip(client, admin_headers):
    resp = await client.put(
        "/api/settings/alert-rules",
        json={"rules": [{"key": "nas_offline", "enabled": False, "threshold": {"minutes": 10}}]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    resp = await client.get("/api/settings/alert-rules", headers=admin_headers)
    rules = resp.json()
    assert rules == [{"key": "nas_offline", "enabled": False, "threshold": {"minutes": 10}}]


# --------------------------------------------------------------- audit ----


async def test_audit_filters_and_rbac(client, domain, admin_headers):
    await client.post(
        "/api/users/status",
        json={"accounts": ["zhou.ting"], "action": "enable"},
        headers=admin_headers,
    )
    resp = await client.get("/api/audit?action=user.status&actor=admin", headers=admin_headers)
    body = resp.json()
    assert body["total"] >= 1
    assert all(item["action"] == "user.status" for item in body["items"])

    await create_admin_user("op1", OPERATOR_PW, AdminRole.OPERATOR)
    op_token = await _token(client, "op1", OPERATOR_PW)
    resp = await client.get("/api/audit", headers={"Authorization": f"Bearer {op_token}"})
    assert resp.status_code == 403

    await create_admin_user("aud1", AUDITOR_PW, AdminRole.AUDITOR)
    aud_token = await _token(client, "aud1", AUDITOR_PW)
    resp = await client.get("/api/audit", headers={"Authorization": f"Bearer {aud_token}"})
    assert resp.status_code == 200


async def test_audit_export_csv_serializes_detail(client, domain, admin_headers):
    """Regression: detail_json is a JSON column (dict); CSV export must not 500."""
    await client.post(
        "/api/users/status",
        json={"accounts": ["zhou.ting"], "action": "enable"},
        headers=admin_headers,
    )
    resp = await client.get("/api/audit/export.csv", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert "user.status" in resp.text


# -------------------------------------------------------------- admins ----


async def test_admin_crud_flow(client, admin_headers):
    resp = await client.post(
        "/api/auth/admins",
        json={"username": "op2", "password": OPERATOR_PW, "role": "operator"},
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    admin_id = resp.json()["id"]

    resp = await client.post(
        "/api/auth/admins",
        json={"username": "op2", "password": OPERATOR_PW, "role": "operator"},
        headers=admin_headers,
    )
    assert resp.status_code == 409

    resp = await client.patch(
        f"/api/auth/admins/{admin_id}", json={"display_name": "二号"}, headers=admin_headers
    )
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "二号"

    resp = await client.delete(f"/api/auth/admins/{admin_id}", headers=admin_headers)
    assert resp.status_code == 204


async def test_last_active_admin_protected(client, admin_headers):
    # Bootstrap admin is the only active admin: demote/disable/delete blocked.
    me = (await client.get("/api/auth/me", headers=admin_headers)).json()
    admins = (await client.get("/api/auth/admins", headers=admin_headers)).json()
    me_id = next(a["id"] for a in admins if a["username"] == me["username"])

    resp = await client.patch(
        f"/api/auth/admins/{me_id}", json={"role": "operator"}, headers=admin_headers
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "last_active_admin"

    resp = await client.patch(
        f"/api/auth/admins/{me_id}", json={"status": "disabled"}, headers=admin_headers
    )
    assert resp.status_code == 409


async def test_admin_update_writes_audit(client, admin_headers):
    await client.post(
        "/api/auth/admins",
        json={"username": "op3", "password": OPERATOR_PW, "role": "operator"},
        headers=admin_headers,
    )
    audit = (await client.get("/api/audit?action=admin.create", headers=admin_headers)).json()
    assert audit["total"] == 1
    assert audit["items"][0]["target_id"] == "op3"


async def test_admin_endpoints_admin_only(client, domain):
    await create_admin_user("op1", OPERATOR_PW, AdminRole.OPERATOR)
    op_token = await _token(client, "op1", OPERATOR_PW)
    headers = {"Authorization": f"Bearer {op_token}"}
    assert (await client.get("/api/auth/admins", headers=headers)).status_code == 403
    assert (
        await client.post(
            "/api/auth/admins",
            json={"username": "x1", "password": OPERATOR_PW},
            headers=headers,
        )
    ).status_code == 403
    assert (await client.get("/api/settings", headers=headers)).status_code == 403
