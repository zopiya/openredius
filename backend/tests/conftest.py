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
        jobs_enabled=False,
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


async def seed_domain() -> dict[str, dict]:
    """Minimal domain dataset shared by M2 API tests; returns key ids."""
    from datetime import time

    from openredius.models import (
        AccessUser,
        Compliance,
        EapMethod,
        Endpoint,
        EndpointType,
        NasDevice,
        PolicyGroup,
        UserStatus,
        Vlan,
    )

    async with get_session_factory()() as session:
        vlan10 = Vlan(vid=10, name="办公")
        vlan20 = Vlan(vid=20, name="研发")
        session.add_all([vlan10, vlan20])
        await session.flush()

        staff = PolicyGroup(
            name="办公默认策略",
            slug="staff",
            eap_method=EapMethod.PEAP_MSCHAPV2,
            vlan_id=vlan10.id,
            acl_name="acl_staff",
            session_timeout_s=28800,
            priority=1,
            enabled=True,
        )
        rd = PolicyGroup(
            name="研发准入策略",
            slug="rd",
            eap_method=EapMethod.EAP_TLS,
            vlan_id=vlan20.id,
            acl_name="acl_rd_std",
            require_cert=True,
            require_mac_bind=True,
            time_window_enabled=True,
            time_from=time(8, 0),
            time_to=time(20, 0),
            priority=2,
            enabled=True,
        )
        session.add_all([staff, rd])
        await session.flush()

        wang = AccessUser(
            account="wang.lei",
            name="王磊",
            dept="研发中心",
            title="工程师",
            status=UserStatus.ACTIVE,
            policy_group_id=rd.id,
        )
        zhou = AccessUser(
            account="zhou.ting",
            name="周婷",
            dept="市场部",
            title="专员",
            status=UserStatus.DISABLED,
            policy_group_id=staff.id,
        )
        zhang = AccessUser(
            account="zhang.wei",
            name="张伟",
            dept="财务部",
            title="主管",
            status=UserStatus.LOCKED,
            policy_group_id=rd.id,
        )
        session.add_all([wang, zhou, zhang])
        await session.flush()

        nas = NasDevice(
            name="SW-3F-01", nasname="10.99.0.11", area="3F", secret_enc="testing12345", capacity=48
        )
        session.add(nas)
        session.add(
            Endpoint(
                mac="3C:52:82:1A:4B:01",
                etype=EndpointType.LAPTOP,
                compliance=Compliance.OK,
                owner_user_id=wang.id,
            )
        )
        session.add(
            Endpoint(
                mac="00:25:96:FF:FE:12",
                etype=EndpointType.PRINTER,
                compliance=Compliance.WHITE,
                whitelisted=True,
            )
        )
        await session.commit()
        return {
            "vlan10": vlan10.id,
            "vlan20": vlan20.id,
            "staff": staff.id,
            "rd": rd.id,
            "wang": wang.id,
            "zhou": zhou.id,
            "zhang": zhang.id,
            "nas": nas.id,
        }


@pytest.fixture
async def domain(client: AsyncIterator[AsyncClient]) -> dict[str, dict]:
    return await seed_domain()
