"""Continuous synthetic auth/accounting traffic for the live dashboard (docs/06).

Writes a few radpostauth rows (and occasionally opens/closes a radacct session)
every interval so the "30 秒自动刷新" dashboard visibly moves. Dev only —
PostgreSQL stack required, rows tagged for easy cleanup (``--reset``).

Usage:
    cd backend
    OPENRADIUS_DATABASE_URL='postgresql+asyncpg://…' \\
        uv run python ../deploy/scripts/demo_traffic.py [--interval 30] [--once]
"""

from __future__ import annotations

import argparse
import asyncio
import random
import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select

from openredius.core.config import get_settings
from openredius.core.db import close_db, get_session_factory, init_db
from openredius.models import AccessUser, NasDevice
from openredius.radius.tables import build_radius_metadata

MARKER = "__demo_traffic__"
_META = build_radius_metadata("radius")


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


async def tick(session_factory, rng: random.Random, open_sessions: list[dict]) -> None:
    log = _META.tables["radius.radpostauth"]
    acct = _META.tables["radius.radacct"]
    async with session_factory() as session:
        users = (await session.execute(select(AccessUser))).scalars().all()
        devices = (await session.execute(select(NasDevice))).scalars().all()
        if not users or not devices:
            raise SystemExit("demo_traffic needs seeded domain data; run seed_demo.py first")

        for _ in range(rng.randrange(1, 4)):
            user = rng.choice(users)
            device = rng.choice(devices)
            failed = rng.random() < 0.06
            await session.execute(
                log.insert().values(
                    username=user.account,
                    **{"pass": MARKER},
                    reply="Access-Reject" if failed else "Access-Accept",
                    calledstationid=device.name,
                    callingstationid=":".join(f"{rng.randrange(256):02X}" for _ in range(6)),
                    nasipaddress=device.nasname,
                    authdate=_now(),
                    **{"class": "reason=bad-password" if failed else ""},
                )
            )

        # Occasionally open a session; close the oldest open one to keep balance.
        if open_sessions and (rng.random() < 0.4 or len(open_sessions) > 6):
            closed = open_sessions.pop(0)
            await session.execute(
                acct.update()
                .where(acct.c.acctuniqueid == closed["uid"])
                .values(
                    acctstoptime=_now(),
                    acctterminatecause="User-Request",
                    acctsessiontime=closed["seconds"],
                )
            )
        if rng.random() < 0.6:
            uid = f"{MARKER}{uuid.uuid4().hex[:10]}"
            user = rng.choice(users)
            device = rng.choice(devices)
            await session.execute(
                acct.insert().values(
                    acctsessionid=uid,
                    acctuniqueid=uid,
                    username=user.account,
                    nasipaddress=device.nasname,
                    nasporttype="Wireless-802.11" if device.type.value in {"ap", "ac"} else "Ethernet",
                    acctstarttime=_now(),
                    acctupdatetime=_now(),
                    calledstationid=device.name,
                    callingstationid=":".join(f"{rng.randrange(256):02X}" for _ in range(6)),
                    servicetype="Framed-User",
                    framedipaddress=f"10.{rng.randrange(10, 30)}.{rng.randrange(255)}.{rng.randrange(1, 254)}",
                )
            )
            open_sessions.append({"uid": uid, "seconds": rng.randrange(60, 600)})
        await session.commit()


async def reset(session_factory) -> None:
    log = _META.tables["radius.radpostauth"]
    acct = _META.tables["radius.radacct"]
    async with session_factory() as session:
        await session.execute(delete(log).where(log.c["pass"] == MARKER))
        await session.execute(delete(acct).where(acct.c.acctuniqueid.like(f"{MARKER}%")))
        await session.commit()
    print("demo_traffic rows removed")


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--interval", type=float, default=30.0)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--reset", action="store_true", help="delete tagged rows and exit")
    parser.add_argument("--seed", type=int, default=None)
    args = parser.parse_args()

    settings = get_settings()
    init_db(settings.database_url)
    try:
        if "postgresql" not in settings.database_url:
            raise SystemExit("demo_traffic targets the PostgreSQL stack only")
        factory = get_session_factory()
        if args.reset:
            await reset(factory)
            return
        rng = random.Random(args.seed)
        open_sessions: list[dict] = []
        print(f"demo_traffic: writing synthetic events every {args.interval}s (Ctrl-C to stop)")
        while True:
            await tick(factory, rng, open_sessions)
            if args.once:
                break
            await asyncio.sleep(args.interval)
    finally:
        await close_db()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
