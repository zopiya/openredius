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

    Auth chain:
      1. admin_user.password_hash (bootstrap admin or explicit-password users)
      2. admin_user.linked_account → radcheck Cleartext-Password (dev) /
         NT-Password hash (prod) / AD bind (delegated, docs/08)
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

    authed = False
    # 1. Direct password hash (bootstrap admin or explicit-password users)
    if admin.password_hash and verify_password(admin.password_hash, password):
        authed = True
    # 2. Linked access_user — local RADIUS password or AD bind (docs/08).
    elif admin.linked_account:
        authed = await _verify_linked_account(db, settings, admin.linked_account, password)

    if not authed:
        _register_failure(db, settings, admin, now)
        raise ApiError("invalid_credentials", "username or password is incorrect", 401)

    admin.fail_count = 0
    admin.first_failed_at = None
    admin.locked_until = None
    return admin


async def _verify_linked_account(
    db: AsyncSession, settings: Settings, account: str, password: str
) -> bool:
    """Verify a linked access_user's credential.

    Order (docs/08): radcheck ``Cleartext-Password`` (dev plaintext) →
    ``NT-Password`` (NTLM hash) → AD bind (delegated, requires ad_url).
    """
    from openredius.core.ntlm import ntlm_hash
    from openredius.radius.tables import radius_readable, radius_table

    if await radius_readable(db, "radcheck"):
        dialect = db.get_bind().dialect.name
        radcheck = radius_table(dialect, "radcheck")
        rows = (
            await db.execute(
                select(radcheck.c.attribute, radcheck.c.value).where(
                    radcheck.c.username == account, radcheck.c.op == ":="
                )
            )
        ).all()
        for attr, value in rows:
            if attr == "Cleartext-Password" and value == password:
                return True
            if attr == "NT-Password" and value.lower() == ntlm_hash(password):
                return True
    return await _verify_ad_bind(settings, account, password)


async def _verify_ad_bind(settings: Settings, account: str, password: str) -> bool:
    """Bind to AD as the account (docs/08「AD 直通」). Returns False if not
    configured or the bind DN cannot be derived from the LDAP URL."""
    bind_dn = _ad_bind_dn(settings, account)
    if bind_dn is None:
        return False
    from openredius.ldap_sync.ldap3_ import bind_auth

    return await bind_auth(settings.ad_url, bind_dn, password)


def _ad_bind_dn(settings: Settings, account: str) -> str | None:
    """Derive a UPN (``account@domain``) from the LDAP URL host."""
    import ipaddress
    from urllib.parse import urlparse

    if not settings.ad_url:
        return None
    host = urlparse(settings.ad_url).hostname
    if not host:
        return None
    try:
        ipaddress.ip_address(host)
        return None  # IP address — cannot derive a UPN domain
    except ValueError:
        pass
    return f"{account}@{host}"


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
    kwargs = {"admin_id": admin.id, "role": admin.role.value, "token_version": admin.token_version}
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
