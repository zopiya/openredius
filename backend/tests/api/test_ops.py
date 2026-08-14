"""Ops endpoints: reload-radius (manual/file sentinel), compile, RBAC (docs/03/16)."""

from __future__ import annotations

import re
from pathlib import Path

from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from openredius.core.config import Settings
from openredius.core.db import close_db, get_engine, init_db
from openredius.main import create_app
from openredius.models import AdminRole, Base
from tests.conftest import create_admin_user

OPERATOR_PW = "Operator-Password-1"
FUTURE_EPOCH = "9999999999"  # any applied marker >= request epoch


def _use_reload_dir(app: FastAPI, monkeypatch, reload_dir: str) -> None:
    """Point the running app at a reload dir without spawning a second app."""
    monkeypatch.setattr(app.state.settings, "radius_reload_dir", reload_dir)


async def test_reload_radius_manual_mode(client: AsyncClient, admin_headers):
    # No OPENRADIUS_RADIUS_RELOAD_DIR configured in the test settings.
    resp = await client.post("/api/ops/reload-radius", headers=admin_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["mode"] == "manual"
    assert "manually" in body["message"]

    audit = (await client.get("/api/audit?action=ops.reload_radius", headers=admin_headers)).json()
    assert audit["total"] == 1
    assert audit["items"][0]["detail"] == {"mode": "manual"}


async def test_reload_radius_file_mode_applied(
    client: AsyncClient, admin_headers, app: FastAPI, tmp_path: Path, monkeypatch
):
    (tmp_path / "reload-applied").write_text(FUTURE_EPOCH, encoding="ascii")
    _use_reload_dir(app, monkeypatch, str(tmp_path))
    resp = await client.post("/api/ops/reload-radius", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == "file"
    assert body["applied"] is True
    assert body["applied_at"] == FUTURE_EPOCH
    # Sentinel written atomically; content is the request epoch.
    requested = (tmp_path / "reload-requested").read_text(encoding="ascii").strip()
    assert re.fullmatch(r"\d{9,}", requested)
    assert not (tmp_path / ".reload-requested.tmp").exists()

    audit = (await client.get("/api/audit?action=ops.reload_radius", headers=admin_headers)).json()
    assert audit["items"][0]["detail"] == {
        "mode": "file",
        "requested": requested,
        "applied": FUTURE_EPOCH,
    }


async def test_reload_radius_file_mode_pending(
    client: AsyncClient, admin_headers, app: FastAPI, tmp_path: Path, monkeypatch
):
    import openredius.api.ops as ops_module

    monkeypatch.setattr(ops_module, "_RELOAD_APPLIED_TIMEOUT_S", 0.2)
    monkeypatch.setattr(ops_module, "_RELOAD_POLL_INTERVAL_S", 0.05)
    _use_reload_dir(app, monkeypatch, str(tmp_path))
    resp = await client.post("/api/ops/reload-radius", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == "file"
    assert body["applied"] is False
    assert "not confirmed" in body["message"]
    assert (tmp_path / "reload-requested").exists()


async def test_reload_radius_never_shell_interprets_dir(
    client: AsyncClient, admin_headers, app: FastAPI, tmp_path: Path, monkeypatch
):
    # AC-3: the reload dir is only ever a filesystem path — shell metacharacters
    # must not be executed or interpreted.
    marker = Path("PWNED-BY-SHELL")
    nasty = str(tmp_path / "x-$(touch PWNED-BY-SHELL)-;")
    sentinel_dir = Path(nasty)
    sentinel_dir.mkdir()
    (sentinel_dir / "reload-applied").write_text(FUTURE_EPOCH, encoding="ascii")
    _use_reload_dir(app, monkeypatch, nasty)
    resp = await client.post("/api/ops/reload-radius", headers=admin_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["applied"] is True
    assert not marker.exists()
    assert (sentinel_dir / "reload-requested").exists()


async def test_reload_radius_unwritable_dir(
    client: AsyncClient, admin_headers, app: FastAPI, tmp_path: Path, monkeypatch
):
    _use_reload_dir(app, monkeypatch, str(tmp_path / "missing"))
    resp = await client.post("/api/ops/reload-radius", headers=admin_headers)
    assert resp.status_code == 500
    assert resp.json()["error"]["code"] == "reload_unavailable"


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


async def test_health_radius_config_reflects_setting(settings: Settings, tmp_path: Path):
    configured = settings.model_copy(
        update={"radius_reload_dir": str(tmp_path), "jobs_enabled": False}
    )
    init_db(configured.database_url)
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    app = create_app(configured)
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            body = (await c.get("/api/health")).json()
            assert body["radius_config"] == "file"
    await close_db()
