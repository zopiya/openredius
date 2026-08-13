"""Delegated admin login (linked_account): NT-Password + AD bind (docs/08)."""

from __future__ import annotations

from httpx import AsyncClient

from openredius.core.db import get_session_factory
from openredius.core.ntlm import ntlm_hash
from openredius.models import AdminRole, AdminStatus, AdminUser
from openredius.radius.tables import build_radius_metadata
from openredius.services import auth as auth_svc
from tests.radius_helpers import create_radius_tables

LINKED_PASSWORD = "Demo-Radius-2026"


async def _add_linked_admin(username: str, linked_account: str) -> None:
    async with get_session_factory()() as session:
        session.add(
            AdminUser(
                username=username,
                display_name=username,
                linked_account=linked_account,
                role=AdminRole.ADMIN,
                status=AdminStatus.ACTIVE,
            )
        )
        await session.commit()


async def test_linked_admin_nt_password_login(client: AsyncClient):
    await create_radius_tables()
    meta = build_radius_metadata(None)
    radcheck = meta.tables["radcheck"]
    async with get_session_factory()() as session:
        await session.execute(
            radcheck.insert().values(
                username="wang.lei",
                attribute="NT-Password",
                op=":=",
                value=ntlm_hash(LINKED_PASSWORD),
            )
        )
        await session.commit()
    await _add_linked_admin("linked-nt", "wang.lei")

    ok = await client.post(
        "/api/auth/login", json={"username": "linked-nt", "password": LINKED_PASSWORD}
    )
    assert ok.status_code == 200, ok.text
    bad = await client.post(
        "/api/auth/login", json={"username": "linked-nt", "password": "wrong-password-123"}
    )
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "invalid_credentials"


async def test_linked_admin_cleartext_login(client: AsyncClient):
    await create_radius_tables()
    meta = build_radius_metadata(None)
    radcheck = meta.tables["radcheck"]
    async with get_session_factory()() as session:
        await session.execute(
            radcheck.insert().values(
                username="wang.lei",
                attribute="Cleartext-Password",
                op=":=",
                value=LINKED_PASSWORD,
            )
        )
        await session.commit()
    await _add_linked_admin("linked-ct", "wang.lei")

    ok = await client.post(
        "/api/auth/login", json={"username": "linked-ct", "password": LINKED_PASSWORD}
    )
    assert ok.status_code == 200


async def test_linked_admin_ad_bind(client: AsyncClient, monkeypatch):
    await _add_linked_admin("linked-ad", "ad.user")

    async def fake_bind(settings, account, password):
        return password == "ad-password-1"

    monkeypatch.setattr(auth_svc, "_verify_ad_bind", fake_bind)

    ok = await client.post(
        "/api/auth/login", json={"username": "linked-ad", "password": "ad-password-1"}
    )
    assert ok.status_code == 200
    bad = await client.post(
        "/api/auth/login", json={"username": "linked-ad", "password": "nope-123"}
    )
    assert bad.status_code == 401


def test_ad_bind_dn_derivation():
    from openredius.core.config import Settings

    assert (
        auth_svc._ad_bind_dn(Settings(ad_url="ldap://ad.corp.local"), "wang.lei")
        == "wang.lei@ad.corp.local"
    )
    assert auth_svc._ad_bind_dn(Settings(ad_url="ldaps://dc01.internal"), "u") == "u@dc01.internal"
    # IP host / unset URL → no UPN derivable.
    assert auth_svc._ad_bind_dn(Settings(ad_url="ldap://10.0.0.5"), "u") is None
    assert auth_svc._ad_bind_dn(Settings(ad_url=""), "u") is None
