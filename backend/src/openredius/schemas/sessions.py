"""Session DTOs (docs/03「在线会话」)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SessionRowOut(BaseModel):
    acct_unique_id: str
    acct_session_id: str
    username: str
    name: str
    dept: str
    mac: str
    method: str  # 有线 / WiFi
    nas_name: str
    nas_area: str
    nas_ip: str
    nas_port: str
    called: str
    ip: str
    vlan: str
    vlan_label: str
    auth_method: str
    duration_s: int
    status: str  # online / reauth-pending
    filter_id: str
    session_timeout: str
    start: datetime
    bytes_in: int
    bytes_out: int


class SessionDetailOut(SessionRowOut):
    attributes: dict[str, Any] = Field(default_factory=dict)


class DisconnectFailure(BaseModel):
    id: str
    reason: str


class DisconnectRequest(BaseModel):
    # Capped so the serial DB-close phase stays inside proxy timeouts (docs/04).
    session_ids: list[str] = Field(min_length=1, max_length=50)
    confirm: bool = False


class DisconnectResult(BaseModel):
    disconnected: int
    failed: list[DisconnectFailure]
