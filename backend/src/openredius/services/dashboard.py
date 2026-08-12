"""Dashboard KPIs / trend / alert feed (docs/03「仪表盘」)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import Integer, String, case, cast, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.config import Settings
from openredius.models import AccessUser, AlertEvent, NasDevice, UserStatus
from openredius.radius.tables import ip_text, radius_readable, radius_table

_TREND_RANGES = {"today": (10, "day"), "7d": (60, "week")}


def _radpostauth(db: AsyncSession):
    return radius_table(db.get_bind().dialect.name, "radpostauth")


def _radacct(db: AsyncSession):
    return radius_table(db.get_bind().dialect.name, "radacct")


def _bucket_expr(db: AsyncSession, col, minutes: int):
    """Time-bucket expression working on both PostgreSQL and SQLite."""
    if db.get_bind().dialect.name == "postgresql":
        hour = func.date_trunc("hour", col)
        if minutes >= 60:
            return hour
        return hour + func.floor(func.extract("minute", col) / minutes) * text(
            f"INTERVAL '{minutes} minutes'"
        )
    # SQLite: string-formatted buckets.
    if minutes >= 60:
        return func.strftime("%Y-%m-%dT%H:00:00", col)
    # `//` keeps SQLite integer division (SQLAlchemy would add +0.0 for `/`).
    minute_bucket = (cast(func.strftime("%M", col), Integer) // minutes) * minutes
    return (
        func.strftime("%Y-%m-%dT%H:", col).concat(func.printf("%02d", minute_bucket)).concat(":00")
    )


async def kpis(db: AsyncSession, settings: Settings) -> dict[str, Any]:
    locked_users = (
        await db.execute(
            select(func.count())
            .select_from(AccessUser)
            .where(AccessUser.status == UserStatus.LOCKED)
        )
    ).scalar_one()

    if not await radius_readable(db):
        return {
            "online_sessions": 0,
            "auth_today": 0,
            "auth_success_rate_today": None,
            "nas_online": 0,
            "nas_total": await db.scalar(select(func.count()).select_from(NasDevice)),
            "locked_users": locked_users,
        }

    radacct = _radacct(db)
    log = _radpostauth(db)
    online_sessions = (
        await db.execute(
            select(func.count()).select_from(radacct).where(radacct.c.acctstoptime.is_(None))
        )
    ).scalar_one()

    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
    day_counts = (
        await db.execute(
            select(log.c.reply, func.count())
            .where(log.c.authdate >= today_start)
            .group_by(log.c.reply)
        )
    ).all()
    auth_today = sum(n for _, n in day_counts)
    accepts = sum(n for reply, n in day_counts if reply == "Access-Accept")
    rate = round(accepts / auth_today * 100, 1) if auth_today else None

    # NAS online = any auth/accounting traffic inside the configured window.
    window_start = datetime.now(UTC) - timedelta(seconds=settings.nas_online_window)
    window_start = window_start.replace(tzinfo=None)
    active_ips = set()
    rows = (
        await db.execute(
            select(cast(log.c.nasipaddress, String(64)))
            .where(log.c.authdate >= window_start)
            .distinct()
        )
    ).scalars()
    active_ips.update(ip for ip in rows if ip)
    rows = (
        await db.execute(
            select(ip_text(db, radacct.c.nasipaddress))
            .where(
                or_(
                    radacct.c.acctstarttime >= window_start,
                    radacct.c.acctupdatetime >= window_start,
                )
            )
            .distinct()
        )
    ).scalars()
    active_ips.update(ip for ip in rows if ip)
    devices = (await db.execute(select(NasDevice))).scalars().all()
    nas_online = sum(1 for d in devices if d.nasname in active_ips)

    return {
        "online_sessions": online_sessions,
        "auth_today": auth_today,
        "auth_success_rate_today": rate,
        "nas_online": nas_online,
        "nas_total": len(devices),
        "locked_users": locked_users,
    }


async def trend(db: AsyncSession, range_key: str) -> dict[str, Any]:
    if range_key not in _TREND_RANGES:
        from openredius.core.errors import ApiError

        raise ApiError("invalid_range", f"unsupported range: {range_key}", 422)
    minutes, span = _TREND_RANGES[range_key]
    now = datetime.now(UTC)
    if span == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = now - timedelta(days=7)
    start = start.replace(tzinfo=None)

    buckets: dict[str, dict[str, int]] = {}
    if await radius_readable(db, "radpostauth"):
        log = _radpostauth(db)
        expr = _bucket_expr(db, log.c.authdate, minutes).label("bucket")
        counts = case((log.c.reply == "Access-Accept", 1), else_=0)
        rejects = case((log.c.reply == "Access-Reject", 1), else_=0)
        rows = (
            await db.execute(
                select(expr, func.sum(counts), func.sum(rejects))
                .where(log.c.authdate >= start)
                .group_by("bucket")
            )
        ).all()
        for bucket, ok, bad in rows:
            key = _iso_bucket(bucket, minutes)
            buckets[key] = {"accept": int(ok or 0), "reject": int(bad or 0)}

    # Fill empty buckets so the chart x-axis is continuous.
    out = []
    cursor = start.replace(minute=(start.minute // minutes) * minutes, second=0, microsecond=0)
    step = timedelta(minutes=minutes)
    while cursor <= now.replace(tzinfo=None):
        key = cursor.strftime("%Y-%m-%dT%H:%M:%S")
        b = buckets.get(key, {"accept": 0, "reject": 0})
        out.append({"t": key, "accept": b["accept"], "reject": b["reject"]})
        cursor += step
    return {"buckets": out}


def _iso_bucket(value: Any, minutes: int) -> str:
    """Normalize a bucket from either dialect to YYYY-MM-DDTHH:MM:00."""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%dT%H:%M:%S")
    s = str(value)
    if minutes >= 60:
        return s[:13] + ":00:00" if "T" in s else s
    return s[:16] + ":00" if "T" in s else s


async def alert_feed(db: AsyncSession, limit: int) -> list[AlertEvent]:
    stmt = select(AlertEvent).order_by(AlertEvent.created_at.desc()).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


async def mark_alert_read(db: AsyncSession, alert_id: int) -> AlertEvent | None:
    event = await db.get(AlertEvent, alert_id)
    if event is None:
        return None
    if event.read_at is None:
        event.read_at = datetime.now(UTC)
    return event
