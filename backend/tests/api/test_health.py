"""GET /api/health + request-context middleware."""


async def test_health_ok(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"
    assert "radius_config" in body


async def test_health_has_request_id(client):
    resp = await client.get("/api/health")
    assert resp.headers.get("X-Request-ID")
