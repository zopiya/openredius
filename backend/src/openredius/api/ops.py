"""Ops endpoints: health (unauthenticated), reload-radius, compile (docs/03)."""

from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text

from openredius import __version__
from openredius.core.config import Settings
from openredius.core.db import get_db, get_engine
from openredius.core.deps import get_app_settings, require_role
from openredius.core.errors import ApiError
from openredius.models import AdminRole, AdminUser
from openredius.radius.compiler import compile_all
from openredius.services.audit import record_audit

router = APIRouter()
health_router = APIRouter()

# Poll the applied marker this long after writing the sentinel (docs/16).
_RELOAD_APPLIED_TIMEOUT_S = 35.0
_RELOAD_POLL_INTERVAL_S = 0.5


@health_router.get("/health")
async def health(request: Request, settings: Settings = Depends(get_app_settings)) -> dict:
    db_status = "ok"
    try:
        async with get_engine().connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"
    started_at = getattr(request.app.state, "started_at", None)
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "db": db_status,
        # reload dir configured -> ops can ask the in-container watcher to
        # restart radiusd via the shared sentinel directory (docs/16).
        "radius_config": "file" if settings.radius_reload_dir.strip() else "manual",
        "version": __version__,
        "uptime_s": int(time.monotonic() - started_at) if started_at is not None else None,
    }


@health_router.get("/metrics")
async def metrics() -> dict:
    """Prometheus metrics exporter — reserved (docs/07「M7 之后可选」)."""
    raise ApiError(
        "not_implemented",
        "Prometheus metrics exporter is reserved (docs/07); not implemented",
        501,
    )


@router.post("/reload-radius")
async def reload_radius(
    db=Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    """Request a radiusd restart so rlm_sql re-reads the nas table (docs/16).

    Writes a sentinel file (epoch seconds, atomic replace) into
    ``OPENRADIUS_RADIUS_RELOAD_DIR``; the FreeRADIUS container watcher detects
    the change, restarts radiusd and writes the matching ``reload-applied``
    marker. The endpoint polls that marker so callers know whether the reload
    has taken effect. No shell command is ever executed (docs/16 §3).

    Empty reload dir = manual mode: restart the FreeRADIUS container by hand.
    """
    reload_dir = settings.radius_reload_dir.strip()
    if not reload_dir:
        detail = {"mode": "manual"}
        await record_audit(db, actor=admin.username, action="ops.reload_radius", detail=detail)
        await db.commit()
        return {
            "mode": "manual",
            "message": (
                "OPENRADIUS_RADIUS_RELOAD_DIR not configured; restart the "
                "FreeRADIUS container manually (docker compose restart freeradius)."
            ),
        }

    requested = str(int(time.time()))
    sentinel = Path(reload_dir) / "reload-requested"
    applied_path = Path(reload_dir) / "reload-applied"
    try:
        tmp = sentinel.with_name(".reload-requested.tmp")
        tmp.write_text(requested, encoding="ascii")
        os.replace(tmp, sentinel)
    except OSError as exc:
        raise ApiError(
            "reload_unavailable",
            f"cannot write reload sentinel in {reload_dir}: {exc}",
            500,
        ) from exc

    applied_at = await _wait_for_applied(applied_path, requested)
    detail = {"mode": "file", "requested": requested, "applied": applied_at}
    await record_audit(db, actor=admin.username, action="ops.reload_radius", detail=detail)
    await db.commit()
    if applied_at is None:
        return {
            "mode": "file",
            "applied": False,
            "message": (
                "Reload requested; the FreeRADIUS watcher has not confirmed yet "
                "(usually a few seconds)."
            ),
        }
    return {
        "mode": "file",
        "applied": True,
        "applied_at": applied_at,
        "message": "FreeRADIUS re-read the NAS client list",
    }


async def _wait_for_applied(applied_path: Path, requested: str) -> str | None:
    """Poll the watcher's applied marker until it matches our request.

    Returns the applied timestamp string, or None on timeout.
    """
    deadline = time.monotonic() + _RELOAD_APPLIED_TIMEOUT_S
    while time.monotonic() < deadline:
        try:
            value = applied_path.read_text(encoding="ascii").strip()
        except OSError:
            value = ""
        if value and value >= requested:
            return value
        await asyncio.sleep(_RELOAD_POLL_INTERVAL_S)
    return None


@router.post("/compile")
async def compile(
    db=Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> dict:
    """Idempotent full recompile of policy/user state into the radius schema."""
    summary = await compile_all(db, actor=admin.username, trigger="ops.compile")
    await db.commit()
    return summary.as_audit_detail("ops.compile")
