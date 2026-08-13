"""Report endpoints (docs/03「报表统计」)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.db import get_db
from openredius.core.deps import require_role
from openredius.core.errors import ApiError
from openredius.models import AdminRole, AdminUser
from openredius.services import audit
from openredius.services import report_export as exporter
from openredius.services import reports as svc

router = APIRouter()

_ROLES = (AdminRole.ADMIN, AdminRole.OPERATOR, AdminRole.AUDITOR)

_XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


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
    admin: AdminUser = Depends(require_role(*_ROLES)),
) -> Response:
    fmt = format.strip().lower()
    if fmt == "csv":
        items = await svc.departments(db, period)
        content = exporter.build_csv(items)
        media_type, ext = "text/csv", "csv"
    elif fmt == "xlsx":
        summary = await svc.summary(db, period)
        types = await svc.endpoint_types(db)
        depts = await svc.departments(db, period)
        content = exporter.build_xlsx(summary, types, depts, period=period)
        media_type, ext = _XLSX_MEDIA, "xlsx"
    elif fmt == "pdf":
        summary = await svc.summary(db, period)
        types = await svc.endpoint_types(db)
        depts = await svc.departments(db, period)
        content = exporter.build_pdf(summary, types, depts, period=period)
        media_type, ext = "application/pdf", "pdf"
    else:
        raise ApiError(
            "not_implemented",
            f"format={format} not supported; use csv, xlsx or pdf",
            501,
        )

    await audit.record_audit(
        db,
        actor=admin.username,
        action="report.export",
        target_type="report",
        detail={"format": fmt, "period": period},
    )
    await db.commit()
    return Response(
        content,
        media_type=media_type,
        headers={"Content-Disposition": f"attachment; filename=report-{period}.{ext}"},
    )
