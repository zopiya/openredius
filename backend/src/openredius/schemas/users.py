"""Access-user DTOs (docs/03「用户管理」, docs/02 access_user)."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from openredius.models import UserSource, UserStatus


class AdSyncResult(BaseModel):
    """Immediate response from POST /api/users/sync-ad."""

    triggered: bool
    message: str


class AdSyncJobOut(BaseModel):
    """Single AD sync job record."""

    id: int
    triggered_by: str
    started_at: datetime
    finished_at: datetime | None
    status: str
    added: int
    updated: int
    disabled: int
    error: str | None


class UserOut(BaseModel):
    id: int
    account: str
    name: str
    dept: str
    title: str
    email: str
    mobile: str
    description: str
    status: UserStatus
    locked_until: datetime | None
    policy_id: int | None
    policy_name: str | None
    source: UserSource
    endpoint_count: int
    last_auth: datetime | None = None
    created_at: datetime
    updated_at: datetime


class EndpointBrief(BaseModel):
    mac: str
    etype: str
    compliance: str
    whitelisted: bool


class RecentAuth(BaseModel):
    time: datetime
    reply: str
    reason: str | None = None
    reason_key: str | None = None
    nas_ip: str
    mac: str


class UserDetail(UserOut):
    endpoints: list[EndpointBrief]
    recent_auth: list[RecentAuth] = Field(default_factory=list)
    policy_rules: list[str] = Field(
        default_factory=list, description="编译后的 FreeRADIUS 属性清单"
    )


class StatusAction(StrEnum):
    ENABLE = "enable"
    DISABLE = "disable"


class UserStatusRequest(BaseModel):
    accounts: list[str] = Field(min_length=1)
    action: StatusAction


class UserPolicyRequest(BaseModel):
    accounts: list[str] = Field(min_length=1)
    policy_id: int
