"""Policies API: CRUD, reorder, toggle, delete constraints, compile placeholder."""

from __future__ import annotations

from openredius.models import AdminRole
from tests.conftest import create_admin_user

OPERATOR_PW = "Operator-Password-1"

_POLICY = {
    "name": "访客受限策略",
    "slug": "guest",
    "description": "仅互联网",
    "scope_dept": "访客",
    "eap_method": "peap-mschapv2",
    "vlan_id": None,  # filled per-test
    "acl_name": "acl_guest_only",
    "rate_limit_mbps": 20,
    "priority": 0,
    "enabled": True,
}


async def test_list_ordered_by_priority_desc(client, domain, admin_headers):
    resp = await client.get("/api/policies", headers=admin_headers)
    assert resp.status_code == 200
    slugs = [p["slug"] for p in resp.json()]
    assert slugs == ["rd", "staff"]


async def test_create_policy(client, domain, admin_headers):
    payload = dict(_POLICY, vlan_id=domain["vlan10"])
    resp = await client.post("/api/policies", json=payload, headers=admin_headers)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["slug"] == "guest"
    assert body["vlan_name"] == "办公"
    assert body["user_count"] == 0

    # compile placeholder audit row written on save
    audit = (await client.get("/api/audit?action=policy.compile", headers=admin_headers)).json()
    assert len(audit["items"]) == 1
    assert audit["items"][0]["detail"]["status"] == "placeholder"


async def test_create_duplicate_name_or_slug_409(client, domain, admin_headers):
    payload = dict(_POLICY, vlan_id=domain["vlan10"], name="研发准入策略", slug="fresh")
    resp = await client.post("/api/policies", json=payload, headers=admin_headers)
    assert resp.status_code == 409
    payload = dict(_POLICY, vlan_id=domain["vlan10"], name="全新策略", slug="rd")
    resp = await client.post("/api/policies", json=payload, headers=admin_headers)
    assert resp.status_code == 409


async def test_create_dual_clash_across_rows_409(client, domain, admin_headers):
    # name matches one existing policy, slug another — must be 409, not 500.
    payload = dict(_POLICY, vlan_id=domain["vlan10"], name="办公默认策略", slug="rd")
    resp = await client.post("/api/policies", json=payload, headers=admin_headers)
    assert resp.status_code == 409


async def test_create_unknown_vlan_404(client, domain, admin_headers):
    payload = dict(_POLICY, vlan_id=9999)
    resp = await client.post("/api/policies", json=payload, headers=admin_headers)
    assert resp.status_code == 404


async def test_update_policy(client, domain, admin_headers):
    payload = dict(_POLICY, vlan_id=domain["vlan20"], name="研发准入策略", slug="rd-updated")
    resp = await client.put(f"/api/policies/{domain['rd']}", json=payload, headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["slug"] == "rd-updated"


async def test_toggle_policy(client, domain, admin_headers):
    resp = await client.patch(
        f"/api/policies/{domain['staff']}", json={"enabled": False}, headers=admin_headers
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False


async def test_reorder(client, domain, admin_headers):
    resp = await client.post(
        "/api/policies/reorder",
        json={"order": [domain["staff"], domain["rd"]]},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert [(p["slug"], p["priority"]) for p in resp.json()] == [("staff", 2), ("rd", 1)]


async def test_reorder_requires_full_set(client, domain, admin_headers):
    resp = await client.post(
        "/api/policies/reorder", json={"order": [domain["staff"]]}, headers=admin_headers
    )
    assert resp.status_code == 422


async def test_delete_in_use_policy_409(client, domain, admin_headers):
    resp = await client.delete(f"/api/policies/{domain['rd']}", headers=admin_headers)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "policy_in_use"


async def test_delete_unused_policy(client, domain, admin_headers):
    payload = dict(_POLICY, vlan_id=domain["vlan10"])
    created = (await client.post("/api/policies", json=payload, headers=admin_headers)).json()
    resp = await client.delete(f"/api/policies/{created['id']}", headers=admin_headers)
    assert resp.status_code == 204
    resp = await client.get(f"/api/policies/{created['id']}", headers=admin_headers)
    assert resp.status_code == 404


async def test_operator_cannot_write_policies(client, domain):
    await create_admin_user("op1", OPERATOR_PW, AdminRole.OPERATOR)
    login = await client.post("/api/auth/login", json={"username": "op1", "password": OPERATOR_PW})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await client.get("/api/policies", headers=headers)).status_code == 200
    payload = dict(_POLICY, vlan_id=domain["vlan10"])
    resp = await client.post("/api/policies", json=payload, headers=headers)
    assert resp.status_code == 403
    resp = await client.delete(f"/api/policies/{domain['staff']}", headers=headers)
    assert resp.status_code == 403
    resp = await client.patch(
        f"/api/policies/{domain['staff']}", json={"enabled": False}, headers=headers
    )
    assert resp.status_code == 403


async def test_policy_slug_validation(client, domain, admin_headers):
    payload = dict(_POLICY, vlan_id=domain["vlan10"], slug="Not Valid!")
    resp = await client.post("/api/policies", json=payload, headers=admin_headers)
    assert resp.status_code == 422
