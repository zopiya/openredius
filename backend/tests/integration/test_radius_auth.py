"""Stack integration: real RADIUS auth flows (docs/09 scenarios 9–11).

Dataset: scripts/seed_demo.py (li.na → staff/VLAN10, wang.lei → rd/VLAN20
with mac+cert flags; radtest sends no Calling-Station-Id so mac-binding is
only enforced for requests that carry one, e.g. radclient).
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from tests.integration.conftest import (
    SEED_PASSWORD,
    last_postauth_class,
    radclient,
    radtest,
)

pytestmark = pytest.mark.integration

_WANG_BOUND_MAC = "3C:52:82:1A:4B:01"


# ------------------------------------------------------------- scenario 9


def test_radtest_accept_with_vlan() -> None:
    """radtest 正常账号 → Access-Accept 且携带 Tunnel-Private-Group-Id."""
    out = radtest("li.na")
    assert "Received Access-Accept" in out
    assert 'Tunnel-Private-Group-Id:0 = "10"' in out


def test_radtest_mac_flagged_user_without_csid_accepts() -> None:
    # radtest carries no Calling-Station-Id → mac-binding not enforceable.
    out = radtest("wang.lei")
    assert "Received Access-Accept" in out
    assert 'Tunnel-Private-Group-Id:0 = "20"' in out


def test_radclient_bound_mac_accepts() -> None:
    out = radclient(
        {
            "User-Name": "wang.lei",
            "User-Password": SEED_PASSWORD,
            "Calling-Station-Id": _WANG_BOUND_MAC,
        }
    )
    assert "Received Access-Accept" in out
    assert 'Tunnel-Private-Group-Id:0 = "20"' in out


async def test_radclient_unbound_mac_rejects() -> None:
    out = radclient(
        {
            "User-Name": "wang.lei",
            "User-Password": SEED_PASSWORD,
            "Calling-Station-Id": "AA:BB:CC:DD:EE:FF",
        }
    )
    assert "Received Access-Reject" in out
    assert "拒绝接入:该终端未绑定到当前账号" in out
    assert await last_postauth_class("wang.lei") == "reason=mac-unbound"


# ------------------------------------------------------------ scenario 10


async def test_disabled_account_rejects(client: AsyncClient, admin_headers) -> None:
    resp = await client.post(
        "/api/users/status",
        json={"accounts": ["wang.lei"], "action": "disable"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    try:
        out = radtest("wang.lei")
        assert "Received Access-Reject" in out
        assert await last_postauth_class("wang.lei") == "reason=account-disabled"
    finally:
        resp = await client.post(
            "/api/users/status",
            json={"accounts": ["wang.lei"], "action": "enable"},
            headers=admin_headers,
        )
        assert resp.status_code == 200
    assert "Received Access-Accept" in radtest("wang.lei")


async def test_locked_account_rejects_with_class(client: AsyncClient, admin_headers) -> None:
    from sqlalchemy import text

    from openredius.core.db import get_session_factory

    factory = get_session_factory()

    async def set_status(status: str) -> None:
        async with factory() as session:
            await session.execute(
                text("UPDATE access_user SET status = :s WHERE account = 'wang.lei'"),
                {"s": status},
            )
            await session.commit()

    await set_status("locked")
    try:
        resp = await client.post("/api/ops/compile", headers=admin_headers)
        assert resp.status_code == 200
        out = radtest("wang.lei")
        assert "Received Access-Reject" in out
        assert await last_postauth_class("wang.lei") == "reason=account-locked"
    finally:
        await set_status("active")
        resp = await client.post("/api/ops/compile", headers=admin_headers)
        assert resp.status_code == 200
    assert "Received Access-Accept" in radtest("wang.lei")


# ------------------------------------------------------------ scenario 11


async def test_time_window_rejects(client: AsyncClient, admin_headers) -> None:
    listing = await client.get("/api/policies", headers=admin_headers)
    rd = next(p for p in listing.json() if p["slug"] == "rd")
    original = {
        k: rd[k]
        for k in (
            "name",
            "slug",
            "description",
            "scope_dept",
            "eap_method",
            "vlan_id",
            "acl_name",
            "session_timeout_s",
            "reauth_interval_s",
            "require_cert",
            "require_mac_bind",
            "require_edr",
            "time_window_enabled",
            "time_from",
            "time_to",
            "rate_limit_mbps",
            "priority",
            "enabled",
        )
    }
    closed_window = dict(
        original, time_window_enabled=True, time_from="00:00:00", time_to="00:01:00"
    )
    resp = await client.put(f"/api/policies/{rd['id']}", json=closed_window, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    try:
        out = radtest("wang.lei")
        assert "Received Access-Reject" in out
        assert await last_postauth_class("wang.lei") == "reason=time-policy"
    finally:
        resp = await client.put(f"/api/policies/{rd['id']}", json=original, headers=admin_headers)
        assert resp.status_code == 200
    assert "Received Access-Accept" in radtest("wang.lei")
