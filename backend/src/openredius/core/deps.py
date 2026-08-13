"""FastAPI dependencies: current admin, RBAC guard (docs/08 matrix)."""

from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.config import Settings
from openredius.core.db import get_db
from openredius.core.errors import ApiError
from openredius.core.security import (
    TOKEN_TYPE_ACCESS,
    decode_token,
    parse_admin_id,
    token_version_of,
)
from openredius.models import AdminRole, AdminStatus, AdminUser

_bearer = HTTPBearer(auto_error=False)


def get_app_settings(request: Request) -> Settings:
    """Settings bound to the running app (test apps carry their own)."""
    return request.app.state.settings


async def current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> AdminUser:
    if credentials is None:
        raise ApiError("unauthorized", "missing bearer token", 401)
    payload = decode_token(settings, credentials.credentials, expected_type=TOKEN_TYPE_ACCESS)
    admin = await db.get(AdminUser, parse_admin_id(payload))
    if admin is None:
        raise ApiError("unauthorized", "admin not found", 401)
    # Role/status are re-checked from the DB on every request (docs/08).
    if admin.status is not AdminStatus.ACTIVE:
        raise ApiError("account_disabled", "admin account is disabled", 403)
    # Password change bumps token_version, invalidating older tokens (docs/08).
    if token_version_of(payload) != admin.token_version:
        raise ApiError("token_invalid", "token has been superseded", 401)
    return admin


def require_role(*roles: AdminRole) -> Callable[..., AdminUser]:
    """RBAC guard factory: ``Depends(require_role(AdminRole.ADMIN))``."""

    async def guard(admin: AdminUser = Depends(current_admin)) -> AdminUser:
        if admin.role not in roles:
            raise ApiError("forbidden", "insufficient role", 403)
        return admin

    return guard
