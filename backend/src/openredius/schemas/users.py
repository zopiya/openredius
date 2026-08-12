"""Access-user DTOs (docs/03「用户管理」, docs/02 access_user)."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from openredius.models import UserSource, UserStatus


class UserOut(BaseModel):
    id: int
    account: str
    name: str
    dept: str
    title: str
    status: UserStatus
    locked_until: datetime | None
    policy_id: int | None
    policy_name: str | None
    source: UserSource
    endpoint_count: int
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


class StatusAction(StrEnum):
    ENABLE = "enable"
    DISABLE = "disable"


class UserStatusRequest(BaseModel):
    accounts: list[str] = Field(min_length=1)
    action: StatusAction


class UserPolicyRequest(BaseModel):
    accounts: list[str] = Field(min_length=1)
    policy_id: int
