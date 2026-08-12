"""Report endpoints (docs/03「报表统计」)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
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


@router.get("/export", response_model=None)
async def report_export(
    format: str = Query(...),  # noqa: A002 — matches docs/03 query param
    period: str = Query("today"),
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(*_ROLES)),
) -> dict | Response:
    if format in ("csv",):
        items = await svc.departments(db, period)
        lines = ["department,success,fail,total,rate"]
        for d in items:
            total = d.get("success", 0) + d.get("fail", 0)
            rate = f"{d.get('success', 0) / total * 100:.1f}%" if total else "-"
            lines.append(
                f"{d.get('dept', '')},{d.get('success', 0)},{d.get('fail', 0)},{total},{rate}"
            )
        return Response(
            "\n".join(lines),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=report-{period}.csv"},
        )
    raise ApiError(
        "not_implemented",
        f"format={format} not yet supported; use csv",
        501,
    )
