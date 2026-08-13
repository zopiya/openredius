"""Policy management endpoints (docs/03「策略管理」)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.db import get_db
from openredius.core.deps import require_role
from openredius.core.errors import ApiError
from openredius.models import AccessUser, AdminRole, AdminUser, PolicyGroup, Vlan
from openredius.schemas.policies import (
    PolicyCreate,
    PolicyOut,
    PolicyReorder,
    PolicyToggle,
    PolicyUpdate,
)
from openredius.services import audit
from openredius.services.compiler import compile_policies

router = APIRouter()


async def _policy_out(db: AsyncSession, policy: PolicyGroup) -> PolicyOut:
    vlan = await db.get(Vlan, policy.vlan_id)
    user_count = await db.scalar(
        select(func.count(AccessUser.id)).where(AccessUser.policy_group_id == policy.id)
    )
    return PolicyOut(
        id=policy.id,
        name=policy.name,
        slug=policy.slug,
        description=policy.description,
        scope_dept=policy.scope_dept,
        eap_method=policy.eap_method,
        vlan_id=policy.vlan_id,
        vlan_name=vlan.name if vlan else None,
        acl_name=policy.acl_name,
        session_timeout_s=policy.session_timeout_s,
        reauth_interval_s=policy.reauth_interval_s,
        require_cert=policy.require_cert,
        require_mac_bind=policy.require_mac_bind,
        require_edr=policy.require_edr,
        time_window_enabled=policy.time_window_enabled,
        time_from=policy.time_from,
        time_to=policy.time_to,
        rate_limit_mbps=policy.rate_limit_mbps,
        priority=policy.priority,
        enabled=policy.enabled,
        user_count=int(user_count or 0),
        created_at=policy.created_at,
        updated_at=policy.updated_at,
    )


async def _check_vlan(db: AsyncSession, vlan_id: int) -> None:
    if await db.get(Vlan, vlan_id) is None:
        raise ApiError("not_found", f"vlan {vlan_id} not found", 404)


async def _check_name_slug_free(
    db: AsyncSession, *, name: str, slug: str, exclude_id: int | None = None
) -> None:
    stmt = select(PolicyGroup).where((PolicyGroup.name == name) | (PolicyGroup.slug == slug))
    if exclude_id is not None:
        stmt = stmt.where(PolicyGroup.id != exclude_id)
    clashes = (await db.execute(stmt)).scalars().all()
    if clashes:
        field = "name" if any(c.name == name for c in clashes) else "slug"
        raise ApiError("conflict", f"policy {field} already in use", 409)


@router.get("")
async def list_policies(
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> list[PolicyOut]:
    policies = (
        (await db.execute(select(PolicyGroup).order_by(PolicyGroup.priority.desc())))
        .scalars()
        .all()
    )
    return [await _policy_out(db, p) for p in policies]


@router.get("/{policy_id}")
async def get_policy(
    policy_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> PolicyOut:
    policy = await db.get(PolicyGroup, policy_id)
    if policy is None:
        raise ApiError("not_found", f"policy {policy_id} not found", 404)
    return await _policy_out(db, policy)


@router.post("", status_code=201)
async def create_policy(
    body: PolicyCreate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> PolicyOut:
    await _check_vlan(db, body.vlan_id)
    await _check_name_slug_free(db, name=body.name, slug=body.slug)
    policy = PolicyGroup(**body.model_dump())
    db.add(policy)
    await db.flush()
    await audit.record_audit(
        db,
        actor=admin.username,
        action="policy.create",
        target_type="policy_group",
        target_id=str(policy.id),
        detail={"name": policy.name, "slug": policy.slug},
    )
    await compile_policies(db, actor=admin.username, trigger="policy.create")
    await db.commit()
    await db.refresh(policy)
    return await _policy_out(db, policy)


def _apply_update(policy: PolicyGroup, body: PolicyUpdate) -> None:
    for field, value in body.model_dump().items():
        setattr(policy, field, value)


@router.put("/{policy_id}")
async def update_policy(
    policy_id: int,
    body: PolicyUpdate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> PolicyOut:
    policy = await db.get(PolicyGroup, policy_id)
    if policy is None:
        raise ApiError("not_found", f"policy {policy_id} not found", 404)
    await _check_vlan(db, body.vlan_id)
    await _check_name_slug_free(db, name=body.name, slug=body.slug, exclude_id=policy_id)
    _apply_update(policy, body)
    await audit.record_audit(
        db,
        actor=admin.username,
        action="policy.update",
        target_type="policy_group",
        target_id=str(policy_id),
        detail={"name": policy.name},
    )
    await compile_policies(db, actor=admin.username, trigger="policy.update")
    await db.commit()
    await db.refresh(policy)
    return await _policy_out(db, policy)


@router.patch("/{policy_id}")
async def toggle_policy(
    policy_id: int,
    body: PolicyToggle,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> PolicyOut:
    policy = await db.get(PolicyGroup, policy_id)
    if policy is None:
        raise ApiError("not_found", f"policy {policy_id} not found", 404)
    policy.enabled = body.enabled
    await audit.record_audit(
        db,
        actor=admin.username,
        action="policy.toggle",
        target_type="policy_group",
        target_id=str(policy_id),
        detail={"enabled": body.enabled},
    )
    await compile_policies(db, actor=admin.username, trigger="policy.toggle")
    await db.commit()
    await db.refresh(policy)
    return await _policy_out(db, policy)


@router.post("/reorder")
async def reorder_policies(
    body: PolicyReorder,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> list[PolicyOut]:
    policies = (
        (await db.execute(select(PolicyGroup).where(PolicyGroup.id.in_(body.order))))
        .scalars()
        .all()
    )
    total = await db.scalar(select(func.count(PolicyGroup.id)))
    if (
        len(body.order) != len(set(body.order))
        or len(policies) != len(body.order)
        or len(body.order) != int(total or 0)
    ):
        raise ApiError("validation_error", "order must list every policy exactly once", 422)
    by_id = {p.id: p for p in policies}
    # Highest priority first: the head of `order` is the strongest policy.
    top = len(body.order)
    for position, policy_id in enumerate(body.order):
        by_id[policy_id].priority = top - position
    await audit.record_audit(
        db,
        actor=admin.username,
        action="policy.reorder",
        target_type="policy_group",
        detail={"order": body.order},
    )
    await compile_policies(db, actor=admin.username, trigger="policy.reorder")
    await db.commit()
    return await list_policies(db=db, _admin=admin)


@router.delete("/{policy_id}", status_code=204)
async def delete_policy(
    policy_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> None:
    policy = await db.get(PolicyGroup, policy_id)
    if policy is None:
        raise ApiError("not_found", f"policy {policy_id} not found", 404)
    in_use = await db.scalar(
        select(func.count(AccessUser.id)).where(AccessUser.policy_group_id == policy_id)
    )
    if in_use:
        raise ApiError("policy_in_use", f"policy is assigned to {in_use} user(s)", 409)
    await db.delete(policy)
    await audit.record_audit(
        db,
        actor=admin.username,
        action="policy.delete",
        target_type="policy_group",
        target_id=str(policy_id),
        detail={"name": policy.name},
    )
    await compile_policies(db, actor=admin.username, trigger="policy.delete")
    await db.commit()
