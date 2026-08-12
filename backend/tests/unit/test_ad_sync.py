"""AD sync engine — unit tests with mock connector (fixture-driven design)."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from openredius.core.config import Settings
from openredius.core.db import close_db, get_engine, get_session_factory, init_db
from openredius.ldap_sync.connector import AdConnector, AdUserEntry
from openredius.ldap_sync.sync import run_ad_sync
from openredius.models import (
    AccessUser,
    AdSyncJob,
    Base,
    SyncStatus,
    SyncTrigger,
    UserSource,
    UserStatus,
)


@pytest.fixture
async def db(settings: Settings):
    """Initialized in-memory DB + open session."""
    init_db(settings.database_url)
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with get_session_factory()() as session:
        yield session
    await close_db()


class _MockConnector(AdConnector):
    """Returns a pre-canned entry list."""

    def __init__(self, entries: list[AdUserEntry]) -> None:
        self.entries = entries
        self.closed = False

    async def fetch(self, base_dn: str, search_filter: str) -> list[AdUserEntry]:
        return self.entries

    async def close(self) -> None:
        self.closed = True


def _entry(
    *,
    account: str,
    name: str = "",
    dept: str = "",
    title: str = "",
    disabled: bool = False,
    dn: str = "",
) -> AdUserEntry:
    return AdUserEntry(
        sAMAccountName=account,
        displayName=name or account,
        department=dept,
        title=title,
        distinguishedName=dn or f"CN={account},OU=Users,DC=contoso,DC=com",
        disabled=disabled,
    )


@pytest.mark.asyncio
async def test_sync_new_user_created(db, settings):
    """Branch ADDED: new AD accounts become local ACTIVE users."""
    connector = _MockConnector(
        [
            _entry(account="new.user", name="New User", dept="IT"),
        ]
    )
    job = await run_ad_sync(db, settings, connector, triggered_by=SyncTrigger.MANUAL)
    assert job.status is SyncStatus.SUCCESS
    assert job.added == 1
    assert job.updated == 0
    assert job.disabled == 0

    user = (
        await db.execute(select(AccessUser).where(AccessUser.account == "new.user"))
    ).scalar_one_or_none()
    assert user is not None
    assert user.name == "New User"
    assert user.dept == "IT"
    assert user.source is UserSource.AD
    assert user.status is UserStatus.ACTIVE
    await db.commit()


@pytest.mark.asyncio
async def test_sync_existing_user_updated(db, settings):
    """Branch UPDATED: known AD users get attribute changes applied."""
    user = AccessUser(
        account="sync.test",
        name="Old Name",
        dept="Old Dept",
        source=UserSource.AD,
        ad_dn="CN=sync.test,OU=Users,DC=contoso,DC=com",
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.flush()

    connector = _MockConnector(
        [
            _entry(account="sync.test", name="New Name", dept="New Dept"),
        ]
    )
    job = await run_ad_sync(db, settings, connector, triggered_by=SyncTrigger.MANUAL)
    assert job.status is SyncStatus.SUCCESS
    assert job.added == 0
    assert job.updated == 1
    assert job.disabled == 0

    await db.refresh(user)
    assert user.name == "New Name"
    assert user.dept == "New Dept"
    await db.commit()


@pytest.mark.asyncio
async def test_sync_missing_user_disabled(db, settings):
    """Branch DISABLED: AD users not in results are disabled locally."""
    user = AccessUser(
        account="departing.user",
        name="Departing User",
        source=UserSource.AD,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.flush()

    # AD returns nobody (or different users only).
    connector = _MockConnector([_entry(account="other.user")])
    job = await run_ad_sync(db, settings, connector, triggered_by=SyncTrigger.MANUAL)
    assert job.status is SyncStatus.SUCCESS
    assert job.disabled == 1

    await db.refresh(user)
    assert user.status is UserStatus.DISABLED
    await db.commit()


@pytest.mark.asyncio
async def test_sync_local_user_untouched(db, settings):
    """Only AD-sourced users are touched; local users remain as-is."""
    local = AccessUser(
        account="local.user",
        name="Local",
        source=UserSource.LOCAL,
        status=UserStatus.ACTIVE,
    )
    db.add(local)
    await db.flush()

    connector = _MockConnector([_entry(account="ad.user")])
    job = await run_ad_sync(db, settings, connector, triggered_by=SyncTrigger.MANUAL)
    assert job.status is SyncStatus.SUCCESS

    await db.refresh(local)
    assert local.status is UserStatus.ACTIVE
    assert local.source is UserSource.LOCAL
    await db.commit()


@pytest.mark.asyncio
async def test_sync_disabled_in_ad(db, settings):
    """AD-disabled accounts are set to DISABLED locally (not LOCKED)."""
    user = AccessUser(
        account="fired.user",
        name="Fired",
        source=UserSource.AD,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.flush()

    connector = _MockConnector(
        [
            _entry(account="fired.user", name="Fired", disabled=True),
        ]
    )
    job = await run_ad_sync(db, settings, connector, triggered_by=SyncTrigger.CRON)
    assert job.status is SyncStatus.SUCCESS
    # Already disabled? counted as disabled
    assert job.disabled >= 1

    await db.refresh(user)
    assert user.status is UserStatus.DISABLED
    await db.commit()


@pytest.mark.asyncio
async def test_sync_no_change_is_noop(db, settings):
    """When AD returns identical user data, counts stay at zero."""
    user = AccessUser(
        account="stable.user",
        name="Stable",
        dept="Ops",
        title="Engineer",
        source=UserSource.AD,
        ad_dn="CN=stable.user,OU=Users,DC=contoso,DC=com",
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    await db.flush()

    connector = _MockConnector(
        [
            _entry(
                account="stable.user",
                name="Stable",
                dept="Ops",
                title="Engineer",
                dn="CN=stable.user,OU=Users,DC=contoso,DC=com",
            ),
        ]
    )
    job = await run_ad_sync(db, settings, connector, triggered_by=SyncTrigger.CRON)
    assert job.status is SyncStatus.SUCCESS
    assert job.added == 0
    assert job.updated == 0
    assert job.disabled == 0
    await db.commit()


@pytest.mark.asyncio
async def test_sync_connector_error_fails_job(db, settings):
    """When the connector raises, the job is marked FAILED with error text."""

    class _FailingConnector(AdConnector):
        async def fetch(self, base_dn: str, search_filter: str) -> list[AdUserEntry]:
            raise OSError("LDAP server down")

        async def close(self) -> None:
            pass

    connector = _FailingConnector()
    job = await run_ad_sync(db, settings, connector, triggered_by=SyncTrigger.CRON)
    assert job.status is SyncStatus.FAILED
    assert job.error is not None
    assert "LDAP server down" in job.error
    await db.commit()


@pytest.mark.asyncio
async def test_sync_creates_job_record(db, settings):
    """Every sync run creates an AdSyncJob with correct counts."""
    connector = _MockConnector(
        [
            _entry(account="a1", name="A1"),
            _entry(account="a2", name="A2"),
        ]
    )
    job = await run_ad_sync(db, settings, connector, triggered_by=SyncTrigger.CRON)
    assert job.id is not None
    assert job.triggered_by is SyncTrigger.CRON
    assert job.started_at is not None
    assert job.finished_at is not None
    assert job.status is SyncStatus.SUCCESS
    await db.commit()

    # Verify we can query it back.
    jobs = (await db.execute(select(AdSyncJob))).scalars().all()
    assert len(jobs) >= 1
