"""Session service: active radacct ⋈ app metadata (docs/02 SessionRow mapping)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

from sqlalchemy import Select, String, and_, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.errors import ApiError
from openredius.core.listing import PageParams, apply_sort
from openredius.models import AccessUser, NasDevice, PolicyGroup, Vlan
from openredius.radius.tables import ip_text, radius_readable, radius_table
from openredius.schemas.sessions import SessionRowOut

_WIRELESS_PREFIX = "Wireless"
_EAP_LABELS = {"eap-tls": "EAP-TLS", "peap-mschapv2": "PEAP-MSCHAPv2"}
_CSV_CAP = 10_000


@dataclass(slots=True)
class SessionJoin:
    """One joined row: flat Core columns + ORM entities."""

    acct: SimpleNamespace
    user: AccessUser | None
    policy: PolicyGroup | None
    vlan: Vlan | None
    nas: NasDevice | None


def _split_row(row: Any, acct_columns: list[str]) -> SessionJoin:
    mapping = row._mapping
    acct = SimpleNamespace(**{c: mapping[c] for c in acct_columns})
    return SessionJoin(
        acct=acct,
        user=row.AccessUser,
        policy=row.PolicyGroup,
        vlan=row.Vlan,
        nas=row.NasDevice,
    )


@dataclass(slots=True)
class SessionFilters:
    dept: str | None = None
    method: str | None = None  # 有线 / WiFi / wired / wifi
    nas: str | None = None
    vlan: str | None = None
    auth: str | None = None
    q: str | None = None


def _radacct(db: AsyncSession):
    return radius_table(db.get_bind().dialect.name, "radacct")


def _normalize_method(value: str | None) -> str | None:
    if not value:
        return None
    v = value.strip().lower()
    if v in {"wifi", "无线", "wireless"}:
        return "wifi"
    if v in {"有线", "wired", "ethernet"}:
        return "wired"
    raise ApiError("invalid_method", f"unsupported method filter: {value}", 422)


def _normalize_auth(value: str | None) -> str | None:
    if not value:
        return None
    for key, label in _EAP_LABELS.items():
        if value.strip().lower() in {key, label.lower()}:
            return key
    raise ApiError("invalid_auth", f"unsupported auth filter: {value}", 422)


def _base_query(db: AsyncSession, active_only: bool, f: SessionFilters) -> Select:
    radacct = _radacct(db)
    # radacct.nasipaddress is `inet` on PostgreSQL — host() for string ops/joins.
    nas_ip = ip_text(db, radacct.c.nasipaddress)
    stmt = (
        select(radacct, AccessUser, PolicyGroup, Vlan, NasDevice)
        .select_from(radacct)
        .join(AccessUser, AccessUser.account == radacct.c.username, isouter=True)
        .join(PolicyGroup, PolicyGroup.id == AccessUser.policy_group_id, isouter=True)
        .join(Vlan, Vlan.id == PolicyGroup.vlan_id, isouter=True)
        .join(NasDevice, NasDevice.nasname == nas_ip, isouter=True)
    )
    if active_only:
        stmt = stmt.where(radacct.c.acctstoptime.is_(None))

    if f.dept:
        stmt = stmt.where(AccessUser.dept.ilike(f"%{f.dept}%"))
    method = _normalize_method(f.method)
    if method == "wifi":
        stmt = stmt.where(radacct.c.nasporttype.like(f"{_WIRELESS_PREFIX}%"))
    elif method == "wired":
        stmt = stmt.where(
            or_(
                radacct.c.nasporttype.is_(None),
                radacct.c.nasporttype.not_like(f"{_WIRELESS_PREFIX}%"),
            )
        )
    if f.nas:
        like = f"%{f.nas}%"
        stmt = stmt.where(or_(NasDevice.name.ilike(like), nas_ip.ilike(like)))
    if f.vlan:
        try:
            vid = int(f.vlan)
        except ValueError as exc:
            raise ApiError("invalid_vlan", f"vlan must be an integer: {f.vlan}", 422) from exc
        stmt = stmt.where(Vlan.vid == vid)
    auth = _normalize_auth(f.auth)
    if auth:
        stmt = stmt.where(PolicyGroup.eap_method == auth)
    if f.q:
        like = f"%{f.q}%"
        framed_ip = ip_text(db, radacct.c.framedipaddress)
        stmt = stmt.where(
            or_(
                radacct.c.username.ilike(like),
                AccessUser.name.ilike(like),
                radacct.c.callingstationid.ilike(like),
                framed_ip.ilike(like),
            )
        )
    return stmt


def _row_out(row: SessionJoin, now: datetime) -> SessionRowOut:
    acct, user, policy, vlan, nas = row.acct, row.user, row.policy, row.vlan, row.nas
    start = acct.acctstarttime.replace(tzinfo=UTC) if acct.acctstarttime else now
    elapsed = max(int((now - start).total_seconds()), 0)
    reauth = policy.reauth_interval_s if policy else None
    status = "reauth-pending" if reauth and elapsed > reauth else "online"
    nasporttype = acct.nasporttype or ""
    method = "WiFi" if nasporttype.startswith(_WIRELESS_PREFIX) else "有线"
    eap = policy.eap_method if policy else None
    vid = vlan.vid if vlan else None
    return SessionRowOut(
        acct_unique_id=acct.acctuniqueid,
        acct_session_id=acct.acctsessionid,
        username=acct.username,
        name=user.name if user else "",
        dept=user.dept if user else "",
        mac=acct.callingstationid or "",
        method=method,
        nas_name=nas.name if nas else "",
        nas_area=nas.area if nas else "",
        nas_ip=str(acct.nasipaddress),
        nas_port=acct.nasportid or "",
        called=acct.calledstationid or "",
        ip=str(acct.framedipaddress or ""),
        vlan=str(vid) if vid is not None else "",
        vlan_label=f"{vid} · {vlan.name}" if vlan else "",
        auth_method=_EAP_LABELS.get(eap, eap or ""),
        duration_s=elapsed,
        status=status,
        filter_id=policy.acl_name if policy else "",
        session_timeout=(
            str(policy.session_timeout_s) if policy and policy.session_timeout_s else ""
        ),
        start=start,
        bytes_in=int(acct.acctinputoctets or 0),
        bytes_out=int(acct.acctoutputoctets or 0),
    )


async def list_sessions(
    db: AsyncSession, f: SessionFilters, params: PageParams, sort: str | None = None
) -> dict[str, Any]:
    if not await radius_readable(db):
        return {"items": [], "total": 0, "page": params.page, "size": params.size}
    stmt = _base_query(db, active_only=True, f=f)
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    stmt = apply_sort(
        stmt,
        sort,
        {
            "start": _radacct(db).c.acctstarttime,
            "user": _radacct(db).c.username,
        },
        default="-start",
    )
    rows = (await db.execute(stmt.offset(params.offset).limit(params.size))).all()
    now = datetime.now(UTC)
    cols = [c.name for c in _radacct(db).columns]
    return {
        "items": [_row_out(_split_row(r, cols), now) for r in rows],
        "total": total,
        "page": params.page,
        "size": params.size,
    }


async def get_session_detail(
    db: AsyncSession, acct_unique_id: str
) -> tuple[SessionRowOut, dict[str, Any]] | None:
    """(row DTO, raw radacct attributes) or None."""
    if not await radius_readable(db):
        return None
    radacct = _radacct(db)
    stmt = _base_query(db, active_only=False, f=SessionFilters()).where(
        radacct.c.acctuniqueid == acct_unique_id
    )
    row = (await db.execute(stmt)).first()
    if row is None:
        return None
    joined = _split_row(row, [c.name for c in radacct.columns])
    out = _row_out(joined, datetime.now(UTC))
    attrs = {
        k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in vars(joined.acct).items()
    }
    return out, attrs


async def sessions_for_csv(db: AsyncSession, f: SessionFilters) -> list[SessionRowOut]:
    if not await radius_readable(db):
        return []
    stmt = _base_query(db, active_only=True, f=f).order_by(_radacct(db).c.acctstarttime.desc())
    rows = (await db.execute(stmt.limit(_CSV_CAP))).all()
    now = datetime.now(UTC)
    cols = [c.name for c in _radacct(db).columns]
    return [_row_out(_split_row(r, cols), now) for r in rows]


async def fetch_sessions_by_unique_ids(
    db: AsyncSession, acct_unique_ids: list[str]
) -> list[SessionJoin]:
    """Joined active rows for disconnect handling."""
    if not acct_unique_ids:
        return []
    radacct = _radacct(db)
    stmt = _base_query(db, active_only=True, f=SessionFilters()).where(
        radacct.c.acctuniqueid.in_(acct_unique_ids)
    )
    rows = (await db.execute(stmt)).all()
    cols = [c.name for c in radacct.columns]
    return [_split_row(r, cols) for r in rows]


async def close_session_fallback(db: AsyncSession, acct_unique_id: str) -> None:
    """Backend-side stop when the NAS never sent Accounting-Stop (docs/04 CoA)."""
    radacct = _radacct(db)
    await db.execute(
        radacct.update()
        .where(and_(radacct.c.acctuniqueid == acct_unique_id, radacct.c.acctstoptime.is_(None)))
        .values(
            acctstoptime=datetime.now(UTC).replace(tzinfo=None),
            acctterminatecause="Admin-Reset",
            connectinfo_stop="backend-closed",
        )
    )


@dataclass(slots=True)
class NasActivity:
    last_seen: datetime | None
    active_sessions: int


async def nas_activity(db: AsyncSession) -> dict[str, NasActivity]:
    """Per-NAS last-seen + active-session count (docs/02 NAS 在线状态)."""
    if not await radius_readable(db):
        return {}
    dialect = db.get_bind().dialect.name
    acct = radius_table(dialect, "radacct")
    log = radius_table(dialect, "radpostauth")
    acct_ip = ip_text(db, acct.c.nasipaddress)
    log_ip = cast(log.c.nasipaddress, String(64))

    last_seen: dict[str, datetime] = {}
    for ip, ts in (
        await db.execute(select(log_ip, func.max(log.c.authdate)).group_by(log_ip))
    ).all():
        if ip:
            last_seen[ip] = ts
    for ip, ts in (
        await db.execute(select(acct_ip, func.max(acct.c.acctupdatetime)).group_by(acct_ip))
    ).all():
        if ip and (ip not in last_seen or ts > last_seen[ip]):
            last_seen[ip] = ts

    active: dict[str, int] = {}
    for ip, n in (
        await db.execute(
            select(acct_ip, func.count()).where(acct.c.acctstoptime.is_(None)).group_by(acct_ip)
        )
    ).all():
        if ip:
            active[ip] = n

    ips = set(last_seen) | set(active)
    return {
        ip: NasActivity(last_seen=last_seen.get(ip), active_sessions=active.get(ip, 0))
        for ip in ips
    }


def nas_status(
    activity: NasActivity | None,
    window_s: int,
    capacity: int | None,
    high_load_ratio: float = 0.9,
) -> str:
    """online / offline / high-load (docs/02 派生规则)."""
    if activity is None or activity.last_seen is None:
        return "offline"
    now = datetime.now(UTC).replace(tzinfo=None)
    seen = activity.last_seen
    if seen < now - timedelta(seconds=window_s):
        return "offline"
    if capacity and capacity > 0 and activity.active_sessions / capacity >= high_load_ratio:
        return "high-load"
    return "online"


async def nas_ports(db: AsyncSession, nasname: str) -> list[dict]:
    """Active session detail per NAS port (docs/03 ports drawer)."""
    if not await radius_readable(db):
        return []
    radacct = _radacct(db)
    nas_ip_col = ip_text(db, radacct.c.nasipaddress)
    stmt = (
        select(
            radacct.c.nasportid,
            radacct.c.callingstationid,
            radacct.c.username,
            Vlan.vid,
            AccessUser.name,
        )
        .select_from(radacct)
        .join(AccessUser, AccessUser.account == radacct.c.username, isouter=True)
        .join(PolicyGroup, PolicyGroup.id == AccessUser.policy_group_id, isouter=True)
        .join(Vlan, Vlan.id == PolicyGroup.vlan_id, isouter=True)
        .where(radacct.c.acctstoptime.is_(None), nas_ip_col == nasname)
        .order_by(radacct.c.nasportid)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "port": row.nasportid or "",
            "mac": row.callingstationid or "",
            "user": row.name or row.username or "",
            "vlan": str(row.vid) if row.vid else "",
        }
        for row in rows
    ]


async def nas_ssids(db: AsyncSession, nasname: str) -> list[dict]:
    """SSID-level aggregation for wireless NAS (docs/03 ssids drawer)."""
    if not await radius_readable(db):
        return []
    radacct = _radacct(db)
    nas_ip_col = ip_text(db, radacct.c.nasipaddress)
    stmt = (
        select(
            radacct.c.calledstationid,
            func.count().label("count"),
            PolicyGroup.eap_method,
            Vlan.vid,
        )
        .select_from(radacct)
        .join(AccessUser, AccessUser.account == radacct.c.username, isouter=True)
        .join(PolicyGroup, PolicyGroup.id == AccessUser.policy_group_id, isouter=True)
        .join(Vlan, Vlan.id == PolicyGroup.vlan_id, isouter=True)
        .where(radacct.c.acctstoptime.is_(None), nas_ip_col == nasname)
        .group_by(
            radacct.c.calledstationid,
            PolicyGroup.eap_method,
            Vlan.vid,
        )
        .order_by(func.count().desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "ssid": row.calledstationid or "(unknown)",
            "auth": _EAP_LABELS.get(row.eap_method, row.eap_method or "-"),
            "count": str(row.count),
            "vlan": str(row.vid) if row.vid else "-",
        }
        for row in rows
    ]
