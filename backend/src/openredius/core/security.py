"""JWT issuing/verification and argon2 password hashing (docs/08)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import Argon2Error

from openredius.core.config import Settings
from openredius.core.errors import ApiError

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (Argon2Error, ValueError):
        return False


def _issue_token(
    settings: Settings,
    *,
    token_type: Literal["access", "refresh"],
    admin_id: int,
    role: str,
    ttl_seconds: int,
    token_version: int,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(admin_id),
        "role": role,
        "type": token_type,
        "ver": token_version,
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": now + timedelta(seconds=ttl_seconds),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def issue_access_token(settings: Settings, *, admin_id: int, role: str, token_version: int) -> str:
    return _issue_token(
        settings,
        token_type=TOKEN_TYPE_ACCESS,
        admin_id=admin_id,
        role=role,
        ttl_seconds=settings.jwt_access_ttl_seconds,
        token_version=token_version,
    )


def issue_refresh_token(settings: Settings, *, admin_id: int, role: str, token_version: int) -> str:
    return _issue_token(
        settings,
        token_type=TOKEN_TYPE_REFRESH,
        admin_id=admin_id,
        role=role,
        ttl_seconds=settings.jwt_refresh_ttl_seconds,
        token_version=token_version,
    )


def decode_token(settings: Settings, token: str, *, expected_type: str) -> dict[str, Any]:
    """Decode and validate a JWT. Raises ``ApiError(401)`` on any problem."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise ApiError("token_expired", "token has expired", 401) from None
    except jwt.InvalidTokenError:
        raise ApiError("token_invalid", "token is invalid", 401) from None
    if payload.get("type") != expected_type:
        raise ApiError("token_invalid", f"expected a {expected_type} token", 401)
    return payload


def parse_admin_id(payload: dict[str, Any]) -> int:
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise ApiError("token_invalid", "token subject is invalid", 401) from None


def token_version_of(payload: dict[str, Any]) -> int:
    """Token's embedded ``ver`` claim (0 for legacy tokens without one)."""
    try:
        return int(payload.get("ver", 0))
    except (TypeError, ValueError):
        return 0
