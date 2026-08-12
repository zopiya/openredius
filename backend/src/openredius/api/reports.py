"""Report endpoints (docs/03「报表统计」)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.db import get_db
from openredius.core.deps import require_role
from openredius.core.errors import ApiError
from openredius.models import AdminRole, AdminUser
from openredius.services import reports as svc

router = APIRouter()

_ROLES = (AdminRole.ADMIN, AdminRole.OPERATOR, AdminRole.AUDITOR)


@router.get("/summary")
async def report_summary(
    period: str = Query("today"),
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(*_ROLES)),
) -> dict:
    return await svc.summary(db, period)


@router.get("/endpoint-types")
async def report_endpoint_types(
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(*_ROLES)),
) -> dict:
    return {"items": await svc.endpoint_types(db)}


@router.get("/departments")
async def report_departments(
    period: str = Query("today"),
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(*_ROLES)),
) -> dict:
    return {"items": await svc.departments(db, period)}


@router.get("/export")
async def report_export(
    format: str = Query(...),  # noqa: A002 — matches docs/03 query param
    _admin: AdminUser = Depends(require_role(*_ROLES)),
) -> dict:
    raise ApiError(
        "not_implemented",
        "report export lands with the presentation layer (M7)",
        501,
    )
