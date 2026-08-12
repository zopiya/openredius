"""APScheduler assembly (docs/04 jobs). Single-replica assumption (M7 note)."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from openredius.core.config import Settings
from openredius.core.db import get_session_factory
from openredius.services import alerts

logger = logging.getLogger("openredius.jobs")

JobFn = Callable[..., Awaitable[object]]


async def _run(job_name: str, fn: JobFn, settings: Settings) -> None:
    """Run one job on its own session; failures never kill the scheduler."""
    factory = get_session_factory()
    try:
        async with factory() as db:
            result = await fn(db, settings)
            await db.commit()
        logger.info("job %s done result=%s", job_name, result)
    except Exception:
        logger.exception("job %s failed", job_name)


def build_scheduler(settings: Settings) -> AsyncIOScheduler | None:
    """Return a configured scheduler, or None when jobs are disabled."""
    if not settings.jobs_enabled:
        return None
    scheduler = AsyncIOScheduler(timezone="UTC")
    jobs: list[tuple[str, JobFn, int]] = [
        ("lockout_sweeper", alerts.lockout_sweeper, settings.jobs_lockout_interval_s),
        ("nas_watchdog", alerts.nas_watchdog, settings.jobs_nas_watchdog_interval_s),
        ("cert_scan", alerts.cert_scan, settings.jobs_cert_scan_interval_s),
        ("alert_gc", alerts.alert_gc, settings.jobs_alert_gc_interval_s),
    ]
    for name, fn, interval in jobs:
        scheduler.add_job(_run, "interval", seconds=interval, args=[name, fn, settings], id=name)

    # AD sync via cron expression (default: every 15 min).
    try:
        if settings.ad_url:
            from apscheduler.triggers.cron import CronTrigger
            scheduler.add_job(
                _run_ad_sync_cron,
                CronTrigger.from_crontab(settings.ad_sync_cron),
                id="ad_sync",
                args=[settings],
            )
    except Exception:
        logger.exception("failed to schedule ad_sync cron")

    return scheduler


async def _run_ad_sync_cron(settings: Settings) -> None:
    """AD sync — cron-scheduled handler (same as manual but with actor=system)."""
    from openredius.ldap_sync import run_ad_sync
    from openredius.ldap_sync.ldap3_ import Ldap3ConnectorCtor
    from openredius.models import SyncTrigger

    factory = get_session_factory()
    ctor = Ldap3ConnectorCtor()
    connector = await ctor(settings.ad_url, settings.ad_bind_dn, settings.ad_bind_pw)
    try:
        async with factory() as db:
            await run_ad_sync(db, settings, connector, triggered_by=SyncTrigger.CRON)
            await db.commit()
        logger.info("job ad_sync done")
    except Exception:
        logger.exception("job ad_sync failed")
    finally:
        await connector.close()
