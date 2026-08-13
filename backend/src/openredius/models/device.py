"""NAS devices and endpoints (docs/02 nas_device/endpoint)."""

from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from openredius.models.base import Base, enum_column


class NasType(enum.StrEnum):
    SWITCH = "switch"
    AC = "ac"
    AP = "ap"


class NasDevice(Base):
    __tablename__ = "nas_device"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # shortname; FreeRADIUS client name.
    name: Mapped[str] = mapped_column(String(64), unique=True)
    # NAS IP address (dotted string; kept textual for SQLite/PG portability).
    nasname: Mapped[str] = mapped_column(String(45), unique=True, index=True)
    type: Mapped[NasType] = mapped_column(enum_column(NasType, 8), default=NasType.SWITCH)
    area: Mapped[str] = mapped_column(String(128), default="")
    # RADIUS shared secret, stored as plaintext (the ``_enc`` suffix is a
    # historical misnomer). Kept locally because CoA/Disconnect needs the NAS
    # secret for outbound UDP 3799 even on SQLite dev where radius.nas is
    # absent; also synced into radius.nas on PostgreSQL (docs/06, docs/08).
    # Masked in the list API; plaintext only via the audited reveal endpoint.
    secret_enc: Mapped[str] = mapped_column(String(128), default="")
    capacity: Mapped[int | None] = mapped_column(Integer)
    baseline_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(String(255), default="")
    # 1:1 map to radius.nas.id once the stack is up (M3); NULL on SQLite dev.
    radius_nas_id: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class EndpointType(enum.StrEnum):
    LAPTOP = "laptop"
    PHONE = "phone"
    PRINTER = "printer"
    CAMERA = "camera"
    OTHER = "other"


class Compliance(enum.StrEnum):
    OK = "ok"
    WARN = "warn"
    BAD = "bad"
    WHITE = "white"


class Endpoint(Base):
    __tablename__ = "endpoint"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Canonical form: uppercase, colon-separated (docs/02; normalized on write).
    mac: Mapped[str] = mapped_column(String(17), unique=True, index=True)
    fingerprint: Mapped[str] = mapped_column(String(64), default="")
    owner_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("access_user.id", ondelete="SET NULL"), index=True
    )
    etype: Mapped[EndpointType] = mapped_column(
        enum_column(EndpointType, 8), default=EndpointType.OTHER
    )
    compliance: Mapped[Compliance] = mapped_column(
        enum_column(Compliance, 8), default=Compliance.OK
    )
    comp_detail: Mapped[str] = mapped_column(String(255), default="")
    cert_serial: Mapped[str | None] = mapped_column(String(128))
    cert_not_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    whitelisted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
