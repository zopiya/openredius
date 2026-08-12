"""Ops endpoints: reload-radius (manual mode), compile, RBAC (docs/03)."""

from __future__ import annotations

from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from openredius.core.config import Settings
from openredius.models import AdminRole
from tests.conftest import create_admin_user

OPERATOR_PW = "Operator-Password-1"


async def test_reload_radius_manual_mode(client: AsyncClient, admin_headers):
    # No OPENRADIUS_RADIUS_RELOAD_COMMAND configured in the test settings.
    resp = await client.post("/api/ops/reload-radius", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["mode"] == "manual"
    assert "manually" in body["message"]

    audit = (await client.get("/api/audit?action=ops.reload_radius", headers=admin_headers)).json()
    assert audit["total"] == 1
    assert audit["items"][0]["detail"] == {"mode": "manual"}


async def test_compile_on_sqlite_reports_skipped(client: AsyncClient, admin_headers):
    resp = await client.post("/api/ops/compile", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "skipped"
    assert body["trigger"] == "ops.compile"


async def test_ops_endpoints_admin_only(client: AsyncClient, domain):
    await create_admin_user("op1", OPERATOR_PW, AdminRole.OPERATOR)
    resp = await client.post("/api/auth/login", json={"username": "op1", "password": OPERATOR_PW})
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    assert (await client.post("/api/ops/reload-radius", headers=headers)).status_code == 403
    assert (await client.post("/api/ops/compile", headers=headers)).status_code == 403


async def test_health_radius_config_reflects_setting(settings: Settings):
    from openredius.core.db import close_db, get_engine, init_db
    from openredius.main import create_app
    from openredius.models.base import Base

    # Separate app with a reload command configured.
    configured = settings.model_copy(
        update={"radius_reload_command": "docker compose restart freeradius", "jobs_enabled": False}
    )
    init_db(configured.database_url)
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    app = create_app(configured)
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            body = (await c.get("/api/health")).json()
            assert body["radius_config"] == "configured"
    await close_db()
