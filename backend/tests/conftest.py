"""Shared fixtures: in-memory SQLite app + httpx client (docs/09 API 集成层)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.config import Settings
from openredius.core.db import close_db, get_engine, get_session_factory, init_db
from openredius.core.security import hash_password
from openredius.main import create_app
from openredius.models import AdminRole, AdminUser, Base

BOOTSTRAP_USER = "admin"
BOOTSTRAP_PASSWORD = "bootstrap-password-1"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        env="dev",
        database_url="sqlite+aiosqlite:///:memory:",
        jwt_secret="test-secret-" + "x" * 24,
        jwt_access_ttl="15m",
        jwt_refresh_ttl="7d",
        bootstrap_admin_user=BOOTSTRAP_USER,
        bootstrap_admin_password=BOOTSTRAP_PASSWORD,
        _env_file=None,
    )


@pytest.fixture
async def app(settings: Settings):
    application = create_app(settings)
    # Prod creates tables via Alembic; tests create them directly.
    init_db(settings.database_url)
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with LifespanManager(application):
        yield application
    await close_db()


@pytest.fixture
async def client(app) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


@pytest.fixture
async def db_session() -> AsyncIterator[AsyncSession]:
    async with get_session_factory()() as session:
        yield session


@pytest.fixture
async def admin_tokens(client: AsyncClient) -> dict[str, str]:
    resp = await client.post(
        "/api/auth/login",
        json={"username": BOOTSTRAP_USER, "password": BOOTSTRAP_PASSWORD},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    return {"access": body["access_token"], "refresh": body["refresh_token"]}


@pytest.fixture
def admin_headers(admin_tokens: dict[str, str]) -> dict[str, str]:
    return {"Authorization": f"Bearer {admin_tokens['access']}"}


async def create_admin_user(
    username: str,
    password: str,
    role: AdminRole,
    *,
    disabled: bool = False,
) -> None:
    """Insert an extra admin account directly into the test database."""
    from openredius.models import AdminStatus

    async with get_session_factory()() as session:
        session.add(
            AdminUser(
                username=username,
                display_name=username,
                password_hash=hash_password(password),
                role=role,
                status=AdminStatus.DISABLED if disabled else AdminStatus.ACTIVE,
            )
        )
        await session.commit()
