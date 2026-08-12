"""Helpers to materialize radius accounting tables in the SQLite test DB."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from openredius.core.db import get_engine, get_session_factory
from openredius.radius.tables import build_radius_metadata

_META = build_radius_metadata(None)


async def create_radius_tables() -> None:
    async with get_engine().begin() as conn:
        await conn.run_sync(_META.create_all)


def _dt(delta_minutes: float) -> datetime:
    return (datetime.now(UTC) + timedelta(minutes=delta_minutes)).replace(tzinfo=None)


async def insert_session(
    *,
    unique_id: str,
    username: str = "wang.lei",
    nas_ip: str = "10.99.0.11",
    mac: str = "3C:52:82:1A:4B:01",
    nas_port_id: str = "Gi1/0/12",
    nas_port_type: str = "Ethernet",
    started_minutes_ago: float = 30,
    stopped: bool = False,
    ip: str = "10.20.3.41",
) -> str:
    async with get_session_factory()() as session:
        await session.execute(
            _META.tables["radacct"]
            .insert()
            .values(
                acctsessionid=f"S-{unique_id}",
                acctuniqueid=unique_id,
                username=username,
                nasipaddress=nas_ip,
                nasportid=nas_port_id,
                nasporttype=nas_port_type,
                acctstarttime=_dt(-started_minutes_ago),
                acctupdatetime=_dt(-started_minutes_ago),
                acctstoptime=_dt(0) if stopped else None,
                acctsessiontime=int(started_minutes_ago * 60),
                calledstationid="00-1D-45-AC-10-01",
                callingstationid=mac,
                acctterminatecause="User-Request" if stopped else "",
                servicetype="Framed-User",
                framedipaddress=ip,
                acctinputoctets=1_000,
                acctoutputoctets=2_000,
            )
        )
        await session.commit()
    return unique_id


async def insert_postauth(
    *,
    username: str = "wang.lei",
    reply: str = "Access-Accept",
    class_value: str = "",
    minutes_ago: float = 5,
    nas_ip: str = "10.99.0.11",
    calling: str = "3C:52:82:1A:4B:01",
    password: str = "",
) -> None:
    async with get_session_factory()() as session:
        await session.execute(
            _META.tables["radpostauth"]
            .insert()
            .values(
                username=username,
                **{"pass": password},
                reply=reply,
                calledstationid="00-1D-45-AC-10-01",
                callingstationid=calling,
                nasipaddress=nas_ip,
                authdate=_dt(-minutes_ago),
                **{"class": class_value},
            )
        )
        await session.commit()
