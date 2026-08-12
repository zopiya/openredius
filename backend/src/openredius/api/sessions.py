"""Online session endpoints (docs/03「在线会话」)."""

from __future__ import annotations

import asyncio
import csv
import io

import anyio
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.config import Settings
from openredius.core.db import get_db
from openredius.core.deps import get_app_settings, require_role
from openredius.core.errors import ApiError
from openredius.core.listing import PageParams
from openredius.models import AdminRole, AdminUser
from openredius.radius.coa import CoaOutcome, disconnect_session
from openredius.radius.tables import radius_table
from openredius.schemas.sessions import (
    DisconnectFailure,
    DisconnectRequest,
    DisconnectResult,
    SessionDetailOut,
)
from openredius.services import audit
from openredius.services import sessions as svc

router = APIRouter()

_READ_ROLES = (AdminRole.ADMIN, AdminRole.OPERATOR, AdminRole.AUDITOR)
_WRITE_ROLES = (AdminRole.ADMIN, AdminRole.OPERATOR)
_DISCONNECT_CONCURRENCY = 8
_CLOSE_POLL_INTERVAL_S = 0.5


def _filters(
    dept: str | None = Query(None),
    method: str | None = Query(None),
    nas: str | None = Query(None),
    vlan: str | None = Query(None),
    auth: str | None = Query(None),
    q: str | None = Query(None),
) -> svc.SessionFilters:
    return svc.SessionFilters(dept=dept, method=method, nas=nas, vlan=vlan, auth=auth, q=q)


@router.get("")
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(*_READ_ROLES)),
    filters: svc.SessionFilters = Depends(_filters),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=500),
    sort: str | None = Query(None),
) -> dict:
    return await svc.list_sessions(db, filters, PageParams(page, size), sort)


@router.get("/export.csv")
async def export_sessions_csv(
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(*_READ_ROLES)),
    filters: svc.SessionFilters = Depends(_filters),
) -> StreamingResponse:
    rows = await svc.sessions_for_csv(db, filters)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(_CSV_HEADER)
    for r in rows:
        data = r.model_dump()
        writer.writerow([data[h] for h in _CSV_HEADER])
    await audit.record_audit(
        db, actor=admin.username, action="session.export_csv", detail={"count": len(rows)}
    )
    await db.commit()
    content = buf.getvalue()
    return StreamingResponse(
        iter([content]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sessions.csv"},
    )


_CSV_HEADER = [
    "acct_unique_id",
    "acct_session_id",
    "username",
    "name",
    "dept",
    "mac",
    "method",
    "nas_name",
    "nas_ip",
    "nas_port",
    "called",
    "ip",
    "vlan",
    "auth_method",
    "duration_s",
    "status",
    "filter_id",
    "session_timeout",
    "start",
    "bytes_in",
    "bytes_out",
]


@router.get("/{acct_unique_id}")
async def get_session(
    acct_unique_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(*_READ_ROLES)),
) -> SessionDetailOut:
    detail = await svc.get_session_detail(db, acct_unique_id)
    if detail is None:
        raise ApiError("session_not_found", f"session {acct_unique_id} not found", 404)
    row, attributes = detail
    return SessionDetailOut(**row.model_dump(), attributes=attributes)


@router.post("/disconnect")
async def disconnect_sessions(
    body: DisconnectRequest,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(*_WRITE_ROLES)),
    settings: Settings = Depends(get_app_settings),
) -> DisconnectResult:
    if not body.confirm:
        raise ApiError("confirm_required", "disconnect requires confirm=true", 422)
    if not body.session_ids:
        raise ApiError("empty_selection", "session_ids must not be empty", 422)
    ids = list(dict.fromkeys(body.session_ids))
    rows = await svc.fetch_sessions_by_unique_ids(db, ids)
    found = {r.acct.acctuniqueid: r for r in rows}
    limiter = anyio.CapacityLimiter(_DISCONNECT_CONCURRENCY)

    async def send_coa(unique_id: str) -> tuple[str, CoaOutcome]:
        joined = found[unique_id]
        acct, nas = joined.acct, joined.nas
        if nas is None:
            return unique_id, CoaOutcome(status="error", error_cause="unknown-nas")
        async with limiter:
            outcome = await disconnect_session(
                host=nas.nasname,
                port=settings.radius_coa_port,
                secret=nas.secret_enc,
                username=acct.username,
                acct_session_id=acct.acctsessionid,
                calling_station_id=acct.callingstationid or None,
                timeout_s=settings.radius_coa_timeout,
            )
        return unique_id, outcome

    # Network fan-out first (no DB); DB polling/closing then runs serially on
    # this single session (AsyncSession is not concurrency-safe, and the SQLite
    # StaticPool test setup has exactly one connection).
    outcomes = dict(await asyncio.gather(*(send_coa(uid) for uid in ids if uid in found)))

    failed: list[DisconnectFailure] = []
    disconnected = 0
    for unique_id in ids:
        if unique_id not in found:
            failed.append(DisconnectFailure(id=unique_id, reason="not-found-or-not-active"))
            await audit.record_audit(
                db,
                actor=admin.username,
                action="session.disconnect",
                detail={"acct_unique_id": unique_id, "result": "not-found-or-not-active"},
            )
            continue
        outcome = outcomes[unique_id]
        if outcome.status == "ack":
            disconnected += 1
            await _await_stop_or_close(db, unique_id, settings.radius_coa_close_poll_s)
        else:
            failed.append(
                DisconnectFailure(id=unique_id, reason=outcome.error_cause or outcome.status)
            )
        await audit.record_audit(
            db,
            actor=admin.username,
            action="session.disconnect",
            detail={
                "acct_unique_id": unique_id,
                "result": outcome.status,
                "error_cause": outcome.error_cause,
            },
        )
    await db.commit()
    return DisconnectResult(disconnected=disconnected, failed=failed)


async def _await_stop_or_close(db: AsyncSession, unique_id: str, poll_s: float) -> None:
    """Poll radacct for the NAS-side stop; fall back to backend close (docs/04)."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + poll_s
    while True:
        radacct = radius_table(db.get_bind().dialect.name, "radacct")
        stop = (
            await db.execute(
                select(radacct.c.acctstoptime).where(radacct.c.acctuniqueid == unique_id)
            )
        ).scalar_one_or_none()
        if stop is not None:
            return
        if loop.time() >= deadline:
            await svc.close_session_fallback(db, unique_id)
            return
        await asyncio.sleep(_CLOSE_POLL_INTERVAL_S)
