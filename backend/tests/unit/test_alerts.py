"""Alert engine + job unit tests (docs/04 jobs, roadmap M4 告警任务)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from openredius.core.config import Settings
from openredius.core.db import close_db, get_engine, get_session_factory, init_db
from openredius.jobs.scheduler import build_scheduler
from openredius.models import (
    AccessUser,
    AlertEvent,
    Compliance,
    Endpoint,
    EndpointType,
    NasDevice,
    UserStatus,
)
from openredius.models.base import Base
from openredius.services import alerts
from tests.conftest import create_admin_user  # noqa: F401  (import guard)
from tests.radius_helpers import create_radius_tables, insert_postauth, insert_session


@pytest.fixture
async def db(settings: Settings):
    """Initialized in-memory DB + open session (unit scope, no app)."""
    init_db(settings.database_url)
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with get_session_factory()() as session:
        yield session
    await close_db()


@pytest.fixture
def job_settings(settings: Settings) -> Settings:
    return settings.model_copy(
        update={
            "lockout_max_fails": 3,
            "lockout_window": 600,
            "lockout_duration": 1800,
            "nas_online_window": 300,
            "alerts_dedup_window_s": 600,
        }
    )


async def _seed_user(account: str = "wang.lei", status: UserStatus = UserStatus.ACTIVE) -> int:
    async with get_session_factory()() as session:
        user = AccessUser(account=account, name="王磊", dept="研发中心", status=status)
        session.add(user)
        await session.commit()
        return user.id


async def _events(rule_key: str | None = None) -> list[AlertEvent]:
    async with get_session_factory()() as session:
        stmt = select(AlertEvent)
        if rule_key:
            stmt = stmt.where(AlertEvent.rule_key == rule_key)
        return list((await session.execute(stmt)).scalars().all())


async def test_lockout_sweeper_locks_and_alerts(db, job_settings):
    await create_radius_tables()
    await _seed_user()
    for i in range(3):
        await insert_postauth(username="wang.lei", reply="Access-Reject", minutes_ago=i)

    stats = await alerts.lockout_sweeper(db, job_settings)
    await db.commit()
    assert stats == {"unlocked": 0, "locked": 1}

    async with get_session_factory()() as session:
        user = (
            await session.execute(select(AccessUser).where(AccessUser.account == "wang.lei"))
        ).scalar_one()
        assert user.status == UserStatus.LOCKED
        assert user.locked_until is not None
    events = await _events("account_locked")
    assert len(events) == 1
    assert events[0].link == "/users?focus=wang.lei"


async def test_lockout_ignores_policy_rejects(db, job_settings):
    await create_radius_tables()
    await _seed_user()
    for i in range(5):
        await insert_postauth(
            username="wang.lei",
            reply="Access-Reject",
            class_value="reason=mac-unbound",
            minutes_ago=i,
        )
    stats = await alerts.lockout_sweeper(db, job_settings)
    await db.commit()
    assert stats["locked"] == 0


async def test_lockout_unlocks_expired(db, job_settings):
    await create_radius_tables()
    async with get_session_factory()() as session:
        session.add(
            AccessUser(
                account="wang.lei",
                name="王磊",
                dept="研发中心",
                status=UserStatus.LOCKED,
                locked_until=datetime.now(UTC) - timedelta(minutes=1),
            )
        )
        await session.commit()
    stats = await alerts.lockout_sweeper(db, job_settings)
    await db.commit()
    assert stats["unlocked"] == 1
    async with get_session_factory()() as session:
        user = (
            await session.execute(select(AccessUser).where(AccessUser.account == "wang.lei"))
        ).scalar_one()
        assert user.status == UserStatus.ACTIVE
        assert user.locked_until is None


async def test_nas_watchdog_offline_and_dedup(db, job_settings):
    await create_radius_tables()
    async with get_session_factory()() as session:
        session.add(NasDevice(name="SW-OLD", nasname="10.99.9.9", secret_enc="x", capacity=10))
        await session.commit()
    # Traffic well outside the online window.
    await insert_postauth(username="wang.lei", nas_ip="10.99.9.9", minutes_ago=60)

    first = await alerts.nas_watchdog(db, job_settings)
    await db.commit()
    assert first["offline"] == 1
    second = await alerts.nas_watchdog(db, job_settings)
    await db.commit()
    assert second["offline"] == 0  # de-duplicated inside the window
    assert len(await _events("nas_offline")) == 1


async def test_nas_watchdog_high_load(db, job_settings):
    await create_radius_tables()
    async with get_session_factory()() as session:
        session.add(NasDevice(name="AP-HOT", nasname="10.99.8.8", secret_enc="x", capacity=2))
        await session.commit()
    await insert_session(unique_id="H-1", nas_ip="10.99.8.8")
    await insert_session(unique_id="H-2", nas_ip="10.99.8.8", mac="AA:BB:CC:DD:EE:FF")

    stats = await alerts.nas_watchdog(db, job_settings)
    await db.commit()
    assert stats["high_load"] == 1
    events = await _events("ap_high_load")
    assert "2/2" in events[0].message


async def test_cert_scan_transitions(db, job_settings):
    async with get_session_factory()() as session:
        session.add_all(
            [
                Endpoint(
                    mac="AA:00:00:00:00:01",
                    etype=EndpointType.LAPTOP,
                    compliance=Compliance.OK,
                    cert_not_after=datetime.now(UTC) - timedelta(days=1),
                ),
                Endpoint(
                    mac="AA:00:00:00:00:02",
                    etype=EndpointType.LAPTOP,
                    compliance=Compliance.OK,
                    cert_not_after=datetime.now(UTC) + timedelta(days=3),
                ),
                Endpoint(
                    mac="AA:00:00:00:00:03",
                    etype=EndpointType.LAPTOP,
                    compliance=Compliance.WHITE,
                    whitelisted=True,
                    cert_not_after=datetime.now(UTC) - timedelta(days=1),
                ),
            ]
        )
        await session.commit()

    stats = await alerts.cert_scan(db, job_settings)
    await db.commit()
    assert stats == {"expired": 1, "expiring": 1}
    async with get_session_factory()() as session:
        by_mac = {e.mac: e for e in (await session.execute(select(Endpoint))).scalars().all()}
    assert by_mac["AA:00:00:00:00:01"].compliance == Compliance.BAD
    assert by_mac["AA:00:00:00:00:02"].compliance == Compliance.WARN
    assert by_mac["AA:00:00:00:00:03"].compliance == Compliance.WHITE  # untouched
    assert len(await _events("cert_expiring")) == 1


async def test_alert_gc_removes_read_stale(db, job_settings):
    async with get_session_factory()() as session:
        old_read = AlertEvent(
            rule_key="nas_offline",
            title="stale",
            message="x",
            link="a",
            created_at=datetime.now(UTC) - timedelta(days=120),
            read_at=datetime.now(UTC) - timedelta(days=110),
        )
        old_unread = AlertEvent(
            rule_key="nas_offline",
            title="stale-unread",
            message="x",
            link="b",
            created_at=datetime.now(UTC) - timedelta(days=120),
        )
        fresh = AlertEvent(rule_key="nas_offline", title="fresh", message="x", link="c")
        session.add_all([old_read, old_unread, fresh])
        await session.commit()

    deleted = await alerts.alert_gc(db, job_settings)
    await db.commit()
    assert deleted == 1
    remaining = await _events()
    assert {e.title for e in remaining} == {"stale-unread", "fresh"}


def test_scheduler_disabled(settings: Settings):
    assert build_scheduler(settings) is None


def test_scheduler_jobs_registered():
    enabled = Settings(
        env="dev",
        database_url="sqlite+aiosqlite:///:memory:",
        jwt_secret="test-secret-" + "x" * 24,
        jobs_enabled=True,
        _env_file=None,
    )
    scheduler = build_scheduler(enabled)
    assert scheduler is not None
    ids = {j.id for j in scheduler.get_jobs()}
    assert ids == {"lockout_sweeper", "nas_watchdog", "cert_scan", "alert_gc"}
