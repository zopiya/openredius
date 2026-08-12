"""Ops endpoints: health (unauthenticated per docs/03)."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from openredius.core.db import get_engine

router = APIRouter()


@router.get("/health")
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
        # FreeRADIUS integration lands in M3; until then config checks are disabled.
        "radius_config": "disabled",
    }
