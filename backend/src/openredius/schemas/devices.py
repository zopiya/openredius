"""Device DTOs: NAS + endpoints (docs/03「设备管理」)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from openredius.models import Compliance, EndpointType, NasType


class NasBase(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    nasname: str = Field(min_length=7, max_length=45)
    type: NasType = NasType.SWITCH
    area: str = ""
    capacity: int | None = Field(default=None, ge=0)
    baseline_enabled: bool = True
    notes: str = ""


class NasCreate(NasBase):
    secret: str = Field(min_length=8, max_length=128)


class NasUpdate(NasBase):
    secret: str | None = Field(default=None, min_length=8, max_length=128)


class NasOut(NasBase):
    id: int
    secret_masked: str
    radius_nas_id: int | None
    # Derived (docs/02 NAS 在线状态): online / offline / high-load.
    status: str = "offline"
    active_sessions: int = 0
    load_pct: float | None = None
    last_seen: datetime | None = None
    created_at: datetime
    updated_at: datetime


class NasWriteResult(BaseModel):
    device: NasOut
    reload_required: bool


class NasSecret(BaseModel):
    secret: str


class EndpointBase(BaseModel):
    fingerprint: str = ""
    owner_account: str | None = None
    etype: EndpointType = EndpointType.OTHER
    compliance: Compliance = Compliance.OK
    comp_detail: str = ""
    whitelisted: bool = False


class EndpointCreate(EndpointBase):
    mac: str


class EndpointUpdate(EndpointBase):
    pass


class EndpointOut(EndpointBase):
    id: int
    mac: str
    owner_name: str | None
    cert_serial: str | None
    cert_not_after: datetime | None
    first_seen_at: datetime | None
    created_at: datetime
    updated_at: datetime


class EndpointImport(BaseModel):
    macs: list[str] = Field(min_length=1)
