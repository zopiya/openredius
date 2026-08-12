"""Auth endpoints: login / refresh / logout / me (docs/03)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.config import Settings
from openredius.core.db import get_db
from openredius.core.deps import current_admin, get_app_settings
from openredius.core.errors import ApiError
from openredius.core.ratelimit import SlidingWindowRateLimiter
from openredius.core.security import parse_admin_id
from openredius.models import AdminStatus, AdminUser
from openredius.schemas.auth import (
    AdminProfile,
    LoginRequest,
    LogoutRequest,
    RefreshRequest,
    TokenResponse,
)
from openredius.services import audit
from openredius.services import auth as auth_service

router = APIRouter()


def _token_response(settings: Settings, admin: AdminUser) -> TokenResponse:
    access, refresh = auth_service.build_token_pair(settings, admin)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        expires_in=settings.jwt_access_ttl_seconds,
        user=AdminProfile(
            username=admin.username,
            display_name=admin.display_name,
            role=admin.role.value,
        ),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    body: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> TokenResponse:
    client_ip = request.client.host if request.client else "unknown"
    limiter: SlidingWindowRateLimiter = request.app.state.login_rate_limiter
    if not limiter.allow(client_ip):
        raise ApiError("rate_limited", "too many login attempts, slow down", 429)
    try:
        admin = await auth_service.authenticate_admin(
            db, settings, username=body.username, password=body.password
        )
    except ApiError as exc:
        await auth_service.audit_login_result(db, username=body.username, ok=False, reason=exc.code)
        await db.commit()
        raise
    await auth_service.audit_login_result(db, username=body.username, ok=True)
    await db.commit()
    return _token_response(settings, admin)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> TokenResponse:
    payload = await auth_service.validate_refresh_token(db, settings, body.refresh_token)
    admin = await db.get(AdminUser, parse_admin_id(payload))
    if admin is None:
        raise ApiError("unauthorized", "admin not found", 401)
    if admin.status is not AdminStatus.ACTIVE:
        raise ApiError("account_disabled", "admin account is disabled", 403)
    # Rotation: the presented refresh token is single-use.
    await auth_service.revoke_refresh_token(db, settings, body.refresh_token)
    await db.commit()
    return _token_response(settings, admin)


@router.post("/logout")
async def logout(
    body: LogoutRequest,
    admin: AdminUser = Depends(current_admin),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_app_settings),
) -> dict[str, str]:
    await auth_service.revoke_refresh_token(db, settings, body.refresh_token)
    await audit.record_audit(
        db,
        actor=admin.username,
        action="auth.logout",
        target_type="admin_user",
        target_id=str(admin.id),
    )
    await db.commit()
    return {"status": "ok"}


@router.get("/me", response_model=AdminProfile)
async def me(admin: AdminUser = Depends(current_admin)) -> AdminProfile:
    return AdminProfile(
        username=admin.username,
        display_name=admin.display_name,
        role=admin.role.value,
    )
