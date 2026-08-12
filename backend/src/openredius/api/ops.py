"""Ops endpoints: health (unauthenticated), reload-radius, compile (docs/03)."""

from __future__ import annotations

import asyncio
import shlex

from fastapi import APIRouter, Depends
from sqlalchemy import text

from openredius.core.config import get_settings
from openredius.core.db import get_db, get_engine
from openredius.core.deps import require_role
from openredius.core.errors import ApiError
from openredius.models import AdminRole, AdminUser
from openredius.radius.compiler import compile_all
from openredius.services.audit import record_audit

router = APIRouter()
health_router = APIRouter()

_RELOAD_TIMEOUT_S = 30


@health_router.get("/health")
async def health() -> dict[str, str]:
    db_status = "ok"
    try:
        async with get_engine().connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"
    return {
        "status": "ok" if db_status == "ok" else "degraded",
        "db": db_status,
        # reload command configured -> ops can restart FreeRADIUS itself (docs/06).
        "radius_config": "configured" if get_settings().radius_reload_command.strip() else "manual",
    }


@router.post("/reload-radius")
async def reload_radius(
    db=Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> dict:
    """Restart FreeRADIUS so rlm_sql re-reads the nas table (docs/06).

    ``read_clients`` only loads at startup, so client changes need a restart.
    Runs ``OPENRADIUS_RADIUS_RELOAD_COMMAND`` when configured; otherwise
    responds in manual mode with instructions.
    """
    command = get_settings().radius_reload_command.strip()
    if not command:
        detail = {"mode": "manual"}
        await record_audit(db, actor=admin.username, action="ops.reload_radius", detail=detail)
        await db.commit()
        return {
            "mode": "manual",
            "message": (
                "OPENRADIUS_RADIUS_RELOAD_COMMAND not configured; restart the "
                "FreeRADIUS container manually (docker compose restart freeradius)."
            ),
        }

    argv = shlex.split(command)
    try:
        proc = await asyncio.wait_for(
            asyncio.create_subprocess_exec(
                *argv,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            ),
            timeout=5,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=_RELOAD_TIMEOUT_S)
    except TimeoutError as exc:
        raise ApiError("reload_timeout", "reload command timed out", 504) from exc
    except FileNotFoundError as exc:
        raise ApiError("reload_unavailable", f"reload command not found: {argv[0]}", 500) from exc

    output = stdout.decode(errors="replace").strip()[-2000:]
    detail = {"mode": "auto", "command": command, "returncode": proc.returncode}
    await record_audit(db, actor=admin.username, action="ops.reload_radius", detail=detail)
    await db.commit()
    if proc.returncode != 0:
        raise ApiError("reload_failed", f"reload command failed: {output}", 500)
    return {"mode": "auto", "message": "FreeRADIUS restarted", "output": output}


@router.post("/compile")
async def compile(
    db=Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> dict:
    """Idempotent full recompile of policy/user state into the radius schema."""
    summary = await compile_all(db, actor=admin.username, trigger="ops.compile")
    await db.commit()
    return summary.as_audit_detail()
