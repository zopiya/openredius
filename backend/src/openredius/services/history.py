"""Synthetic RADIUS history for dashboards/reports (docs/09, docs/06).

PostgreSQL only: writes ``radpostauth`` (auth attempts) and ``radacct``
(sessions) into the FreeRADIUS-owned ``radius`` schema, sized like the real
thing — ~2k auths/day, ~8% failures distributed per the docs/02 reason
classes, plus matching accounting rows and a sprinkle of old alerts.

Synthetic rows are tagged (``SYNTH-`` session ids / ``__synthetic__`` pass)
so re-runs delete only their own data — real radtest traffic survives.

"""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select

from openredius.models import AccessUser, AlertEvent, AlertLevel, Endpoint, NasDevice, PolicyGroup

SYNTH_PASS_MARKER = "__synthetic__"
SYNTH_SESSION_PREFIX = "SYNTH-"
_CHUNK = 1_000

# Failure mix mirrors the prototype reports.html donut (docs/02 归类).
FAILURE_MIX = [
    ("bad-password", 0.38),
    ("cert-expired", 0.24),
    ("non-compliant", 0.16),
    ("mac-unbound", 0.12),
    ("account-locked", 0.06),
    ("time-policy", 0.04),
]
FAILURE_RATE = 0.08

_ALERT_TEMPLATES = [
    ("nas_offline", AlertLevel.CRITICAL, "NAS 离线:{nas}", "{nas} 超过 5 分钟无认证流量"),
    ("ap_high_load", AlertLevel.WARNING, "设备高负载:{nas}", "{nas} 活跃会话接近容量上限"),
    ("cert_expiring", AlertLevel.INFO, "证书临期:{mac}", "终端 {mac} 证书 14 天内到期"),
    ("account_locked", AlertLevel.WARNING, "账号锁定:{user}", "{user} 连续认证失败已被锁定"),
]


def _pick_failure(rng: random.Random) -> str:
    roll = rng.random()
    acc = 0.0
    for key, share in FAILURE_MIX:
        acc += share
        if roll <= acc:
            return key
    return "bad-password"


async def _load_pools(session_factory) -> dict:
    async with session_factory() as session:
        users = (await session.execute(select(AccessUser))).scalars().all()
        policies = {p.id: p for p in (await session.execute(select(PolicyGroup))).scalars().all()}
        devices = (await session.execute(select(NasDevice))).scalars().all()
        endpoints = (await session.execute(select(Endpoint))).scalars().all()
    if not users or not devices:
        raise SystemExit("generate_history needs seeded domain data; run seed_demo.py first")
    macs_by_user: dict[int, list[str]] = {}
    for ep in endpoints:
        if ep.owner_user_id is not None:
            macs_by_user.setdefault(ep.owner_user_id, []).append(ep.mac)
    return {
        "users": users,
        "policies": policies,
        "devices": devices,
        "macs_by_user": macs_by_user,
    }


def _mac_for(rng: random.Random, pools: dict, user) -> str:
    owned = pools["macs_by_user"].get(user.id)
    if owned:
        return rng.choice(owned)
    return ":".join(f"{rng.randrange(256):02X}" for _ in range(6))


def _random_ip(rng: random.Random) -> str:
    return f"10.{rng.randrange(10, 30)}.{rng.randrange(255)}.{rng.randrange(1, 254)}"


def _hour_weight(hour: int) -> float:
    # Workday curve: peaks 09–11 and 14–17, quiet overnight.
    if 9 <= hour <= 11 or 14 <= hour <= 17:
        return 3.0
    if 8 <= hour <= 18:
        return 1.6
    if 0 <= hour < 6:
        return 0.15
    return 0.6


