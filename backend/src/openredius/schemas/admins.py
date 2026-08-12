"""Admin-account DTOs (docs/03「认证与会话」—设置页管理员 CRUD)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from openredius.models import AdminRole, AdminStatus


class AdminOut(BaseModel):
    id: int
    username: str
    display_name: str
    role: AdminRole
    status: AdminStatus
    created_at: datetime


class AdminCreate(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    display_name: str = ""
    password: str = Field(min_length=10, max_length=128)
    role: AdminRole = AdminRole.OPERATOR


class AdminUpdate(BaseModel):
    display_name: str | None = None
    role: AdminRole | None = None
    status: AdminStatus | None = None
    password: str | None = Field(default=None, min_length=10, max_length=128)
