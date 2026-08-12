"""AD incremental sync engine (docs/04, docs/08).

Fixture-driven: the ``AdConnector`` is injected at call time so unit tests can
swap in a mock connector that never touches a real directory.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.config import Settings
from openredius.ldap_sync.connector import AdConnector, AdUserEntry
from openredius.models import (
    AccessUser,
    AdSyncJob,
    SyncStatus,
    SyncTrigger,
    UserSource,
    UserStatus,
)
from openredius.services import audit
from openredius.services.compiler import compile_policies

SYSTEM = "system"


def _now() -> datetime:
    return datetime.now(UTC)


async def run_ad_sync(
    db: AsyncSession,
    settings: Settings,
    connector: AdConnector,
    *,
    triggered_by: SyncTrigger = SyncTrigger.CRON,
    actor: str = SYSTEM,
) -> AdSyncJob:
    """Core sync logic. Returns the completed ``AdSyncJob`` (already flushed).

    Side effects: writes users into *db*, creates an audit row for the job,
    and — if user sets changed — triggers ``compile_policies``.
    """
    # 1. Create job record ---------------------------------------------------
    job = AdSyncJob(
        triggered_by=triggered_by,
        status=SyncStatus.RUNNING,
        started_at=_now(),
    )
    db.add(job)
    await db.flush()

    # 2. Determine ``whenChanged`` watermark ---------------------------------
    last_ok = (
        await db.execute(
            select(AdSyncJob)
            .where(
                AdSyncJob.status == SyncStatus.SUCCESS,
                AdSyncJob.finished_at.is_not(None),
            )
            .order_by(AdSyncJob.finished_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    ad_filter = settings.ad_filter or "(objectClass=user)"
    try:
        entries = await connector.fetch(
            base_dn=settings.ad_base_dn,
            search_filter=_build_filter(ad_filter, last_ok),
        )
    except Exception as exc:
        job.status = SyncStatus.FAILED
        job.error = str(exc)[:2048]
        job.finished_at = _now()
        await db.flush()
        await audit.record_audit(
            db,
            actor=actor,
            action="ad_sync.failed",
            target_type="ad_sync_job",
            target_id=str(job.id),
            detail={"error": str(exc)[:512], "triggered_by": triggered_by.value},
        )
        return job

    # 3. Process users -------------------------------------------------------
    stats = await _process_users(db, entries, actor, settings)
    job.added = stats["added"]
    job.updated = stats["updated"]
    job.disabled = stats["disabled"]
    job.status = SyncStatus.SUCCESS
    job.finished_at = _now()
    await db.flush()

    await audit.record_audit(
        db,
        actor=actor,
        action="ad_sync.complete",
        target_type="ad_sync_job",
        target_id=str(job.id),
        detail={
            "added": job.added,
            "updated": job.updated,
            "disabled": job.disabled,
            "triggered_by": triggered_by.value,
        },
    )

    # 4. Recompile if user pool changed --------------------------------------
    if job.added or job.updated or job.disabled:
        await compile_policies(db, actor=actor, trigger="ad_sync")

    return job


def _build_filter(base_filter: str, last_job: AdSyncJob | None) -> str:
    """Wrap the base filter with an optional ``whenChanged`` clause."""
    if last_job is None:
        return base_filter
    if last_job.finished_at is None:
        return base_filter
    ts = last_job.finished_at.strftime("%Y%m%d%H%M%S.0Z")
    return f"(&{base_filter}(whenChanged>={ts}))"


async def _process_users(
    db: AsyncSession,
    entries: list[AdUserEntry],
    actor: str,
    settings: Settings,
) -> dict[str, int]:
    """Add, update, or disable local users based on AD state.

    Returns counts for each branch:

    * **added** — new accounts created locally
    * **updated** — existing AD-sourced users whose attributes changed
    * **disabled** — accounts in the local DB that no longer appear in AD
        (or whose ``disabled`` flag changed from False → True)

    A user is considered AD-sourced when ``source == AD``. Local-only users
    are left untouched. If AD returns an entry whose name is the bootstrap
    admin, skip it.
    """
    stats = {"added": 0, "updated": 0, "disabled": 0}
    now = _now()

    # Index existing AD-origin users -------------------------------------------------
    existing = (
        (
            await db.execute(
                select(AccessUser).where(AccessUser.source == UserSource.AD)
            )
        )
        .scalars()
        .all()
    )
    by_account: dict[str, AccessUser] = {u.account: u for u in existing}

    # Index existing AD users by DN for efficient lookup
    by_dn: dict[str, AccessUser] = {}
    for u in existing:
        if u.ad_dn:
            by_dn[u.ad_dn] = u

    # DN→entry map
    entry_by_dn: dict[str, AdUserEntry] = {}
    for e in entries:
        if e.distinguishedName:
            entry_by_dn[e.distinguishedName] = e

    in_ad: set[str] = set()
    bootstrap_admin = settings.bootstrap_admin_user.lower() if settings.bootstrap_admin_user else ""

    for entry in entries:
        account = entry.sAMAccountName.lower()
        in_ad.add(account)

        # Skip bootstrap admin
        if bootstrap_admin and account == bootstrap_admin:
            continue

        # Disabled in AD → disable locally (only if currently active/locked)
        if entry.disabled:
            user = by_account.get(account) or (
                by_dn.get(entry.distinguishedName) if entry.distinguishedName else None
            )
            if user is not None and user.status != UserStatus.DISABLED:
                user.status = UserStatus.DISABLED
                user.ad_synced_at = now
                user.ad_dn = entry.distinguishedName or user.ad_dn
                stats["disabled"] += 1
                await audit.record_audit(
                    db,
                    actor=actor,
                    action="user.ad_disable",
                    target_type="access_user",
                    target_id=user.account,
                    detail={"reason": "AD account disabled"},
                )
            continue

        # Already known? Update attributes -------------------------------------------------
        user = by_account.get(account)
        if user is not None:
            changed = False
            for attr, new_val in [
                ("name", entry.displayName or user.name),
                ("dept", entry.department or user.dept),
                ("title", entry.title or user.title),
                ("ad_dn", entry.distinguishedName or user.ad_dn),
            ]:
                if getattr(user, attr) != new_val:
                    setattr(user, attr, new_val)
                    changed = True
            if changed:
                user.ad_synced_at = now
                stats["updated"] += 1
                await audit.record_audit(
                    db,
                    actor=actor,
                    action="user.ad_update",
                    target_type="access_user",
                    target_id=user.account,
                    detail={"ad_dn": user.ad_dn},
                )
            continue

        # New AD user — create locally ----------------------------------------------------
        new_user = AccessUser(
            account=account,
            name=entry.displayName or entry.sAMAccountName,
            dept=entry.department or "",
            title=entry.title or "",
            source=UserSource.AD,
            ad_dn=entry.distinguishedName or "",
            ad_synced_at=now,
            status=UserStatus.ACTIVE,
        )
        db.add(new_user)
        stats["added"] += 1
        await audit.record_audit(
            db,
            actor=actor,
            action="user.ad_create",
            target_type="access_user",
            target_id=new_user.account,
            detail={"ad_dn": new_user.ad_dn},
        )

    # Users in local DB but not in AD → disable ---------------------------------
    for account, user in by_account.items():
        if account not in in_ad and user.status != UserStatus.DISABLED:
            user.status = UserStatus.DISABLED
            user.ad_synced_at = now
            stats["disabled"] += 1
            await audit.record_audit(
                db,
                actor=actor,
                action="user.ad_disable",
                target_type="access_user",
                target_id=user.account,
                detail={"reason": "account not in current AD results"},
            )

    return stats
