"""Policy compiler unit tests (docs/09 scenario 1): idempotency, disable
removes artifacts, VLAN change updates radgroupreply, reject entries.

Runs against an in-memory SQLite with the radius tables created in the main
schema (same shape as radius.* on PostgreSQL; docs/04). One shared in-memory
DB per test, so each test seeds exactly once.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from openredius.models import (
    AccessUser,
    AuditLog,
    PolicyGroup,
    UserStatus,
    Vlan,
)
from openredius.models.base import Base
from openredius.radius import compiler as comp
from openredius.radius.tables import build_radius_metadata

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def compile_env():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    radius_meta = build_radius_metadata(None)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(radius_meta.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    yield factory
    await engine.dispose()


async def _seed_basic(db: AsyncSession) -> tuple[PolicyGroup, AccessUser]:
    vlan = Vlan(vid=20, name="研发")
    db.add(vlan)
    await db.flush()
    policy = PolicyGroup(
        slug="rd",
        name="研发准入策略",
        vlan_id=vlan.id,
        acl_name="acl_rd_std",
        session_timeout_s=28800,
        rate_limit_mbps=100,
        require_mac_bind=True,
        require_edr=False,
        require_cert=True,
        priority=4,
        enabled=True,
    )
    db.add(policy)
    await db.flush()
    user = AccessUser(account="wang.lei", name="王磊", policy_group_id=policy.id)
    db.add(user)
    await db.flush()
    return policy, user


async def _rows(db: AsyncSession, table_name: str) -> list[tuple]:
    meta = build_radius_metadata(None)
    table = meta.tables[table_name]
    return [tuple(r) for r in (await db.execute(select(table))).all()]


async def test_compile_idempotent_and_contents(compile_env):
    async with compile_env() as db:
        await _seed_basic(db)
        first = await comp.compile_all(db, actor="test", trigger="t1")
        await db.commit()
        second = await comp.compile_all(db, actor="test", trigger="t2")
        await db.commit()

        assert first.rows_added > 0
        assert second.rows_added == 0 and second.rows_removed == 0

        reply = {r[2]: r[4] for r in await _rows(db, "radgroupreply")}
        assert reply["Tunnel-Type"] == "VLAN"
        assert reply["Tunnel-Medium-Type"] == "IEEE-802"
        assert reply["Tunnel-Private-Group-Id"] == "20"
        assert reply["Filter-Id"] == "acl_rd_std"
        assert reply["Session-Timeout"] == "28800"
        assert reply["WISPr-Bandwidth-Max-Down"] == "100000000"
        check = {r[2]: r[4] for r in await _rows(db, "radgroupcheck")}
        assert check["OpenRedius-Flags"] == "mac,cert"
        usergroup = await _rows(db, "radusergroup")
        assert [(r[1], r[2], r[3]) for r in usergroup] == [("wang.lei", "policy_rd", 4)]


async def test_disable_policy_removes_artifacts(compile_env):
    async with compile_env() as db:
        policy, _user = await _seed_basic(db)
        await comp.compile_all(db, actor="test", trigger="t1")
        await db.commit()
        assert await _rows(db, "radgroupreply")

        policy.enabled = False
        summary = await comp.compile_all(db, actor="test", trigger="t2")
        await db.commit()
        assert summary.groups_dropped == 1
        assert await _rows(db, "radgroupreply") == []
        assert await _rows(db, "radgroupcheck") == []
        # user assignment goes away with the disabled group
        assert await _rows(db, "radusergroup") == []


async def test_vlan_change_updates_reply(compile_env):
    async with compile_env() as db:
        policy, _user = await _seed_basic(db)
        await comp.compile_all(db, actor="test", trigger="t1")
        await db.commit()

        vlan = await db.get(Vlan, policy.vlan_id)
        vlan.vid = 77
        await comp.compile_all(db, actor="test", trigger="t2")
        await db.commit()
        reply = {r[2]: r[4] for r in await _rows(db, "radgroupreply")}
        assert reply["Tunnel-Private-Group-Id"] == "77"


async def test_locked_user_gets_reject_entries(compile_env):
    async with compile_env() as db:
        _policy, user = await _seed_basic(db)
        user.status = UserStatus.LOCKED
        user.locked_until = datetime.now(UTC)
        summary = await comp.compile_all(db, actor="test", trigger="t1")
        await db.commit()
        assert summary.reject_entries == 1

        radcheck = {r[2]: r[4] for r in await _rows(db, "radcheck") if r[1] == "wang.lei"}
        assert radcheck["Auth-Type"] == "Reject"
        radreply = {r[2]: r[4] for r in await _rows(db, "radreply")}
        assert radreply["Class"] == "reason=account-locked"
        # locked user is excluded from radusergroup
        assert await _rows(db, "radusergroup") == []

        # unlock removes the reject entries
        user.status = UserStatus.ACTIVE
        user.locked_until = None
        await comp.compile_all(db, actor="test", trigger="t2")
        await db.commit()
        assert await _rows(db, "radcheck") == []
        assert await _rows(db, "radreply") == []


async def test_external_usergroup_rows_preserved(compile_env):
    """Compiler only owns policy_* group rows (W1): foreign radusergroup entries
    (e.g. future AD-synced groups) must survive a full recompile."""
    async with compile_env() as db:
        await _seed_basic(db)
        meta = build_radius_metadata(None)
        radusergroup = meta.tables["radusergroup"]
        await db.execute(
            radusergroup.insert().values(username="ad.user", groupname="ad-group", priority=9)
        )
        await comp.compile_all(db, actor="test", trigger="t1")
        await db.commit()

        rows = await _rows(db, "radusergroup")
        foreign = [(r[1], r[2]) for r in rows if r[2] == "ad-group"]
        assert foreign == [("ad.user", "ad-group")]


async def test_compile_writes_audit(compile_env):
    async with compile_env() as db:
        await _seed_basic(db)
        await comp.compile_all(db, actor="tester", trigger="unit")
        await db.commit()
        audits = (await db.execute(select(AuditLog))).scalars().all()
        assert [a.action for a in audits] == ["policy.compile"]
        assert audits[0].detail_json["trigger"] == "unit"
        assert audits[0].detail_json["status"] == "ok"
