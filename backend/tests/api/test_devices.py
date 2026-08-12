"""Devices API: NAS CRUD + secret, endpoints CRUD/import/whitelist/revoke."""

from __future__ import annotations

from openredius.models import AdminRole
from tests.conftest import create_admin_user

OPERATOR_PW = "Operator-Password-1"


async def test_nas_list_masks_secret(client, domain, admin_headers):
    resp = await client.get("/api/devices/nas", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["secret_masked"] == "test…2345"
    assert "testing12345" not in resp.text


async def test_nas_create_update_delete(client, domain, admin_headers):
    resp = await client.post(
        "/api/devices/nas",
        json={"name": "SW-NEW", "nasname": "10.99.9.9", "type": "switch", "secret": "newsecret99"},
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["reload_required"] is True
    device_id = body["device"]["id"]

    resp = await client.patch(
        f"/api/devices/nas/{device_id}",
        json={"name": "SW-NEW", "nasname": "10.99.9.9", "area": "新区"},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["device"]["area"] == "新区"

    resp = await client.delete(f"/api/devices/nas/{device_id}", headers=admin_headers)
    assert resp.status_code == 204


async def test_nas_filters(client, domain, admin_headers):
    resp = await client.get("/api/devices/nas?type=switch", headers=admin_headers)
    assert resp.json()["total"] == 1
    resp = await client.get("/api/devices/nas?type=ap", headers=admin_headers)
    assert resp.json()["total"] == 0
    resp = await client.get("/api/devices/nas?area=3F", headers=admin_headers)
    assert resp.json()["total"] == 1
    resp = await client.get("/api/devices/nas?type=bogus", headers=admin_headers)
    assert resp.status_code == 422


async def test_nas_dual_clash_across_rows_409(client, domain, admin_headers):
    await client.post(
        "/api/devices/nas",
        json={"name": "SW-OTHER", "nasname": "10.99.8.8", "secret": "anothersecret"},
        headers=admin_headers,
    )
    # name of device #1 + nasname of device #2
    resp = await client.post(
        "/api/devices/nas",
        json={"name": "SW-3F-01", "nasname": "10.99.8.8", "secret": "yetanother1"},
        headers=admin_headers,
    )
    assert resp.status_code == 409


async def test_nas_duplicate_409(client, domain, admin_headers):
    resp = await client.post(
        "/api/devices/nas",
        json={"name": "SW-3F-01", "nasname": "10.99.8.8", "secret": "anothersecret"},
        headers=admin_headers,
    )
    assert resp.status_code == 409
    resp = await client.post(
        "/api/devices/nas",
        json={"name": "SW-OTHER", "nasname": "10.99.0.11", "secret": "anothersecret"},
        headers=admin_headers,
    )
    assert resp.status_code == 409


async def test_nas_secret_reveal_is_audited(client, domain, admin_headers):
    resp = await client.get(f"/api/devices/nas/{domain['nas']}/secret", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["secret"] == "testing12345"
    audit = (await client.get("/api/audit?action=secret.reveal", headers=admin_headers)).json()
    assert len(audit["items"]) == 1
    # audit detail must not contain the plaintext
    assert "testing12345" not in str(audit["items"][0])


async def test_endpoint_filters_and_enum_validation(client, domain, admin_headers):
    resp = await client.get("/api/devices/endpoints?type=laptop", headers=admin_headers)
    assert [e["mac"] for e in resp.json()["items"]] == ["3C:52:82:1A:4B:01"]
    resp = await client.get("/api/devices/endpoints?comp=white", headers=admin_headers)
    assert resp.json()["total"] == 1
    resp = await client.get("/api/devices/endpoints?type=bogus", headers=admin_headers)
    assert resp.status_code == 422
    resp = await client.get("/api/devices/endpoints?comp=bogus", headers=admin_headers)
    assert resp.status_code == 422


async def test_endpoint_create_normalizes_mac(client, domain, admin_headers):
    resp = await client.post(
        "/api/devices/endpoints",
        json={"mac": "aa-bb-cc-dd-ee-01", "etype": "phone", "owner_account": "wang.lei"},
        headers=admin_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["mac"] == "AA:BB:CC:DD:EE:01"
    assert body["owner_account"] == "wang.lei"

    dup = await client.post(
        "/api/devices/endpoints", json={"mac": "AA:BB:CC:DD:EE:01"}, headers=admin_headers
    )
    assert dup.status_code == 409


async def test_endpoint_invalid_mac_422(client, domain, admin_headers):
    resp = await client.post(
        "/api/devices/endpoints", json={"mac": "not-a-mac"}, headers=admin_headers
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "invalid_mac"


async def test_endpoint_import_skips_existing_and_counts(client, domain, admin_headers):
    resp = await client.post(
        "/api/devices/endpoints/import",
        json={"macs": ["aa:bb:cc:dd:ee:02", "AABBCCDDEE02", "3C:52:82:1A:4B:01"]},
        headers=admin_headers,
    )
    assert resp.json() == {"affected": 1}


async def test_endpoint_import_invalid_mac_rejects_batch(client, domain, admin_headers):
    resp = await client.post(
        "/api/devices/endpoints/import",
        json={"macs": ["aa:bb:cc:dd:ee:03", "zz:zz"]},
        headers=admin_headers,
    )
    assert resp.status_code == 422


async def test_whitelist_remove_updates_compliance(client, domain, admin_headers):
    resp = await client.delete(
        "/api/devices/endpoints/00:25:96:FF:FE:12/whitelist", headers=admin_headers
    )
    assert resp.json() == {"affected": 1}
    listing = (await client.get("/api/devices/endpoints?q=00:25:96", headers=admin_headers)).json()
    endpoint = listing["items"][0]
    assert endpoint["whitelisted"] is False
    assert endpoint["compliance"] == "ok"

    again = await client.delete(
        "/api/devices/endpoints/00:25:96:FF:FE:12/whitelist", headers=admin_headers
    )
    assert again.json() == {"affected": 0}


async def test_revoke_cert_sets_bad(client, domain, admin_headers):
    resp = await client.post(
        "/api/devices/endpoints/3C:52:82:1A:4B:01/revoke-cert", headers=admin_headers
    )
    assert resp.json() == {"affected": 1}
    listing = (await client.get("/api/devices/endpoints?comp=bad", headers=admin_headers)).json()
    assert [e["mac"] for e in listing["items"]] == ["3C:52:82:1A:4B:01"]


async def test_devices_writes_admin_only(client, domain):
    await create_admin_user("op1", OPERATOR_PW, AdminRole.OPERATOR)
    login = await client.post("/api/auth/login", json={"username": "op1", "password": OPERATOR_PW})
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert (await client.get("/api/devices/nas", headers=headers)).status_code == 200
    assert (
        await client.post(
            "/api/devices/nas",
            json={"name": "X", "nasname": "10.0.0.9", "secret": "secretsecret"},
            headers=headers,
        )
    ).status_code == 403
    resp = await client.get(f"/api/devices/nas/{domain['nas']}/secret", headers=headers)
    assert resp.status_code == 403
    assert (
        await client.post(
            "/api/devices/endpoints", json={"mac": "aa:bb:cc:dd:ee:09"}, headers=headers
        )
    ).status_code == 403
