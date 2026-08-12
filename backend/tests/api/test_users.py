"""Users API: list/filters/detail + batch status & policy (docs/03「用户管理」)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from openredius.models import AdminRole
from tests.conftest import create_admin_user

OPERATOR_PW = "Operator-Password-1"


async def _login(client: AsyncClient, username: str, password: str) -> str:
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


async def test_list_users_envelope_and_filters(client, domain, admin_headers):
    resp = await client.get("/api/users?size=2&sort=account", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert body["page"] == 1
    assert body["size"] == 2
    assert [u["account"] for u in body["items"]] == ["wang.lei", "zhang.wei"]

    resp = await client.get("/api/users?dept=研发中心", headers=admin_headers)
    assert [u["account"] for u in resp.json()["items"]] == ["wang.lei"]

    resp = await client.get("/api/users?status=locked", headers=admin_headers)
    assert [u["account"] for u in resp.json()["items"]] == ["zhang.wei"]

    resp = await client.get("/api/users?q=WANG", headers=admin_headers)
    assert resp.json()["total"] == 1


async def test_user_detail_includes_endpoints_and_policy(client, domain, admin_headers):
    resp = await client.get("/api/users/wang.lei", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["policy_name"] == "研发准入策略"
    assert body["endpoint_count"] == 1
    assert body["endpoints"][0]["mac"] == "3C:52:82:1A:4B:01"


async def test_user_detail_not_found(client, domain, admin_headers):
    resp = await client.get("/api/users/nobody", headers=admin_headers)
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


async def test_batch_status_enable_disable(client, domain, admin_headers):
    resp = await client.post(
        "/api/users/status",
        json={"accounts": ["zhou.ting"], "action": "enable"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json() == {"affected": 1}
    detail = (await client.get("/api/users/zhou.ting", headers=admin_headers)).json()
    assert detail["status"] == "active"


async def test_batch_status_unknown_account_404(client, domain, admin_headers):
    resp = await client.post(
        "/api/users/status",
        json={"accounts": ["ghost"], "action": "disable"},
        headers=admin_headers,
    )
    assert resp.status_code == 404


async def test_batch_policy_assign(client, domain, admin_headers):
    resp = await client.post(
        "/api/users/policy",
        json={"accounts": ["zhang.wei", "wang.lei"], "policy_id": domain["staff"]},
        headers=admin_headers,
    )
    assert resp.json() == {"affected": 2}
    detail = (await client.get("/api/users/zhang.wei", headers=admin_headers)).json()
    assert detail["policy_name"] == "办公默认策略"


async def test_batch_policy_unknown_policy_404(client, domain, admin_headers):
    resp = await client.post(
        "/api/users/policy",
        json={"accounts": ["wang.lei"], "policy_id": 9999},
        headers=admin_headers,
    )
    assert resp.status_code == 404


async def test_operator_can_batch_auditor_cannot(client, domain):
    await create_admin_user("op1", OPERATOR_PW, AdminRole.OPERATOR)
    await create_admin_user("aud1", "Auditor-Password-1", AdminRole.AUDITOR)
    op_token = await _login(client, "op1", OPERATOR_PW)
    aud_token = await _login(client, "aud1", "Auditor-Password-1")

    resp = await client.post(
        "/api/users/status",
        json={"accounts": ["zhou.ting"], "action": "disable"},
        headers={"Authorization": f"Bearer {op_token}"},
    )
    assert resp.status_code == 200

    resp = await client.post(
        "/api/users/status",
        json={"accounts": ["zhou.ting"], "action": "disable"},
        headers={"Authorization": f"Bearer {aud_token}"},
    )
    assert resp.status_code == 403


async def test_batch_writes_audit(client, domain, admin_headers):
    await client.post(
        "/api/users/status",
        json={"accounts": ["zhou.ting"], "action": "enable"},
        headers=admin_headers,
    )
    resp = await client.get("/api/audit?action=user.status", headers=admin_headers)
    actions = resp.json()["items"]
    assert len(actions) == 1
    assert actions[0]["target_id"] == "zhou.ting"


async def test_users_require_auth(client, domain):
    assert (await client.get("/api/users")).status_code == 401


@pytest.mark.parametrize("action", ["enable", "disable"])
async def test_batch_status_validation(client, domain, admin_headers, action):
    resp = await client.post(
        "/api/users/status", json={"accounts": [], "action": action}, headers=admin_headers
    )
    assert resp.status_code == 422


async def test_user_detail_recent_auth(client: AsyncClient, domain, admin_headers):
    from tests.radius_helpers import create_radius_tables, insert_postauth

    await create_radius_tables()
    await insert_postauth(
        username="wang.lei", reply="Access-Reject", class_value="reason=bad-password"
    )
    await insert_postauth(username="wang.lei", reply="Access-Accept", minutes_ago=10)
    resp = await client.get("/api/users/wang.lei", headers=admin_headers)
    assert resp.status_code == 200
    recent = resp.json()["recent_auth"]
    assert len(recent) == 2
    assert recent[0]["reason"] == "密码错误"  # newest: the reject
    assert recent[1]["reason"] is None
