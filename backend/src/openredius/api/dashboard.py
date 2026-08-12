"""Dashboard endpoints (docs/03「仪表盘」)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.config import Settings
from openredius.core.db import get_db
from openredius.core.deps import get_app_settings, require_role
from openredius.core.errors import ApiError
from openredius.models import AdminRole, AdminUser
from openredius.services import dashboard as svc

router = APIRouter()

_ROLES = (AdminRole.ADMIN, AdminRole.OPERATOR, AdminRole.AUDITOR)


@router.get("/kpis")
async def get_kpis(
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(*_ROLES)),
    settings: Settings = Depends(get_app_settings),
) -> dict:
    return await svc.kpis(db, settings)


@router.get("/trend")
async def get_trend(
    range: str = Query("today", alias="range"),
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(*_ROLES)),
) -> dict:
    return await svc.trend(db, range)


@router.get("/alerts")
async def get_alerts(
    limit: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(*_ROLES)),
) -> dict:
    events = await svc.alert_feed(db, limit)
    return {
        "items": [
            {
                "id": e.id,
                "rule_key": e.rule_key,
                "level": e.level,
                "title": e.title,
                "message": e.message,
                "link": e.link,
                "created_at": e.created_at,
                "read_at": e.read_at,
            }
            for e in events
        ]
    }


@router.post("/alerts/{alert_id}/read")
async def read_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN, AdminRole.OPERATOR)),
) -> dict:
    event = await svc.mark_alert_read(db, alert_id)
    if event is None:
        raise ApiError("alert_not_found", f"alert {alert_id} not found", 404)
    await db.commit()
    return {"id": event.id, "read_at": event.read_at}
