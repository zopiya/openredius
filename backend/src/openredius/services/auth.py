"""Authentication service: login lockout, token issue/rotate/revoke."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.config import Settings
from openredius.core.errors import ApiError
from openredius.core.security import (
    TOKEN_TYPE_REFRESH,
    decode_token,
    issue_access_token,
    issue_refresh_token,
    verify_password,
)
from openredius.models import AdminStatus, AdminUser, RevokedRefreshToken
from openredius.services import audit


async def find_admin_by_username(db: AsyncSession, username: str) -> AdminUser | None:
    result = await db.execute(select(AdminUser).where(AdminUser.username == username))
    return result.scalar_one_or_none()


def _utcnow(now: datetime | None) -> datetime:
    return now or datetime.now(UTC)


def _as_utc(value: datetime) -> datetime:
    """SQLite returns naive datetimes; treat them as UTC."""
    return value if value.tzinfo else value.replace(tzinfo=UTC)


async def authenticate_admin(
    db: AsyncSession,
    settings: Settings,
    *,
    username: str,
    password: str,
    now: datetime | None = None,
) -> AdminUser:
    """Verify credentials, enforcing the fail-count lockout policy.

    Lockout rule (docs/08): ``lockout_max_fails`` failures within
    ``lockout_window`` seconds lock the account for ``lockout_duration``.
    """
    now = _utcnow(now)
    admin = await find_admin_by_username(db, username)
    if admin is None:
        raise ApiError("invalid_credentials", "username or password is incorrect", 401)
    if admin.status is not AdminStatus.ACTIVE:
        raise ApiError("account_disabled", "admin account is disabled", 403)
    locked_until = admin.locked_until
    if locked_until is not None and _as_utc(locked_until) > now:
        retry_after = int((_as_utc(locked_until) - now).total_seconds())
        raise ApiError(
            "account_locked",
            "account is temporarily locked due to repeated failures",
            401,
            {"retry_after_seconds": retry_after},
        )

    if not verify_password(admin.password_hash, password):
        _register_failure(db, settings, admin, now)
        raise ApiError("invalid_credentials", "username or password is incorrect", 401)

    admin.fail_count = 0
    admin.first_failed_at = None
    admin.locked_until = None
    return admin


def _register_failure(
    db: AsyncSession, settings: Settings, admin: AdminUser, now: datetime
) -> None:
    if (
        admin.first_failed_at is None
        or (now - _as_utc(admin.first_failed_at)).total_seconds() > settings.lockout_window
    ):
        admin.fail_count = 0
        admin.first_failed_at = now
    admin.fail_count += 1
    if admin.fail_count >= settings.lockout_max_fails:
        admin.locked_until = datetime.fromtimestamp(
            now.timestamp() + settings.lockout_duration, UTC
        )
        admin.fail_count = 0
        admin.first_failed_at = None


def build_token_pair(settings: Settings, admin: AdminUser) -> tuple[str, str]:
    kwargs = {"admin_id": admin.id, "role": admin.role.value}
    return issue_access_token(settings, **kwargs), issue_refresh_token(settings, **kwargs)


async def validate_refresh_token(db: AsyncSession, settings: Settings, refresh_token: str) -> dict:
    """Decode a refresh token and ensure its jti is not revoked."""
    payload = decode_token(settings, refresh_token, expected_type=TOKEN_TYPE_REFRESH)
    revoked = await db.get(RevokedRefreshToken, payload["jti"])
    if revoked is not None:
        raise ApiError("token_revoked", "refresh token has been revoked", 401)
    return payload


async def revoke_refresh_token(db: AsyncSession, settings: Settings, refresh_token: str) -> None:
    payload = decode_token(settings, refresh_token, expected_type=TOKEN_TYPE_REFRESH)
    if await db.get(RevokedRefreshToken, payload["jti"]) is None:
        db.add(
            RevokedRefreshToken(
                jti=payload["jti"],
                expires_at=datetime.fromtimestamp(payload["exp"], UTC),
            )
        )
        await db.flush()


async def audit_login_result(
    db: AsyncSession, *, username: str, ok: bool, reason: str | None = None
) -> None:
    await audit.record_audit(
        db,
        actor=username,
        action="auth.login" if ok else "auth.login_failed",
        target_type="admin_user",
        target_id=username,
        detail=None if ok else {"reason": reason},
    )
