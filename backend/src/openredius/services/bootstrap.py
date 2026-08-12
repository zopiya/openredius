"""First-start bootstrap: create the initial admin from env (docs/08)."""

from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.config import Settings
from openredius.core.security import hash_password
from openredius.models import AdminRole, AdminUser
from openredius.services import audit

logger = logging.getLogger("openredius.bootstrap")

_MIN_BOOTSTRAP_PASSWORD_LEN = 10  # docs/08: 管理员口令最小长度 10


async def bootstrap_admin(db: AsyncSession, settings: Settings) -> None:
    """Create the initial admin once, when no admin exists yet."""
    if not settings.bootstrap_admin_user or not settings.bootstrap_admin_password:
        return
    count = await db.scalar(select(func.count()).select_from(AdminUser))
    if count:
        return
    if len(settings.bootstrap_admin_password) < _MIN_BOOTSTRAP_PASSWORD_LEN:
        raise RuntimeError(
            f"bootstrap admin password must be at least {_MIN_BOOTSTRAP_PASSWORD_LEN} chars"
        )
    admin = AdminUser(
        username=settings.bootstrap_admin_user,
        display_name=settings.bootstrap_admin_user,
        password_hash=hash_password(settings.bootstrap_admin_password),
        role=AdminRole.ADMIN,
    )
    db.add(admin)
    await db.flush()
    await audit.record_audit(
        db,
        actor="system",
        action="admin.bootstrap",
        target_type="admin_user",
        target_id=admin.username,
    )
    await db.commit()
    logger.warning("bootstrap admin '%s' created — change its password immediately", admin.username)
