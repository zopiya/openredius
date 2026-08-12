"""Access users admitted via RADIUS (docs/02 access_user)."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from openredius.models.base import Base, enum_column


class UserStatus(enum.StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"
    LOCKED = "locked"


class UserSource(enum.StrEnum):
    AD = "ad"
    LOCAL = "local"


class AccessUser(Base):
    __tablename__ = "access_user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # = sAMAccountName; case-insensitive, stored lowercase (docs/02 约定).
    account: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    dept: Mapped[str] = mapped_column(String(128), default="", index=True)
    title: Mapped[str] = mapped_column(String(128), default="")
    status: Mapped[UserStatus] = mapped_column(
        enum_column(UserStatus, 16), default=UserStatus.ACTIVE, index=True
    )
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    policy_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("policy_group.id", ondelete="SET NULL"), index=True
    )
    ad_dn: Mapped[str | None] = mapped_column(String(512))
    ad_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[UserSource] = mapped_column(enum_column(UserSource, 8), default=UserSource.LOCAL)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
