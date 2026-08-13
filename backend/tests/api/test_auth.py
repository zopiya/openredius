"""Auth endpoints: login / refresh / logout / me + lockout + audit (docs/03, 08)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from openredius.models import AdminRole, AdminStatus, AdminUser, AuditLog
from tests.conftest import BOOTSTRAP_PASSWORD, BOOTSTRAP_USER, create_admin_user

OPERATOR_PASSWORD = "operator-password-1"


async def login(client, username=BOOTSTRAP_USER, password=BOOTSTRAP_PASSWORD):
    return await client.post("/api/auth/login", json={"username": username, "password": password})


async def test_login_success_returns_token_pair(client):
    resp = await login(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["expires_in"] == 15 * 60
    assert body["user"] == {
        "username": BOOTSTRAP_USER,
        "display_name": BOOTSTRAP_USER,
        "role": "admin",
    }


async def test_login_writes_audit(client, db_session):
    await login(client)
    await login(client, password="wrong-password-123")
    rows = (await db_session.execute(select(AuditLog))).scalars().all()
    actions = {r.action for r in rows}
    assert "auth.login" in actions
    assert "auth.login_failed" in actions
    failed = next(r for r in rows if r.action == "auth.login_failed")
    assert failed.actor == BOOTSTRAP_USER
    assert failed.ip  # request context hook fills the client IP


async def test_login_wrong_password(client):
    resp = await login(client, password="wrong-password-123")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_credentials"


async def test_login_unknown_user(client):
    resp = await login(client, username="ghost")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_credentials"


async def test_login_disabled_admin(client):
    await create_admin_user("off", OPERATOR_PASSWORD, AdminRole.OPERATOR, disabled=True)
    resp = await login(client, username="off", password=OPERATOR_PASSWORD)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "account_disabled"


async def test_login_lockout_after_five_failures(client):
    for _ in range(5):
        resp = await login(client, password="wrong-password-123")
        assert resp.status_code == 401
    # 6th attempt — even the correct password is rejected while locked.
    resp = await login(client)
    assert resp.status_code == 401
    error = resp.json()["error"]
    assert error["code"] == "account_locked"
    assert 0 < error["details"]["retry_after_seconds"] <= 1800


async def test_lockout_expires(client, db_session):
    for _ in range(5):
        await login(client, password="wrong-password-123")
    admin = (
        await db_session.execute(select(AdminUser).where(AdminUser.username == BOOTSTRAP_USER))
    ).scalar_one()
    admin.locked_until = datetime.now(UTC) - timedelta(seconds=1)
    await db_session.commit()
    assert (await login(client)).status_code == 200


async def test_refresh_rotates_tokens(client, admin_tokens):
    resp = await client.post("/api/auth/refresh", json={"refresh_token": admin_tokens["refresh"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["refresh_token"] != admin_tokens["refresh"]
    # Old refresh token is single-use: replay must fail.
    replay = await client.post("/api/auth/refresh", json={"refresh_token": admin_tokens["refresh"]})
    assert replay.status_code == 401
    assert replay.json()["error"]["code"] == "token_revoked"


async def test_refresh_rejects_access_token(client, admin_tokens):
    resp = await client.post("/api/auth/refresh", json={"refresh_token": admin_tokens["access"]})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "token_invalid"


async def test_refresh_rejects_garbage(client):
    resp = await client.post("/api/auth/refresh", json={"refresh_token": "not-a-jwt"})
    assert resp.status_code == 401


async def test_logout_revokes_refresh_token(client, admin_tokens):
    resp = await client.post(
        "/api/auth/logout",
        json={"refresh_token": admin_tokens["refresh"]},
        headers={"Authorization": f"Bearer {admin_tokens['access']}"},
    )
    assert resp.status_code == 200
    replay = await client.post("/api/auth/refresh", json={"refresh_token": admin_tokens["refresh"]})
    assert replay.status_code == 401
    assert replay.json()["error"]["code"] == "token_revoked"


async def test_logout_requires_refresh_token(client, admin_tokens):
    resp = await client.post(
        "/api/auth/logout",
        headers={"Authorization": f"Bearer {admin_tokens['access']}"},
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "validation_error"


async def test_me(client, admin_headers):
    resp = await client.get("/api/auth/me", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["username"] == BOOTSTRAP_USER
    assert resp.json()["role"] == "admin"


async def test_me_requires_token(client):
    assert (await client.get("/api/auth/me")).status_code == 401
    bad = await client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"})
    assert bad.status_code == 401


async def test_disabled_admin_token_stops_working(client, db_session):
    # Roles/status are re-checked from DB per request (docs/08).
    admin = (
        await db_session.execute(select(AdminUser).where(AdminUser.username == BOOTSTRAP_USER))
    ).scalar_one()
    tokens = (await login(client)).json()
    admin.status = AdminStatus.DISABLED
    await db_session.commit()
    resp = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "account_disabled"


async def test_change_password_revokes_existing_tokens(client, admin_headers, admin_tokens):
    """docs/08: 改密后旧 refresh 作废 (token_version bump)."""
    resp = await client.put(
        "/api/auth/me/password",
        json={"old_password": BOOTSTRAP_PASSWORD, "new_password": "New-Password-12345"},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text

    # Old refresh token is rejected after password change.
    replay = await client.post("/api/auth/refresh", json={"refresh_token": admin_tokens["refresh"]})
    assert replay.status_code == 401

    # Old access token is superseded too.
    me = await client.get("/api/auth/me", headers=admin_headers)
    assert me.status_code == 401
