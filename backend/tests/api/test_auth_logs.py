"""Auth-log endpoints (docs/03 认证日志)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from tests.radius_helpers import create_radius_tables, insert_postauth


@pytest.fixture
async def logs(client: AsyncClient, domain, admin_headers):
    await create_radius_tables()
    await insert_postauth(username="wang.lei", reply="Access-Accept", minutes_ago=1)
    await insert_postauth(
        username="zhang.wei",
        reply="Access-Reject",
        class_value="reason=account-locked",
        minutes_ago=2,
    )
    await insert_postauth(
        username="li.na",
        reply="Access-Reject",
        class_value="reason=mac-unbound",
        minutes_ago=3,
        nas_ip="10.99.0.30",
        calling="A4:83:E7:22:9C:7E",
    )
    await insert_postauth(username="ghost", reply="Access-Reject", minutes_ago=4)
    return admin_headers


async def test_list_logs_shape_and_classify(client: AsyncClient, logs):
    resp = await client.get("/api/auth-logs", headers=logs)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 4
    by_user = {i["user"]: i for i in body["items"]}
    locked = by_user["zhang.wei"]
    assert locked["reason"] == "账号锁定"
    assert locked["reason_key"] == "account-locked"
    assert locked["rtag_tone"] == "warn"
    assert locked["attr"] == "Class=reason=account-locked"
    assert by_user["wang.lei"]["reason"] is None  # accept has no reason
    assert by_user["ghost"]["reason"] == "其他"  # reject without class


async def test_filters(client: AsyncClient, logs):
    resp = await client.get("/api/auth-logs?result=reject", headers=logs)
    assert resp.json()["total"] == 3
    resp = await client.get("/api/auth-logs?result=accept", headers=logs)
    assert resp.json()["total"] == 1
    resp = await client.get("/api/auth-logs?reason=账号锁定", headers=logs)
    assert resp.json()["total"] == 1
    resp = await client.get("/api/auth-logs?reason=mac-unbound", headers=logs)
    assert resp.json()["total"] == 1
    resp = await client.get("/api/auth-logs?reason=other", headers=logs)
    assert resp.json()["total"] == 1
    resp = await client.get("/api/auth-logs?user=zhang", headers=logs)
    assert resp.json()["total"] == 1
    resp = await client.get("/api/auth-logs?nas=SW-3F-01", headers=logs)
    assert resp.json()["total"] == 3
    resp = await client.get("/api/auth-logs?result=bogus", headers=logs)
    assert resp.status_code == 422
    resp = await client.get("/api/auth-logs?eap=bogus", headers=logs)
    assert resp.status_code == 422


async def test_reason_account_disabled(client: AsyncClient, logs):
    # review W1: reason=account-disabled rows must be filterable and must not
    # leak into the "other" bucket.
    await insert_postauth(
        username="zhou.ting",
        reply="Access-Reject",
        class_value="reason=account-disabled",
        minutes_ago=1,
    )
    resp = await client.get("/api/auth-logs?reason=账号已停用", headers=logs)
    assert resp.json()["total"] == 1
    resp = await client.get("/api/auth-logs?reason=other", headers=logs)
    assert resp.json()["total"] == 1  # still only the classless "ghost" reject


async def test_time_range_filter(client: AsyncClient, logs):
    now = datetime.now(UTC)
    past = (now.replace(tzinfo=None) - timedelta(minutes=2.5)).isoformat()
    resp = await client.get(f"/api/auth-logs?from={past}", headers=logs)
    assert resp.json()["total"] == 2  # only the 1m and 2m rows


async def test_detail_and_missing(client: AsyncClient, logs):
    listing = (await client.get("/api/auth-logs?reason=账号锁定", headers=logs)).json()
    log_id = listing["items"][0]["id"]
    resp = await client.get(f"/api/auth-logs/{log_id}", headers=logs)
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["attributes"]["reply"] == "Access-Reject"
    assert detail["attributes"]["class"] == "reason=account-locked"
    assert (await client.get("/api/auth-logs/99999", headers=logs)).status_code == 404


async def test_export_csv(client: AsyncClient, logs):
    resp = await client.get("/api/auth-logs/export.csv?result=reject", headers=logs)
    assert resp.status_code == 200
    lines = resp.text.strip().splitlines()
    assert lines[0].startswith("id,")
    assert len(lines) == 4
    audit = (await client.get("/api/audit?action=auth_log.export_csv", headers=logs)).json()
    assert audit["total"] == 1
    assert audit["items"][0]["detail"] == {"count": 3}


async def test_empty_without_radius_tables(client: AsyncClient, admin_headers, domain):
    resp = await client.get("/api/auth-logs", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json() == {"items": [], "total": 0, "page": 1, "size": 50}
