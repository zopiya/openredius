"""Stack-integration fixtures: real PostgreSQL + FreeRADIUS (docs/09 栈集成层).

Requires the dev compose stack (deploy/docker-compose.dev.yml). Tests are
skipped when the stack is down so `pytest -m integration` stays green-safe
in environments without docker.
"""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from asgi_lifespan import LifespanManager
from httpx import ASGITransport, AsyncClient

from openredius.core.config import Settings
from openredius.core.db import close_db, init_db
from openredius.main import create_app

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent
COMPOSE_FILE = REPO_ROOT / "deploy" / "docker-compose.dev.yml"

PG_URL = "postgresql+asyncpg://openredius:dev-only-openredius-password@localhost:5432/openredius"
RADIUS_SECRET = "testing123-dev"
SEED_PASSWORD = "Demo-Radius-2026"
ADMIN_USER = "admin"
ADMIN_PASSWORD = "Admin-Dev-2026"

pytestmark = pytest.mark.integration


def _stack_available() -> bool:
    if shutil.which("docker") is None:
        return False
    try:
        with socket.create_connection(("localhost", 5432), timeout=2):
            pass
    except OSError:
        return False
    out = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(COMPOSE_FILE),
            "ps",
            "--status",
            "running",
            "-q",
            "freeradius",
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    return bool(out.stdout.strip())


@pytest.fixture(scope="session", autouse=True)
def require_stack() -> None:
    if not _stack_available():
        pytest.skip(
            "dev compose stack not running (docker compose -f deploy/docker-compose.dev.yml up -d)"
        )


@pytest.fixture(scope="session", autouse=True)
def seeded(require_stack) -> None:
    """Alembic + seed_demo against the stack DB (idempotent)."""
    env = {"OPENRADIUS_DATABASE_URL": PG_URL}
    for cmd in (
        ["uv", "run", "alembic", "upgrade", "head"],
        ["uv", "run", "python", "scripts/seed_demo.py"],
    ):
        result = subprocess.run(
            cmd,
            cwd=BACKEND_DIR,
            capture_output=True,
            text=True,
            timeout=120,
            env={**os.environ, **env},
        )
        assert result.returncode == 0, f"{cmd} failed:\n{result.stdout}\n{result.stderr}"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        env="dev",
        database_url=PG_URL,
        jwt_secret="integration-secret-" + "x" * 24,
        bootstrap_admin_user=ADMIN_USER,
        bootstrap_admin_password=ADMIN_PASSWORD,
        radius_reload_dir="",
        jobs_enabled=False,
        _env_file=None,
    )


@pytest.fixture
async def app(settings: Settings):
    init_db(settings.database_url)
    application = create_app(settings)
    async with LifespanManager(application):
        yield application
    await close_db()


@pytest.fixture
async def client(app) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


@pytest.fixture
async def admin_headers(client: AsyncClient) -> dict[str, str]:
    resp = await client.post(
        "/api/auth/login", json={"username": ADMIN_USER, "password": ADMIN_PASSWORD}
    )
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


# ------------------------------------------------------------------ helpers


def radtest(user: str, password: str = SEED_PASSWORD) -> str:
    """Run radtest inside the freeradius container; returns stdout."""
    out = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(COMPOSE_FILE),
            "exec",
            "-T",
            "freeradius",
            "radtest",
            user,
            password,
            "localhost",
            "0",
            RADIUS_SECRET,
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    return out.stdout + out.stderr


def radclient(attributes: dict[str, str]) -> str:
    """Send a raw Access-Request (attribute file on stdin) to the stack."""
    lines = "\n".join(f"{k}={v}" for k, v in attributes.items())
    out = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(COMPOSE_FILE),
            "exec",
            "-T",
            "freeradius",
            "radclient",
            "-x",
            "127.0.0.1:1812",
            "auth",
            RADIUS_SECRET,
        ],
        input=lines,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return out.stdout + out.stderr


async def last_postauth_class(account: str) -> str | None:
    """Latest radpostauth.class for the account (throwaway engine)."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(PG_URL)
    try:
        async with engine.connect() as conn:
            row = await conn.execute(
                text(
                    "SELECT class FROM radius.radpostauth "
                    "WHERE username = :u ORDER BY id DESC LIMIT 1"
                ),
                {"u": account},
            )
            return row.scalar()
    finally:
        await engine.dispose()


async def pg_rows(sql: str, params: dict | None = None) -> list:
    """Run a raw query against the stack DB (throwaway engine)."""
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(PG_URL)
    try:
        async with engine.connect() as conn:
            return (await conn.execute(text(sql), params or {})).all()
    finally:
        await engine.dispose()


async def pg_execute(sql: str, params: dict | None = None) -> None:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(PG_URL)
    try:
        async with engine.begin() as conn:
            await conn.execute(text(sql), params or {})
    finally:
        await engine.dispose()


def acctclient(attributes: dict[str, str]) -> str:
    """Send an accounting packet (attribute file on stdin) to the stack."""
    lines = "\n".join(f"{k}={v}" for k, v in attributes.items())
    out = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(COMPOSE_FILE),
            "exec",
            "-T",
            "freeradius",
            "radclient",
            "-x",
            "127.0.0.1:1813",
            "acct",
            RADIUS_SECRET,
        ],
        input=lines,
        capture_output=True,
        text=True,
        timeout=30,
    )
    return out.stdout + out.stderr
