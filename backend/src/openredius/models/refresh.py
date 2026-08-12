"""Refresh-token jti blacklist (docs/08: 登出/改密后旧 refresh 作废)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from openredius.models.base import Base


class RevokedRefreshToken(Base):
    __tablename__ = "revoked_refresh_token"

    jti: Mapped[str] = mapped_column(String(32), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
