"""Console administrator account (docs/02 admin_user, docs/08 auth)."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from openredius.models.base import Base, enum_column


class AdminRole(enum.StrEnum):
    ADMIN = "admin"
    OPERATOR = "operator"
    AUDITOR = "auditor"


class AdminStatus(enum.StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


class AdminUser(Base):
    __tablename__ = "admin_user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(128), default="")
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # When set, the admin authenticates as this access_user (AD or local password).
    linked_account: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    role: Mapped[AdminRole] = mapped_column(enum_column(AdminRole, 16), default=AdminRole.OPERATOR)
    status: Mapped[AdminStatus] = mapped_column(
        enum_column(AdminStatus, 16), default=AdminStatus.ACTIVE
    )

    # Login lockout bookkeeping (docs/08: 5 fails / 10 min window, 30 min lock).
    fail_count: Mapped[int] = mapped_column(Integer, default=0)
    first_failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
