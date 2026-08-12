"""Policy groups and their dictionaries (docs/02 policy_group/vlan/acl_profile)."""

from __future__ import annotations

import enum
from datetime import datetime, time

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Time, func
from sqlalchemy.orm import Mapped, mapped_column

from openredius.models.base import Base, enum_column


class EapMethod(enum.StrEnum):
    EAP_TLS = "eap-tls"
    PEAP_MSCHAPV2 = "peap-mschapv2"


class Vlan(Base):
    __tablename__ = "vlan"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vid: Mapped[int] = mapped_column(Integer, unique=True)
    name: Mapped[str] = mapped_column(String(64))


class AclProfile(Base):
    __tablename__ = "acl_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True)
    description: Mapped[str] = mapped_column(String(255), default="")


class PolicyGroup(Base):
    __tablename__ = "policy_group"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    description: Mapped[str] = mapped_column(String(255), default="")
    scope_dept: Mapped[str] = mapped_column(String(128), default="")
    eap_method: Mapped[EapMethod] = mapped_column(
        enum_column(EapMethod, 16), default=EapMethod.PEAP_MSCHAPV2
    )
    vlan_id: Mapped[int] = mapped_column(ForeignKey("vlan.id"), index=True)
    acl_name: Mapped[str] = mapped_column(String(64), default="")
    session_timeout_s: Mapped[int | None] = mapped_column(Integer)
    reauth_interval_s: Mapped[int | None] = mapped_column(Integer)
    require_cert: Mapped[bool] = mapped_column(Boolean, default=False)
    require_mac_bind: Mapped[bool] = mapped_column(Boolean, default=False)
    require_edr: Mapped[bool] = mapped_column(Boolean, default=False)
    time_window_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    time_from: Mapped[time] = mapped_column(Time, default=time(8, 0))
    time_to: Mapped[time] = mapped_column(Time, default=time(20, 0))
    rate_limit_mbps: Mapped[int | None] = mapped_column(Integer)
    priority: Mapped[int] = mapped_column(Integer, default=0, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
