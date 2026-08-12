"""Auth-log endpoints (docs/03「认证日志」)."""

from __future__ import annotations

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.db import get_db
from openredius.core.deps import require_role
from openredius.core.errors import ApiError
from openredius.core.listing import PageParams
from openredius.models import AdminRole, AdminUser
from openredius.schemas.logs import LogDetailOut
from openredius.services import audit
from openredius.services import authlogs as svc

router = APIRouter()

_ROLES = (AdminRole.ADMIN, AdminRole.OPERATOR, AdminRole.AUDITOR)
_CSV_HEADER = [
    "id",
    "time",
    "user",
    "name",
    "mac",
    "nas_name",
    "nas_sub",
    "eap",
    "reply",
    "reason",
    "attr",
]


def _filters(
    result: str | None = Query(None),
    nas: str | None = Query(None),
    user: str | None = Query(None),
    reason: str | None = Query(None),
    eap: str | None = Query(None),
    from_ts: datetime | None = Query(None, alias="from"),
    to_ts: datetime | None = Query(None, alias="to"),
) -> svc.LogFilters:
    return svc.LogFilters(
        result=result, nas=nas, user=user, reason=reason, eap=eap, from_ts=from_ts, to_ts=to_ts
    )


@router.get("")
async def list_logs(
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(*_ROLES)),
    filters: svc.LogFilters = Depends(_filters),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=500),
    sort: str | None = Query(None),
) -> dict:
    return await svc.list_auth_logs(db, filters, PageParams(page, size), sort)


@router.get("/export.csv")
async def export_logs_csv(
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(*_ROLES)),
    filters: svc.LogFilters = Depends(_filters),
) -> StreamingResponse:
    rows = await svc.logs_for_csv(db, filters)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_CSV_HEADER)
    for r in rows:
        data = r.model_dump()
        writer.writerow([data[h] for h in _CSV_HEADER])
    await audit.record_audit(
        db, actor=admin.username, action="auth_log.export_csv", detail={"count": len(rows)}
    )
    await db.commit()
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=auth-logs.csv"},
    )


@router.get("/{log_id}")
async def get_log(
    log_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(*_ROLES)),
) -> LogDetailOut:
    detail = await svc.get_log_detail(db, log_id)
    if detail is None:
        raise ApiError("log_not_found", f"auth log {log_id} not found", 404)
    row, attributes = detail
    return LogDetailOut(**row.model_dump(), attributes=attributes)
