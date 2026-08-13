"""Dashboard + report endpoints (docs/03, roadmap M4 验收形状)."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from openredius.core.db import get_session_factory
from openredius.models import AlertEvent, AlertLevel
from tests.radius_helpers import create_radius_tables, insert_postauth, insert_session


@pytest.fixture
async def data(client: AsyncClient, domain, admin_headers):
    await create_radius_tables()
    await insert_session(unique_id="U-001", username="wang.lei")
    await insert_postauth(username="wang.lei", reply="Access-Accept", minutes_ago=1)
    await insert_postauth(
        username="zhang.wei",
        reply="Access-Reject",
        class_value="reason=account-locked",
        minutes_ago=2,
    )
    await insert_postauth(
        username="li.na", reply="Access-Reject", class_value="reason=mac-unbound", minutes_ago=3
    )
    # one alert event for the feed
    async with get_session_factory()() as session:
        session.add(
            AlertEvent(
                rule_key="nas_offline",
                level=AlertLevel.WARNING,
                title="NAS 离线",
                message="SW-5F-02 超过 5 分钟无认证流量",
                link="/devices?focus=SW-5F-02",
            )
        )
        await session.commit()
    return admin_headers


async def test_kpis(client: AsyncClient, data):
    body = (await client.get("/api/dashboard/kpis", headers=data)).json()
    assert body["online_sessions"] == 1
    assert body["auth_today"] == 3
    assert body["auth_success_rate_today"] == 33.3
    assert body["nas_online"] == 1  # only 10.99.0.11 has traffic
    assert body["nas_total"] == 1
    assert body["locked_users"] == 1  # zhang.wei seeded locked


async def test_kpis_no_radius_tables(client: AsyncClient, admin_headers, domain):
    body = (await client.get("/api/dashboard/kpis", headers=admin_headers)).json()
    assert body["online_sessions"] == 0
    assert body["auth_success_rate_today"] is None


async def test_trend_today(client: AsyncClient, data):
    body = (await client.get("/api/dashboard/trend?range=today", headers=data)).json()
    buckets = body["buckets"]
    assert buckets, "should have buckets"
    total_accept = sum(b["accept"] for b in buckets)
    total_reject = sum(b["reject"] for b in buckets)
    assert total_accept == 1
    assert total_reject == 2
    # 10-minute bucket labels
    assert all(len(b["t"]) == 19 and b["t"][13] == ":" for b in buckets)


async def test_trend_invalid_range(client: AsyncClient, data):
    assert (await client.get("/api/dashboard/trend?range=bogus", headers=data)).status_code == 422


async def test_alert_feed_and_read(client: AsyncClient, data):
    body = (await client.get("/api/dashboard/alerts?limit=20", headers=data)).json()
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["rule_key"] == "nas_offline"
    assert item["link"].startswith("/devices")
    assert item["read_at"] is None

    read = await client.post(f"/api/dashboard/alerts/{item['id']}/read", headers=data)
    assert read.status_code == 200
    assert read.json()["read_at"] is not None

    assert (await client.post("/api/dashboard/alerts/999/read", headers=data)).status_code == 404


async def test_report_summary(client: AsyncClient, data):
    body = (await client.get("/api/reports/summary?period=today", headers=data)).json()
    assert body["total"] == "共 2 次失败"
    labels = {f["label"]: f["value"] for f in body["fail"]}
    assert labels["账号锁定"] == 1
    assert labels["MAC 未绑定"] == 1
    assert body["sub"].startswith("统计周期:今日")
    assert (await client.get("/api/reports/summary?period=bogus", headers=data)).status_code == 422


async def test_report_endpoint_types(client: AsyncClient, data):
    body = (await client.get("/api/reports/endpoint-types", headers=data)).json()
    labels = {r["label"]: r["value"] for r in body["items"]}
    assert labels["笔记本"] == 1  # seeded wang.lei laptop
    assert labels["打印机"] == 1  # seeded whitelisted printer
    assert labels["手机"] == 0


async def test_report_departments(client: AsyncClient, data):
    body = (await client.get("/api/reports/departments?period=today", headers=data)).json()
    by_dept = {r["dept"]: r for r in body["items"]}
    assert by_dept["研发中心"]["ok"] == 1
    assert by_dept["研发中心"]["online"] == 1
    assert by_dept["研发中心"]["rate"] == "100.0%"
    assert by_dept["财务部"]["fail"] == 1
    assert by_dept["财务部"]["rate"] == "0.0%"


async def test_report_export_formats(client: AsyncClient, data):
    # xlsx (zip container starts with PK)
    resp = await client.get("/api/reports/export?format=xlsx&period=today", headers=data)
    assert resp.status_code == 200, resp.text
    assert "spreadsheet" in resp.headers["content-type"]
    assert resp.content[:2] == b"PK"

    # pdf
    resp = await client.get("/api/reports/export?format=pdf&period=today", headers=data)
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")

    # csv (department table)
    resp = await client.get("/api/reports/export?format=csv&period=today", headers=data)
    assert resp.status_code == 200, resp.text
    assert "部门" in resp.text

    # unknown format still 501
    assert (await client.get("/api/reports/export?format=bogus", headers=data)).status_code == 501
