"""User management endpoints (docs/03「用户管理」)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.db import get_db
from openredius.core.deps import current_admin, require_role
from openredius.core.errors import ApiError
from openredius.core.listing import PageParams, apply_sort, page_envelope
from openredius.models import (
    AccessUser,
    AdminRole,
    AdminUser,
    Endpoint,
    PolicyGroup,
    UserStatus,
)
from openredius.schemas.common import Affected
from openredius.schemas.users import (
    EndpointBrief,
    StatusAction,
    UserDetail,
    UserOut,
    UserPolicyRequest,
    UserStatusRequest,
)
from openredius.services import audit

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
    await db.commit()
    return Affected(affected=len(users))
