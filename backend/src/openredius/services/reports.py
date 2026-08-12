"""Report aggregation (docs/03「报表统计」, docs/02 归类口径)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.errors import ApiError
from openredius.models import Endpoint, EndpointType
from openredius.radius.tables import radius_readable, radius_table
from openredius.services.reason import REASON_CLASSES

_ETYPE_LABELS = {
    EndpointType.LAPTOP: "笔记本",
    EndpointType.PHONE: "手机",
    EndpointType.PRINTER: "打印机",
    EndpointType.CAMERA: "摄像头",
    EndpointType.OTHER: "其他哑终端",
}


def period_start(period: str, now: datetime | None = None) -> tuple[datetime, str, str]:
    """(window_start, sub_label, period_key) for today/week/month (UTC)."""
    now = now or datetime.now(UTC)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "today":
        start = today
        sub = f"统计周期:今日({today:%Y-%m-%d} 00:00 至今)"
    elif period == "week":
        start = today - timedelta(days=today.weekday())
        sub = f"统计周期:本周({start:%Y-%m-%d} 至 {now:%Y-%m-%d})"
    elif period == "month":
        start = today.replace(day=1)
        sub = f"统计周期:本月({start:%Y-%m-%d} 至 {now:%Y-%m-%d})"
    else:
        raise ApiError("invalid_period", f"unsupported period: {period}", 422)
    return start.replace(tzinfo=None), sub, period


def _radpostauth(db: AsyncSession):
    return radius_table(db.get_bind().dialect.name, "radpostauth")


async def summary(db: AsyncSession, period: str) -> dict[str, Any]:
    start, sub, _ = period_start(period)
    if not await radius_readable(db, "radpostauth"):
        return {"sub": sub, "total": "共 0 次失败", "fail": []}
    log = _radpostauth(db)
    cls = log.c["class"]
    buckets = {key: label for key, (label, _) in REASON_CLASSES.items()}
    reason_case = case(
        *[(cls.like(f"%reason={key}%"), key) for key in buckets],
        else_="other",
    )
    stmt = (
        select(reason_case.label("key"), func.count().label("n"))
        .where(log.c.reply == "Access-Reject", log.c.authdate >= start)
        .group_by("key")
    )
    rows = (await db.execute(stmt)).all()
    counts = {r.key: r.n for r in rows}
    total = sum(counts.values())
    order = [*buckets, "other"]
    labels = {**buckets, "other": "其他"}
    fail = [{"label": labels[k], "value": counts[k]} for k in order if counts.get(k)]
    return {"sub": sub, "total": f"共 {total} 次失败", "fail": fail}


async def endpoint_types(db: AsyncSession) -> list[dict[str, Any]]:
    """在线终端类型占比 — endpoint counts by type (docs/02 EndpointRow)."""
    stmt = select(Endpoint.etype, func.count()).group_by(Endpoint.etype)
    rows = (await db.execute(stmt)).all()
    by_type = {r[0]: r[1] for r in rows}
    return [{"label": _ETYPE_LABELS[t], "value": by_type.get(t, 0)} for t in EndpointType]


async def departments(db: AsyncSession, period: str) -> list[dict[str, Any]]:
    """Per-department admission stats for the period."""
    from openredius.models import AccessUser

    start, _, _ = period_start(period)
    if not await radius_readable(db, "radpostauth"):
        return []
    log = _radpostauth(db)
    radacct = radius_table(db.get_bind().dialect.name, "radacct")

    ok_stmt = (
        select(AccessUser.dept.label("dept"), func.count().label("n"))
        .select_from(log)
        .join(AccessUser, AccessUser.account == log.c.username)
        .where(log.c.reply == "Access-Accept", log.c.authdate >= start)
        .group_by(AccessUser.dept)
    )
    fail_stmt = (
        select(AccessUser.dept.label("dept"), func.count().label("n"))
        .select_from(log)
        .join(AccessUser, AccessUser.account == log.c.username)
        .where(log.c.reply == "Access-Reject", log.c.authdate >= start)
        .group_by(AccessUser.dept)
    )
    ok = {r.dept: r.n for r in (await db.execute(ok_stmt)).all()}
    fail = {r.dept: r.n for r in (await db.execute(fail_stmt)).all()}
    online_stmt = (
        select(AccessUser.dept.label("dept"), func.count().label("n"))
        .select_from(radacct)
        .join(AccessUser, AccessUser.account == radacct.c.username)
        .where(radacct.c.acctstoptime.is_(None))
        .group_by(AccessUser.dept)
    )
    online = {r.dept: r.n for r in (await db.execute(online_stmt)).all()}

    depts = sorted(set(ok) | set(fail) | set(online))
    out = []
    for dept in depts:
        ok_n, fail_n = ok.get(dept, 0), fail.get(dept, 0)
        denom = ok_n + fail_n
        rate = f"{(ok_n / denom * 100):.1f}%" if denom else "—"
        out.append(
            {
                "dept": dept,
                "online": online.get(dept, 0),
                "ok": ok_n,
                "fail": fail_n,
                "rate": rate,
            }
        )
    return out