async def generate_history(
    session_factory, days: int = 30, rng_seed: int | None = None
) -> dict[str, int]:
    from openredius.radius.tables import build_radius_metadata

    rng = random.Random(rng_seed)
    meta = build_radius_metadata("radius")
    log = meta.tables["radius.radpostauth"]
    acct = meta.tables["radius.radacct"]
    pools = await _load_pools(session_factory)
    users, policies, devices = pools["users"], pools["policies"], pools["devices"]

    now = datetime.now(UTC)
    # `days` is inclusive of today: day index runs from -(days-1) .. 0.
    start_day = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    postauth_rows: list[dict] = []
    acct_rows: list[dict] = []
    seq = 0

    for day in range(days):
        day_start = start_day + timedelta(days=day)
        is_last_day = day == days - 1
        auth_count = max(200, int(rng.gauss(2000, 300)))
        hours = list(range(24))
        weights = [_hour_weight(h) for h in hours]
        for _ in range(auth_count):
            seq += 1
            hour = rng.choices(hours, weights=weights)[0]
            ts = day_start + timedelta(
                hours=hour, minutes=rng.randrange(60), seconds=rng.randrange(60)
            )
            if ts >= now:
                continue
            user = rng.choice(users)
            device = rng.choice(devices)
            mac = _mac_for(rng, pools, user)
            failed = rng.random() < FAILURE_RATE
            reason = _pick_failure(rng) if failed else None
            postauth_rows.append(
                {
                    "username": user.account,
                    "pass": SYNTH_PASS_MARKER,
                    "reply": "Access-Reject" if failed else "Access-Accept",
                    "calledstationid": device.name,
                    "callingstationid": mac,
                    "nasipaddress": device.nasname,
                    "authdate": ts.replace(tzinfo=None),
                    "class": "" if reason is None else f"reason={reason}",
                }
            )
            # ~60% of successful auths open a session.
            if failed or rng.random() > 0.6:
                continue
            policy = policies.get(user.policy_group_id)
            duration_s = rng.randrange(30 * 60, 8 * 3600)
            stop_ts = ts + timedelta(seconds=duration_s)
            active = is_last_day and stop_ts > now
            wireless = device.type.value == "ap" or device.type.value == "ac"
            acct_rows.append(
                {
                    "acctsessionid": f"{SYNTH_SESSION_PREFIX}{seq:07d}",
                    "acctuniqueid": f"{SYNTH_SESSION_PREFIX}{seq:07d}",
                    "username": user.account,
                    "groupname": policy.slug if policy else "",
                    "realm": "",
                    "nasipaddress": device.nasname,
                    "nasportid": f"Gi{rng.randrange(1, 4)}/0/{rng.randrange(1, 48)}",
                    "nasporttype": "Wireless-802.11" if wireless else "Ethernet",
                    "acctstarttime": ts.replace(tzinfo=None),
                    "acctupdatetime": ts.replace(tzinfo=None),
                    "acctstoptime": None if active else min(stop_ts, now).replace(tzinfo=None),
                    "acctsessiontime": int((min(stop_ts, now) - ts).total_seconds()),
                    "acctauthentic": "RADIUS",
                    "acctinputoctets": rng.randrange(10_000_000),
                    "acctoutputoctets": rng.randrange(50_000_000),
                    "calledstationid": device.name,
                    "callingstationid": mac,
                    "acctterminatecause": "" if active else "User-Request",
                    "servicetype": "Framed-User",
                    "framedipaddress": _random_ip(rng),
                }
            )

    async with session_factory() as session:
        await session.execute(delete(log).where(log.c["pass"] == SYNTH_PASS_MARKER))
        await session.execute(
            delete(acct).where(acct.c.acctuniqueid.like(f"{SYNTH_SESSION_PREFIX}%"))
        )
        for i in range(0, len(postauth_rows), _CHUNK):
            await session.execute(log.insert(), postauth_rows[i : i + _CHUNK])
        for i in range(0, len(acct_rows), _CHUNK):
            await session.execute(acct.insert(), acct_rows[i : i + _CHUNK])
        await _seed_alert_history(session, pools, days, rng)
        await session.commit()

    return {"postauth": len(postauth_rows), "radacct": len(acct_rows), "days": days}


async def _seed_alert_history(session, pools: dict, days: int, rng: random.Random) -> None:
    """A few old (mostly read) alerts so the feed has history."""
    await session.execute(delete(AlertEvent).where(AlertEvent.message.like("%[synthetic]%")))
    now = datetime.now(UTC)
    count = max(3, days // 7 * rng.randrange(1, 3))
    devices = pools["devices"]
    users = pools["users"]
    for _ in range(count):
        key, level, title, message = rng.choice(_ALERT_TEMPLATES)
        nas = rng.choice(devices).name
        template_ctx = {
            "nas": nas,
            "mac": _mac_for(rng, pools, rng.choice(users)),
            "user": rng.choice(users).account,
        }
        created = now - timedelta(days=rng.uniform(0.5, days))
        session.add(
            AlertEvent(
                rule_key=key,
                level=level,
                title=title.format(**template_ctx),
                message=message.format(**template_ctx) + " [synthetic]",
                link=f"/{key}",
                created_at=created,
                read_at=created + timedelta(minutes=rng.randrange(5, 120))
                if rng.random() < 0.8
                else None,
            )
        )
