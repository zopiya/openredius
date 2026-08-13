"""GET /api/health + request-context middleware."""


async def test_health_ok(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"
    assert "radius_config" in body
    # docs/07 扩展:version + uptime 就位。
    assert body["version"]
    assert body["uptime_s"] is not None


async def test_health_has_request_id(client):
    resp = await client.get("/api/health")
    assert resp.headers.get("X-Request-ID")


async def test_metrics_reserved(client):
    resp = await client.get("/api/metrics")
    assert resp.status_code == 501
    assert resp.json()["error"]["code"] == "not_implemented"


async def test_portal_reserved(client):
    resp = await client.get("/api/portal/register")
    assert resp.status_code == 501
    assert resp.json()["error"]["code"] == "not_implemented"
