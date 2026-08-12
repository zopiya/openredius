"""Session endpoints: list/detail/export/disconnect (docs/03, 09 场景 13 单测层)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from openredius.core.config import Settings
from openredius.radius.coa import CoaOutcome
from tests.conftest import BOOTSTRAP_PASSWORD, BOOTSTRAP_USER
from tests.radius_helpers import create_radius_tables, insert_session


@pytest.fixture
def settings() -> Settings:
    return Settings(
        env="dev",
        database_url="sqlite+aiosqlite:///:memory:",
        jwt_secret="test-secret-" + "x" * 24,
        jwt_access_ttl="15m",
        jwt_refresh_ttl="7d",
        bootstrap_admin_user=BOOTSTRAP_USER,
        bootstrap_admin_password=BOOTSTRAP_PASSWORD,
        radius_coa_close_poll_s=0.2,
        radius_coa_timeout=0.2,
        _env_file=None,
    )


@pytest.fixture
async def seeded(client: AsyncClient, domain, admin_headers):
    await create_radius_tables()
    await insert_session(unique_id="U-001", username="wang.lei")
    await insert_session(
        unique_id="U-002",
        username="wang.lei",
        nas_ip="10.99.0.30",
        mac="A4:83:E7:22:9C:7E",
        nas_port_type="Wireless-802.11",
        started_minutes_ago=5,
        ip="10.10.5.87",
    )
    await insert_session(unique_id="U-003", username="ghost.user", stopped=True)
    return admin_headers


async def test_list_sessions_shape(client: AsyncClient, seeded):
    resp = await client.get("/api/sessions", headers=seeded)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2  # only active rows
    first = body["items"][0]
    assert first["acct_unique_id"] in {"U-001", "U-002"}
    # joined metadata present
    assert first["name"] == "王磊"
    assert first["dept"] == "研发中心"
    assert first["vlan_label"] == "20 · 研发"
    assert first["auth_method"] == "EAP-TLS"
    assert first["status"] == "online"
    assert first["duration_s"] > 0


async def test_list_sessions_filters(client: AsyncClient, seeded):
    resp = await client.get("/api/sessions?method=wifi", headers=seeded)
    items = resp.json()["items"]
    assert len(items) == 1 and items[0]["acct_unique_id"] == "U-002"
    assert items[0]["method"] == "WiFi"

    resp = await client.get("/api/sessions?vlan=20", headers=seeded)
    assert resp.json()["total"] == 2
    resp = await client.get("/api/sessions?vlan=99", headers=seeded)
    assert resp.json()["total"] == 0
    resp = await client.get("/api/sessions?vlan=abc", headers=seeded)
    assert resp.status_code == 422

    resp = await client.get("/api/sessions?nas=SW-3F-01", headers=seeded)
    assert resp.json()["total"] == 1
    resp = await client.get("/api/sessions?q=10.10.5.87", headers=seeded)
    assert resp.json()["total"] == 1
    resp = await client.get("/api/sessions?auth=EAP-TLS", headers=seeded)
    assert resp.json()["total"] == 2
    resp = await client.get("/api/sessions?method=bogus", headers=seeded)
    assert resp.status_code == 422


async def test_session_detail_and_missing(client: AsyncClient, seeded):
    resp = await client.get("/api/sessions/U-003", headers=seeded)  # stopped row visible
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["attributes"]["acctterminatecause"] == "User-Request"
    assert detail["attributes"]["radacctid"] is not None

    resp = await client.get("/api/sessions/nope", headers=seeded)
    assert resp.status_code == 404


async def test_export_csv(client: AsyncClient, seeded):
    resp = await client.get("/api/sessions/export.csv", headers=seeded)
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    lines = resp.text.strip().splitlines()
    assert lines[0].startswith("acct_unique_id,")
    assert len(lines) == 3  # header + 2 active rows

    audit = (await client.get("/api/audit?action=session.export_csv", headers=seeded)).json()
    assert audit["total"] == 1


async def test_disconnect_requires_confirm(client: AsyncClient, seeded):
    resp = await client.post(
        "/api/sessions/disconnect",
        headers=seeded,
        json={"session_ids": ["U-001"], "confirm": False},
    )
    assert resp.status_code == 422
    resp = await client.post(
        "/api/sessions/disconnect", headers=seeded, json={"session_ids": [], "confirm": True}
    )
    assert resp.status_code == 422


async def test_disconnect_ack_fallback_close(client: AsyncClient, seeded, monkeypatch):
    async def fake_coa(**kwargs):
        return CoaOutcome(status="ack")

    monkeypatch.setattr("openredius.api.sessions.disconnect_session", fake_coa)
    resp = await client.post(
        "/api/sessions/disconnect",
        headers=seeded,
        json={"session_ids": ["U-001", "missing"], "confirm": True},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["disconnected"] == 1
    assert body["failed"] == [{"id": "missing", "reason": "not-found-or-not-active"}]

    # NAS never stopped it -> backend closed after poll timeout.
    detail = (await client.get("/api/sessions/U-001", headers=seeded)).json()
    assert detail["attributes"]["acctterminatecause"] == "Admin-Reset"
    assert detail["attributes"]["connectinfo_stop"] == "backend-closed"

    audit = (await client.get("/api/audit?action=session.disconnect", headers=seeded)).json()
    assert audit["total"] == 2
    results = {i["detail"]["acct_unique_id"]: i["detail"]["result"] for i in audit["items"]}
    assert results == {"U-001": "ack", "missing": "not-found-or-not-active"}


async def test_disconnect_nak_reports_error_cause(client: AsyncClient, seeded, monkeypatch):
    async def fake_coa(**kwargs):
        return CoaOutcome(status="nak", error_cause="session-context-not-found")

    monkeypatch.setattr("openredius.api.sessions.disconnect_session", fake_coa)
    resp = await client.post(
        "/api/sessions/disconnect",
        headers=seeded,
        json={"session_ids": ["U-001"], "confirm": True},
    )
    body = resp.json()
    assert body["disconnected"] == 0
    assert body["failed"] == [{"id": "U-001", "reason": "session-context-not-found"}]
    # row still active (NAK must not close)
    assert (await client.get("/api/sessions", headers=seeded)).json()["total"] == 2


async def test_sessions_empty_without_radius_tables(client: AsyncClient, admin_headers, domain):
    resp = await client.get("/api/sessions", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json() == {"items": [], "total": 0, "page": 1, "size": 50}
    assert (await client.get("/api/sessions/export.csv", headers=admin_headers)).text.count(
        "\n"
    ) == 1  # header only


async def test_auditor_can_read_but_not_disconnect(client: AsyncClient, seeded):
    from openredius.models import AdminRole
    from tests.conftest import create_admin_user

    await create_admin_user("aud1", "Auditor-Password-1", AdminRole.AUDITOR)
    login = await client.post(
        "/api/auth/login", json={"username": "aud1", "password": "Auditor-Password-1"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await client.get("/api/sessions", headers=headers)).status_code == 200
    resp = await client.post(
        "/api/sessions/disconnect",
        headers=headers,
        json={"session_ids": ["U-001"], "confirm": True},
    )
    assert resp.status_code == 403


async def test_nas_status_derived(client: AsyncClient, seeded):
    # Fresh session makes 10.99.0.11 recently active.
    await insert_session(unique_id="U-FRESH", username="wang.lei", started_minutes_ago=0.5)
    resp = await client.get("/api/devices/nas", headers=seeded)
    items = {i["name"]: i for i in resp.json()["items"]}
    sw = items["SW-3F-01"]
    assert sw["status"] == "online"
    assert sw["active_sessions"] == 2
    assert sw["last_seen"] is not None

    resp = await client.get("/api/devices/nas?status=online", headers=seeded)
    assert all(i["status"] == "online" for i in resp.json()["items"])
    resp = await client.get("/api/devices/nas?status=bogus", headers=seeded)
    assert resp.status_code == 422
