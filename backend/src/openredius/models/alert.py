"""AD sync jobs and alerting (docs/02 ad_sync_job/alert_rule/alert_event)."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from openredius.models.base import Base, enum_column


class SyncTrigger(enum.StrEnum):
    MANUAL = "manual"
    CRON = "cron"


class SyncStatus(enum.StrEnum):
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class AdSyncJob(Base):
    __tablename__ = "ad_sync_job"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    triggered_by: Mapped[SyncTrigger] = mapped_column(
        enum_column(SyncTrigger, 8), default=SyncTrigger.CRON
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[SyncStatus] = mapped_column(
        enum_column(SyncStatus, 8), default=SyncStatus.RUNNING
    )
    added: Mapped[int] = mapped_column(Integer, default=0)
    updated: Mapped[int] = mapped_column(Integer, default=0)
    disabled: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)


class AlertLevel(enum.StrEnum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


class AlertRule(Base):
    __tablename__ = "alert_rule"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Stable key: nas_offline / ap_high_load / cert_expiring / account_locked / …
    key: Mapped[str] = mapped_column(String(64), unique=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    threshold_json: Mapped[dict] = mapped_column(JSON, default=dict)


class AlertEvent(Base):
    __tablename__ = "alert_event"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_key: Mapped[str] = mapped_column(String(64), index=True)
    level: Mapped[AlertLevel] = mapped_column(enum_column(AlertLevel, 8), default=AlertLevel.INFO)
    title: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
