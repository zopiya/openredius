"""Alert engine + periodic maintenance (docs/04 jobs / docs/02 状态机).

Each function is a self-contained unit of work run by the scheduler on its own
session. Alert creation is de-duplicated per (rule_key, subject) within
``alerts_dedup_window_s`` so a flapping NAS doesn't spam the feed.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import String, cast, func, not_, select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.config import Settings
from openredius.models import (
    AccessUser,
    AlertEvent,
    AlertLevel,
    AlertRule,
    Compliance,
    Endpoint,
    NasDevice,
    UserStatus,
)
from openredius.radius.tables import ip_text, radius_readable, radius_table
from openredius.services import audit
from openredius.services.compiler import compile_policies

SYSTEM = "system"


def _now() -> datetime:
    return datetime.now(UTC)


async def _rule(db: AsyncSession, key: str) -> AlertRule | None:
    return (await db.execute(select(AlertRule).where(AlertRule.key == key))).scalar_one_or_none()


async def _recently_alerted(db: AsyncSession, rule_key: str, link: str, window_s: int) -> bool:
    cutoff = _now() - timedelta(seconds=window_s)
    exists = (
        await db.execute(
            select(AlertEvent.id)
            .where(AlertEvent.rule_key == rule_key, AlertEvent.link == link)
            .where(AlertEvent.created_at >= cutoff)
            .limit(1)
        )
    ).first()
    return exists is not None


async def _emit(
    db: AsyncSession,
    *,
    rule_key: str,
    subject: str,
    level: AlertLevel,
    title: str,
    message: str,
    link_path: str,
    dedup_window_s: int,
) -> AlertEvent | None:
    # Respect rule.enabled toggle — query directly to avoid conflating
    # "disabled" (→ skip) with "missing" (→ default-enabled).
    rule = (
        await db.execute(select(AlertRule).where(AlertRule.key == rule_key))
    ).scalar_one_or_none()
    if rule is not None and not rule.enabled:
        return None
    # link_path doubles as the de-dup identity (it embeds the subject).
    if await _recently_alerted(db, rule_key, link_path, dedup_window_s):
        return None
    event = AlertEvent(rule_key=rule_key, level=level, title=title, message=message, link=link_path)
    db.add(event)
    await db.flush()
    return event


# --- nas_watchdog -----------------------------------------------------------


async def nas_watchdog(db: AsyncSession, settings: Settings) -> dict[str, int]:
    """Offline + high-load NAS detection (docs/02 派生状态)."""
    created = {"offline": 0, "high_load": 0}
    rule = await _rule(db, "nas_offline")
    load_rule = await _rule(db, "ap_high_load")
    devices = list((await db.execute(select(NasDevice))).scalars().all())
    if not devices:
        return created

    last_seen: dict[str, datetime] = {}
    active_sessions: dict[str, int] = {}
    if await radius_readable(db):
        log = radius_table(db.get_bind().dialect.name, "radpostauth")
        acct = radius_table(db.get_bind().dialect.name, "radacct")
        log_ip = cast(log.c.nasipaddress, String(64))
        acct_ip = ip_text(db, acct.c.nasipaddress)
        rows = (await db.execute(select(log_ip, func.max(log.c.authdate)).group_by(log_ip))).all()
        for ip, ts in rows:
            if ip:
                last_seen[ip] = ts
        rows = (
            await db.execute(select(acct_ip, func.max(acct.c.acctupdatetime)).group_by(acct_ip))
        ).all()
        for ip, ts in rows:
            if ip and (ip not in last_seen or ts > last_seen[ip]):
                last_seen[ip] = ts
        rows = (
            await db.execute(
                select(acct_ip, func.count()).where(acct.c.acctstoptime.is_(None)).group_by(acct_ip)
            )
        ).all()
        active_sessions = {ip: n for ip, n in rows if ip}

    offline_minutes = ((rule.threshold_json if rule else None) or {}).get("offline_minutes", 5)
    load_pct = ((load_rule.threshold_json if load_rule else None) or {}).get("load_pct", 90)
    window = settings.nas_online_window
    now_naive = _now().replace(tzinfo=None)

    for dev in devices:
        ip = dev.nasname
        seen = last_seen.get(ip)
        # Offline: has history but silent beyond window + threshold.
        if seen is not None and seen < now_naive - timedelta(seconds=window):
            offline_for = int((now_naive - seen).total_seconds() // 60)
            if offline_for >= offline_minutes and await _emit(
                db,
                rule_key="nas_offline",
                subject=dev.name,
                level=AlertLevel.CRITICAL,
                title=f"NAS 离线:{dev.name}",
                message=f"{dev.name}({ip})已 {offline_for} 分钟无认证/计费流量",
                link_path=f"/devices?focus={dev.name}",
                dedup_window_s=settings.alerts_dedup_window_s,
            ):
                created["offline"] += 1
        # High load: active sessions vs capacity.
        if dev.capacity and dev.capacity > 0:
            load = active_sessions.get(ip, 0)
            pct = load / dev.capacity * 100
            if pct >= load_pct and await _emit(
                db,
                rule_key="ap_high_load",
                subject=dev.name,
                level=AlertLevel.WARNING,
                title=f"设备高负载:{dev.name}",
                message=f"{dev.name} 活跃会话 {load}/{dev.capacity}({pct:.0f}%)",
                link_path=f"/devices?focus={dev.name}",
                dedup_window_s=settings.alerts_dedup_window_s,
            ):
                created["high_load"] += 1
    if created["offline"] or created["high_load"]:
        await audit.record_audit(db, actor=SYSTEM, action="jobs.nas_watchdog", detail=created)
    return created


# --- lockout_sweeper --------------------------------------------------------


async def lockout_sweeper(db: AsyncSession, settings: Settings) -> dict[str, int]:
    """Unlock expired locks; lock users exceeding recent-failure threshold."""
    stats = {"unlocked": 0, "locked": 0}
    now = _now()

    expired = (
        (
            await db.execute(
                select(AccessUser).where(
                    AccessUser.status == UserStatus.LOCKED,
                    AccessUser.locked_until.is_not(None),
                    AccessUser.locked_until <= now,
                )
            )
        )
        .scalars()
        .all()
    )
    for user in expired:
        user.status = UserStatus.ACTIVE
        user.locked_until = None
        stats["unlocked"] += 1
        await audit.record_audit(
            db,
            actor=SYSTEM,
            action="user.unlock_expired",
            target_type="access_user",
            target_id=user.account,
        )

    if stats["unlocked"]:
        await compile_policies(db, actor=SYSTEM, trigger="jobs.lockout_unlock")

    # Lock: count Access-Reject in window per user from radpostauth.
    if await radius_readable(db, "radpostauth"):
        log = radius_table(db.get_bind().dialect.name, "radpostauth")
        cutoff = now.replace(tzinfo=None) - timedelta(seconds=settings.lockout_window)
        rows = (
            await db.execute(
                select(log.c.username, func.count().label("n"))
                .where(
                    log.c.reply == "Access-Reject",
                    log.c.authdate >= cutoff,
                    # Policy rejects carry reason=<key>; only bare auth
                    # failures (bad password / unknown user) count.
                    not_(log.c["class"].like("reason=%")),
                )
                .group_by(log.c.username)
            )
        ).all()
        threshold = settings.lockout_max_fails
        for username, n in rows:
            if n < threshold:
                continue
            user = (
                await db.execute(select(AccessUser).where(AccessUser.account == username))
            ).scalar_one_or_none()
            # Only ACTIVE accounts transition to locked (docs/02 状态机):
            # DISABLED stays disabled, LOCKED is already handled.
            if user is None or user.status != UserStatus.ACTIVE:
                continue
            user.status = UserStatus.LOCKED
            user.locked_until = now + timedelta(seconds=settings.lockout_duration)
            stats["locked"] += 1
            await audit.record_audit(
                db,
                actor=SYSTEM,
                action="user.lock",
                target_type="access_user",
                target_id=user.account,
                detail={"fails": n, "window_s": settings.lockout_window},
            )
            await _emit(
                db,
                rule_key="account_locked",
                subject=user.account,
                level=AlertLevel.WARNING,
                title=f"账号锁定:{user.account}",
                message=(
                    f"{user.account} 在 {settings.lockout_window // 60} 分钟内失败 {n} 次,已锁定"
                ),
                link_path=f"/users?focus={user.account}",
                dedup_window_s=settings.alerts_dedup_window_s,
            )
        if stats["locked"]:
            await compile_policies(db, actor=SYSTEM, trigger="jobs.lockout_lock")
    return stats


# --- cert_scan --------------------------------------------------------------


async def cert_scan(db: AsyncSession, settings: Settings) -> dict[str, int]:
    """Endpoint certificate expiry → compliance state + warn alert."""
    stats = {"expired": 0, "expiring": 0}
    now = _now()
    warn_days = settings.cert_expire_warn_days
    endpoints = list((await db.execute(select(Endpoint))).scalars().all())
    for ep in endpoints:
        if ep.whitelisted or ep.compliance == Compliance.WHITE:
            continue
        if ep.cert_not_after is None:
            continue
        expiry = (
            ep.cert_not_after if ep.cert_not_after.tzinfo else ep.cert_not_after.replace(tzinfo=UTC)
        )
        if expiry <= now:
            if ep.compliance != Compliance.BAD:
                ep.compliance = Compliance.BAD
                ep.comp_detail = "证书已过期"
                stats["expired"] += 1
        elif expiry <= now + timedelta(days=warn_days):
            if ep.compliance == Compliance.OK:
                ep.compliance = Compliance.WARN
                ep.comp_detail = f"证书 {warn_days} 天内到期"
                stats["expiring"] += 1
                await _emit(
                    db,
                    rule_key="cert_expiring",
                    subject=ep.mac,
                    level=AlertLevel.INFO,
                    title=f"证书临期:{ep.mac}",
                    message=f"终端 {ep.mac} 证书将于 {expiry:%Y-%m-%d} 到期",
                    link_path=f"/devices/endpoints?focus={ep.mac}",
                    dedup_window_s=settings.alerts_dedup_window_s,
                )
    if stats["expired"] or stats["expiring"]:
        await audit.record_audit(db, actor=SYSTEM, action="jobs.cert_scan", detail=stats)
    return stats


# --- alert_gc ---------------------------------------------------------------


async def alert_gc(db: AsyncSession, settings: Settings) -> int:
    """Drop read alerts older than the retention window (docs/04)."""
    cutoff = _now() - timedelta(days=settings.alerts_retention_days)
    stale = (
        (
            await db.execute(
                select(AlertEvent).where(
                    AlertEvent.read_at.is_not(None), AlertEvent.created_at < cutoff
                )
            )
        )
        .scalars()
        .all()
    )
    for event in stale:
        await db.delete(event)
    if stale:
        await audit.record_audit(
            db, actor=SYSTEM, action="jobs.alert_gc", detail={"deleted": len(stale)}
        )
    return len(stale)
