"""Bootstrap + no-admin startup behavior (docs/08 初始管理员)."""

from __future__ import annotations

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from openredius.core.db import close_db, get_engine, init_db
from openredius.main import create_app
from openredius.models import Base


async def test_app_starts_without_admins_in_dev(settings):
    settings.bootstrap_admin_user = ""
    settings.bootstrap_admin_password = ""
    app = create_app(settings)
    init_db(settings.database_url)
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            assert (await client.get("/api/health")).status_code == 200
            resp = await client.post(
                "/api/auth/login", json={"username": "admin", "password": "whatever-123"}
            )
            assert resp.status_code == 401
    await close_db()


async def test_bootstrap_short_password_fails_startup(settings):
    settings.bootstrap_admin_password = "short"
    app = create_app(settings)
    init_db(settings.database_url)
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    with pytest.raises(RuntimeError, match="at least 10"):
        async with LifespanManager(app):
            pass
    await close_db()
