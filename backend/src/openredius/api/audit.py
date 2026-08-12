"""Audit log query (docs/03「审计」; auditor + admin only)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.db import get_db
from openredius.core.deps import require_role
from openredius.core.listing import PageParams, apply_sort, page_envelope
from openredius.models import AdminRole, AdminUser, AuditLog
from openredius.schemas.audit import AuditOut

router = APIRouter()

_SORT_COLUMNS = {
    "created_at": AuditLog.created_at,
    "actor": AuditLog.actor,
    "action": AuditLog.action,
}


@router.get("")
async def list_audit(
    action: str | None = None,
    actor: str | None = None,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1),
    sort: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN, AdminRole.AUDITOR)),
) -> dict:
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if actor:
        stmt = stmt.where(AuditLog.actor == actor)
    if from_ is not None:
        stmt = stmt.where(AuditLog.created_at >= from_)
    if to is not None:
        stmt = stmt.where(AuditLog.created_at <= to)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = apply_sort(stmt, sort, _SORT_COLUMNS, "-created_at")
    params = PageParams(page, size)
    rows = (await db.execute(stmt.offset(params.offset).limit(params.size))).scalars().all()
    items = [
        AuditOut(
            id=row.id,
            actor=row.actor,
            action=row.action,
            target_type=row.target_type,
            target_id=row.target_id,
            detail=row.detail_json,
            ip=row.ip,
            created_at=row.created_at,
        )
        for row in rows
    ]
    return page_envelope(items, int(total or 0), params)


@router.get("/export.csv", response_model=None)
async def export_audit_csv(
    action: str | None = None,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN, AdminRole.AUDITOR)),
) -> Response:
    """CSV archive of audit log entries (docs/08「审计日志」归档导出)."""
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc())
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if from_ is not None:
        stmt = stmt.where(AuditLog.created_at >= from_)
    if to is not None:
        stmt = stmt.where(AuditLog.created_at <= to)
    rows = (await db.execute(stmt.limit(50_000))).scalars().all()
    lines = ["id,action,actor,target_type,target_id,detail,ip,created_at"]
    for r in rows:
        detail_esc = (r.detail_json or "").replace('"', '""')
        # Use RFC 4180 quoting for detail (may contain commas).
        lines.append(
            f"{r.id},{r.action},{r.actor},{r.target_type or ''},{r.target_id or ''},"
            f'"{detail_esc}",{r.ip or ""},{r.created_at.isoformat() if r.created_at else ""}'
        )
    filename = f"audit-{datetime.now(UTC).strftime('%Y%m%d')}.csv"
    return Response(
        "\n".join(lines),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
