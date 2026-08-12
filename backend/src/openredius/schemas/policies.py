"""Policy-group DTOs (docs/03「策略管理」, docs/02 policy_group)."""

from __future__ import annotations

from datetime import datetime, time

from pydantic import BaseModel, Field

from openredius.models import EapMethod


class PolicyBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    slug: str = Field(min_length=1, max_length=64, pattern=r"^[a-z0-9_-]+$")
    description: str = ""
    scope_dept: str = ""
    eap_method: EapMethod = EapMethod.PEAP_MSCHAPV2
    vlan_id: int
    acl_name: str = ""
    session_timeout_s: int | None = Field(default=None, ge=0)
    reauth_interval_s: int | None = Field(default=None, ge=0)
    require_cert: bool = False
    require_mac_bind: bool = False
    require_edr: bool = False
    time_window_enabled: bool = False
    time_from: time = time(8, 0)
    time_to: time = time(20, 0)
    rate_limit_mbps: int | None = Field(default=None, ge=0)
    priority: int = 0
    enabled: bool = True


class PolicyCreate(PolicyBase):
    pass


class PolicyUpdate(PolicyBase):
    pass


class PolicyToggle(BaseModel):
    enabled: bool


class PolicyOut(PolicyBase):
    id: int
    vlan_name: str | None
    user_count: int
    created_at: datetime
    updated_at: datetime


class PolicyReorder(BaseModel):
    order: list[int] = Field(min_length=1)
