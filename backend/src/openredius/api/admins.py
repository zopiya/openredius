"""Admin-account CRUD (docs/03 设置页; admin only, docs/08)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.db import get_db
from openredius.core.deps import require_role
from openredius.core.errors import ApiError
from openredius.core.security import hash_password
from openredius.models import AdminRole, AdminStatus, AdminUser
from openredius.schemas.admins import AdminCreate, AdminOut, AdminUpdate
from openredius.services import audit

router = APIRouter()


def _admin_out(admin: AdminUser) -> AdminOut:
    return AdminOut(
        id=admin.id,
        username=admin.username,
        display_name=admin.display_name,
        role=admin.role,
        status=admin.status,
        created_at=admin.created_at,
    )


async def _count_active_admins(db: AsyncSession, exclude_id: int | None = None) -> int:
    stmt = select(func.count(AdminUser.id)).where(
        AdminUser.role == AdminRole.ADMIN, AdminUser.status == AdminStatus.ACTIVE
    )
    if exclude_id is not None:
        stmt = stmt.where(AdminUser.id != exclude_id)
    return int(await db.scalar(stmt) or 0)


@router.get("")
async def list_admins(
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> list[AdminOut]:
    admins = (await db.execute(select(AdminUser).order_by(AdminUser.id))).scalars().all()
    return [_admin_out(a) for a in admins]


@router.post("", status_code=201)
async def create_admin(
    body: AdminCreate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> AdminOut:
    exists = (
        await db.execute(select(AdminUser).where(AdminUser.username == body.username))
    ).scalar_one_or_none()
    if exists is not None:
        raise ApiError("conflict", "username already in use", 409)
    created = AdminUser(
        username=body.username,
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(created)
    await db.flush()
    await audit.record_audit(
        db,
        actor=admin.username,
        action="admin.create",
        target_type="admin_user",
        target_id=created.username,
        detail={"role": created.role.value},
    )
    await db.commit()
    return _admin_out(created)


async def _guard_last_active_admin(
    db: AsyncSession, target: AdminUser, new_role: AdminRole, new_status: AdminStatus
) -> None:
    demoting = (
        target.role is AdminRole.ADMIN
        and target.status is AdminStatus.ACTIVE
        and (new_role is not AdminRole.ADMIN or new_status is not AdminStatus.ACTIVE)
    )
    if not demoting:
        return
    if await _count_active_admins(db, exclude_id=target.id) == 0:
        raise ApiError("last_active_admin", "cannot demote or disable the last active admin", 409)


@router.patch("/{admin_id}")
async def update_admin(
    admin_id: int,
    body: AdminUpdate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> AdminOut:
    target = await db.get(AdminUser, admin_id)
    if target is None:
        raise ApiError("not_found", f"admin {admin_id} not found", 404)
    new_role = body.role if body.role is not None else target.role
    new_status = body.status if body.status is not None else target.status
    await _guard_last_active_admin(db, target, new_role, new_status)
    changes: dict[str, str] = {}
    if body.display_name is not None and body.display_name != target.display_name:
        changes["display_name"] = f"{target.display_name!r} -> {body.display_name!r}"
        target.display_name = body.display_name
    if body.role is not None and body.role is not target.role:
        changes["role"] = f"{target.role.value} -> {body.role.value}"
        target.role = body.role
    if body.status is not None and body.status is not target.status:
        changes["status"] = f"{target.status.value} -> {body.status.value}"
        target.status = body.status
    if body.password is not None:
        target.password_hash = hash_password(body.password)
        changes["password"] = "<changed>"
    await audit.record_audit(
        db,
        actor=admin.username,
        action="admin.update",
        target_type="admin_user",
        target_id=target.username,
        detail={"changes": changes},
    )
    await db.commit()
    await db.refresh(target)
    return _admin_out(target)


@router.delete("/{admin_id}", status_code=204)
async def delete_admin(
    admin_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> None:
    target = await db.get(AdminUser, admin_id)
    if target is None:
        raise ApiError("not_found", f"admin {admin_id} not found", 404)
    if target.id == admin.id:
        raise ApiError("self_delete", "cannot delete your own account", 409)
    await _guard_last_active_admin(db, target, target.role, AdminStatus.DISABLED)
    await db.delete(target)
    await audit.record_audit(
        db,
        actor=admin.username,
        action="admin.delete",
        target_type="admin_user",
        target_id=target.username,
    )
    await db.commit()
