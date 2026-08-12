"""User management endpoints (docs/03「用户管理」)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.config import get_settings
from openredius.core.db import get_db
from openredius.core.deps import current_admin, require_role
from openredius.core.errors import ApiError
from openredius.core.listing import PageParams, apply_sort, page_envelope
from openredius.models import (
    AccessUser,
    AdminRole,
    AdminUser,
    AdSyncJob,
    Endpoint,
    PolicyGroup,
    SyncTrigger,
    UserStatus,
)
from openredius.schemas.common import Affected
from openredius.schemas.users import (
    AdSyncJobOut,
    AdSyncResult,
    EndpointBrief,
    RecentAuth,
    StatusAction,
    UserDetail,
    UserOut,
    UserPolicyRequest,
    UserStatusRequest,
)
from openredius.services import audit
from openredius.services.compiler import compile_policies

router = APIRouter()

_SORT_COLUMNS = {
    "account": AccessUser.account,
    "name": AccessUser.name,
    "dept": AccessUser.dept,
    "status": AccessUser.status,
    "created_at": AccessUser.created_at,
}


async def _user_out(db: AsyncSession, user: AccessUser, endpoint_count: int) -> UserOut:
    policy_name = None
    if user.policy_group_id is not None:
        policy = await db.get(PolicyGroup, user.policy_group_id)
        policy_name = policy.name if policy else None
    return UserOut(
        id=user.id,
        account=user.account,
        name=user.name,
        dept=user.dept,
        title=user.title,
        status=user.status,
        locked_until=user.locked_until,
        policy_id=user.policy_group_id,
        policy_name=policy_name,
        source=user.source,
        endpoint_count=endpoint_count,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@router.get("", response_model=None)
async def list_users(
    dept: str | None = None,
    status: UserStatus | None = None,
    policy: int | None = Query(default=None, description="policy_group id"),
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1),
    sort: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(current_admin),
) -> dict:
    counts = (
        select(Endpoint.owner_user_id, func.count(Endpoint.id).label("cnt"))
        .where(Endpoint.owner_user_id.is_not(None))
        .group_by(Endpoint.owner_user_id)
        .subquery()
    )
    stmt = select(AccessUser, func.coalesce(counts.c.cnt, 0)).outerjoin(
        counts, counts.c.owner_user_id == AccessUser.id
    )
    if dept:
        stmt = stmt.where(AccessUser.dept == dept)
    if status:
        stmt = stmt.where(AccessUser.status == status)
    if policy is not None:
        stmt = stmt.where(AccessUser.policy_group_id == policy)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            func.lower(AccessUser.account).like(like) | func.lower(AccessUser.name).like(like)
        )
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    stmt = apply_sort(stmt, sort, _SORT_COLUMNS, "-created_at")
    params = PageParams(page, size)
    stmt = stmt.offset(params.offset).limit(params.size)
    rows = (await db.execute(stmt)).all()
    items = [await _user_out(db, user, int(count)) for user, count in rows]
    return page_envelope(items, int(total or 0), params)


@router.get("/{account}")
async def get_user(
    account: str,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(current_admin),
) -> UserDetail:
    user = (
        await db.execute(select(AccessUser).where(AccessUser.account == account.lower()))
    ).scalar_one_or_none()
    if user is None:
        raise ApiError("not_found", f"user {account!r} not found", 404)
    endpoints = (
        (await db.execute(select(Endpoint).where(Endpoint.owner_user_id == user.id)))
        .scalars()
        .all()
    )
    base = await _user_out(db, user, len(endpoints))
    return UserDetail(
        **base.model_dump(),
        recent_auth=await _recent_auth(db, user.account),
        endpoints=[
            EndpointBrief(
                mac=e.mac,
                etype=e.etype.value,
                compliance=e.compliance.value,
                whitelisted=e.whitelisted,
            )
            for e in endpoints
        ],
    )


async def _load_accounts(db: AsyncSession, accounts: list[str]) -> list[AccessUser]:
    users = (
        (await db.execute(select(AccessUser).where(AccessUser.account.in_(accounts))))
        .scalars()
        .all()
    )
    found = {u.account for u in users}
    missing = sorted(set(accounts) - found)
    if missing:
        raise ApiError("not_found", f"unknown accounts: {', '.join(missing)}", 404)
    return list(users)


# ── AD Sync ─────────────────────────────────────────────────────────────────


@router.post("/sync-ad", response_model=AdSyncResult)
async def trigger_ad_sync(
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN, AdminRole.OPERATOR)),
) -> AdSyncResult:
    """Trigger an incremental AD sync (async — returns immediately).

    The sync runs in the background via ``anyio.to_thread``. Poll
    ``GET /api/users/sync-records`` to track progress.
    """
    settings = get_settings()
    if not settings.ad_url or not settings.ad_base_dn:
        raise ApiError(
            "ad_not_configured",
            "AD sync is not configured (set OPENRADIUS_AD_URL / _BASE_DN)",
            503,
        )

    # Start sync immediately in a background task pattern.

    async def _run_in_background():
        async with db.bind.connect() as conn:
            async with conn.begin():
                from sqlalchemy.ext.asyncio import AsyncSession as AS

                _bg_db = AS(conn)
                from openredius.ldap_sync.ldap3_ import Ldap3Connector

                connector = Ldap3Connector(
                    settings.ad_url, settings.ad_bind_dn, settings.ad_bind_pw
                )
                try:
                    from openredius.ldap_sync import run_ad_sync as _do_sync

                    await _do_sync(
                        _bg_db,
                        settings,
                        connector,
                        triggered_by=SyncTrigger.MANUAL,
                        actor=admin.username,
                    )
                finally:
                    await connector.close()

    # Fire and forget; the job record is created synchronously first.
    import asyncio

    asyncio.ensure_future(_run_in_background())

    await audit.record_audit(
        db,
        actor=admin.username,
        action="ad_sync.triggered",
        target_type="ad_sync_job",
        detail={"triggered_by": "manual"},
    )
    await db.commit()

    return AdSyncResult(
        triggered=True,
        message="AD sync started in background. Check /api/users/sync-records for progress.",
    )


@router.get("/sync-records")
async def list_sync_records(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1),
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(current_admin),
) -> dict:
    """List AD sync job history (latest first)."""
    from openredius.core.listing import PageParams, page_envelope

    total = await db.scalar(select(func.count()).select_from(AdSyncJob))
    stmt = (
        select(AdSyncJob)
        .order_by(AdSyncJob.started_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    jobs = (await db.execute(stmt)).scalars().all()
    items = [
        AdSyncJobOut(
            id=j.id,
            triggered_by=j.triggered_by.value,
            started_at=j.started_at,
            finished_at=j.finished_at,
            status=j.status.value,
            added=j.added,
            updated=j.updated,
            disabled=j.disabled,
            error=j.error,
        )
        for j in jobs
    ]
    return page_envelope(items, int(total or 0), PageParams(page, size))


@router.get("/sync-records/{job_id}")
async def get_sync_record(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(current_admin),
) -> AdSyncJobOut:
    """Detail of a single AD sync job (includes error text)."""
    job = await db.get(AdSyncJob, job_id)
    if job is None:
        raise ApiError("not_found", f"sync job {job_id} not found", 404)
    return AdSyncJobOut(
        id=job.id,
        triggered_by=job.triggered_by.value,
        started_at=job.started_at,
        finished_at=job.finished_at,
        status=job.status.value,
        added=job.added,
        updated=job.updated,
        disabled=job.disabled,
        error=job.error,
    )


@router.post("/status", response_model=Affected)
async def update_user_status(
    body: UserStatusRequest,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN, AdminRole.OPERATOR)),
) -> Affected:
    users = await _load_accounts(db, [a.lower() for a in body.accounts])
    target = UserStatus.ACTIVE if body.action is StatusAction.ENABLE else UserStatus.DISABLED
    for user in users:
        user.status = target
        if target is UserStatus.ACTIVE:
            user.locked_until = None
        await audit.record_audit(
            db,
            actor=admin.username,
            action="user.status",
            target_type="access_user",
            target_id=user.account,
            detail={"status": target.value},
        )
    await compile_policies(db, actor=admin.username, trigger="user.status")
    await db.commit()
    return Affected(affected=len(users))


@router.post("/policy", response_model=Affected)
async def assign_user_policy(
    body: UserPolicyRequest,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN, AdminRole.OPERATOR)),
) -> Affected:
    policy = await db.get(PolicyGroup, body.policy_id)
    if policy is None:
        raise ApiError("not_found", f"policy {body.policy_id} not found", 404)
    users = await _load_accounts(db, [a.lower() for a in body.accounts])
    for user in users:
        user.policy_group_id = policy.id
        await audit.record_audit(
            db,
            actor=admin.username,
            action="user.policy",
            target_type="access_user",
            target_id=user.account,
            detail={"policy_id": policy.id, "policy": policy.name},
        )
    await compile_policies(db, actor=admin.username, trigger="user.policy")
    await db.commit()
    return Affected(affected=len(users))


_RECENT_AUTH_LIMIT = 5


async def _recent_auth(db: AsyncSession, account: str) -> list[RecentAuth]:
    """Last auth attempts from radpostauth (drawer 最近认证; empty on SQLite)."""
    from openredius.radius.tables import radius_readable, radius_table
    from openredius.services.reason import classify_reason

    if not await radius_readable(db, "radpostauth"):
        return []
    log = radius_table(db.get_bind().dialect.name, "radpostauth")
    rows = (
        await db.execute(
            select(log)
            .where(log.c.username == account)
            .order_by(log.c.authdate.desc())
            .limit(_RECENT_AUTH_LIMIT)
        )
    ).all()
    out: list[RecentAuth] = []
    for row in rows:
        mapping = row._mapping
        reason = classify_reason(mapping.get("class") or None)
        is_reject = mapping.get("reply") == "Access-Reject"
        out.append(
            RecentAuth(
                time=mapping["authdate"],
                reply=mapping.get("reply") or "",
                reason=reason.label if is_reject else None,
                reason_key=reason.key if is_reject else None,
                nas_ip=mapping.get("nasipaddress") or "",
                mac=mapping.get("callingstationid") or "",
            )
        )
    return out
