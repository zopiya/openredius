"""Auth-log service: radpostauth ⋈ user/nas → LogRow (docs/02 映射与归类)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import Select, func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.errors import ApiError
from openredius.core.listing import PageParams, apply_sort
from openredius.models import AccessUser, NasDevice, PolicyGroup
from openredius.radius.tables import radius_readable, radius_table
from openredius.schemas.logs import LogRowOut
from openredius.services.reason import classify_reason, reason_key_from_param

_EAP_LABELS = {"eap-tls": "EAP-TLS", "peap-mschapv2": "PEAP-MSCHAPv2"}
_CSV_CAP = 10_000
_CLASS_KEY = "class"  # radpostauth failure-reason carrier (docs/06)


def _radpostauth(db: AsyncSession):
    return radius_table(db.get_bind().dialect.name, "radpostauth")


@dataclass(slots=True)
class LogFilters:
    result: str | None = None  # accept / reject
    nas: str | None = None
    user: str | None = None
    reason: str | None = None  # key or Chinese label (docs/02 归类)
    eap: str | None = None
    from_ts: datetime | None = None
    to_ts: datetime | None = None


def _eap_key(value: str) -> str:
    v = value.strip().lower()
    for key, label in _EAP_LABELS.items():
        if v in {key, label.lower()}:
            return key
    raise ApiError("invalid_eap", f"unsupported eap filter: {value}", 422)


def _base_query(db: AsyncSession, f: LogFilters) -> Select:
    log = _radpostauth(db)
    cls = log.c[_CLASS_KEY]
    stmt = (
        select(log, AccessUser, PolicyGroup, NasDevice)
        .select_from(log)
        .join(AccessUser, AccessUser.account == log.c.username, isouter=True)
        .join(PolicyGroup, PolicyGroup.id == AccessUser.policy_group_id, isouter=True)
        .join(NasDevice, NasDevice.nasname == log.c.nasipaddress, isouter=True)
    )
    if f.result:
        if f.result.lower() not in {"accept", "reject", "success", "failure"}:
            raise ApiError("invalid_result", f"unsupported result filter: {f.result}", 422)
        want = "Access-Accept" if f.result.lower() in {"accept", "success"} else "Access-Reject"
        stmt = stmt.where(log.c.reply == want)
    if f.user:
        stmt = stmt.where(
            or_(log.c.username.ilike(f"%{f.user}%"), AccessUser.name.ilike(f"%{f.user}%"))
        )
    if f.nas:
        stmt = stmt.where(
            or_(NasDevice.name.ilike(f"%{f.nas}%"), log.c.nasipaddress.ilike(f"%{f.nas}%"))
        )
    key = reason_key_from_param(f.reason)
    if key == "other":
        stmt = stmt.where(
            log.c.reply == "Access-Reject",
            or_(cls.is_(None), cls == "", not_(cls.like("%reason=%"))),
        )
    elif key:
        stmt = stmt.where(cls.like(f"%reason={key}%"))
    if f.eap:
        stmt = stmt.where(PolicyGroup.eap_method == _eap_key(f.eap))
    if f.from_ts:
        stmt = stmt.where(log.c.authdate >= f.from_ts)
    if f.to_ts:
        stmt = stmt.where(log.c.authdate <= f.to_ts)
    return stmt


def _row_out(row: Any, log_columns: list[str]) -> LogRowOut:
    mapping = row._mapping
    log = {c: mapping.get(c, mapping.get(f"{c}_1")) for c in log_columns}
    user = row.AccessUser
    policy = row.PolicyGroup
    nas = row.NasDevice
    class_value = log.get(_CLASS_KEY) or None
    reason = classify_reason(class_value)
    is_reject = log.get("reply") == "Access-Reject"
    eap = policy.eap_method if policy else None
    nas_name = nas.name if nas else (log.get("nasipaddress") or "")
    nas_sub = log.get("calledstationid") or ""
    return LogRowOut(
        id=log["id"],
        time=log["authdate"],
        user=log["username"],
        name=user.name if user else "",
        sub=log["username"],
        mac=log.get("callingstationid") or "",
        nas=f"{nas_name} · {nas_sub}" if nas_sub else nas_name,
        nas_name=nas_name,
        nas_sub=nas_sub,
        eap=_EAP_LABELS.get(eap, eap or ""),
        reply=log.get("reply") or "",
        reason=reason.label if is_reject else None,
        reason_key=reason.key if is_reject else None,
        rtag_tone=reason.tone if is_reject else None,
        attr=f"Class={class_value}" if class_value else "",
    )


async def list_auth_logs(
    db: AsyncSession, f: LogFilters, params: PageParams, sort: str | None = None
) -> dict[str, Any]:
    if not await radius_readable(db, "radpostauth"):
        return {"items": [], "total": 0, "page": params.page, "size": params.size}
    log = _radpostauth(db)
    stmt = _base_query(db, f)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = apply_sort(stmt, sort, {"time": log.c.authdate, "user": log.c.username}, default="-time")
    rows = (await db.execute(stmt.offset(params.offset).limit(params.size))).all()
    cols = [c.name for c in log.columns]
    return {
        "items": [_row_out(r, cols) for r in rows],
        "total": total,
        "page": params.page,
        "size": params.size,
    }


async def get_log_detail(db: AsyncSession, log_id: int) -> tuple[LogRowOut, dict] | None:
    if not await radius_readable(db, "radpostauth"):
        return None
    log = _radpostauth(db)
    stmt = _base_query(db, LogFilters()).where(log.c.id == log_id)
    row = (await db.execute(stmt)).first()
    if row is None:
        return None
    cols = [c.name for c in log.columns]
    out = _row_out(row, cols)
    attrs = {c: row._mapping.get(c) for c in cols}
    attrs = {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in attrs.items()}
    return out, attrs


async def logs_for_csv(db: AsyncSession, f: LogFilters) -> list[LogRowOut]:
    if not await radius_readable(db, "radpostauth"):
        return []
    log = _radpostauth(db)
    stmt = _base_query(db, f).order_by(log.c.authdate.desc())
    rows = (await db.execute(stmt.limit(_CSV_CAP))).all()
    cols = [c.name for c in log.columns]
    return [_row_out(r, cols) for r in rows]
