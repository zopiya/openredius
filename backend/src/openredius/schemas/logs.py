"""Auth-log DTOs (docs/03「认证日志」)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class LogRowOut(BaseModel):
    id: int
    time: datetime
    user: str
    name: str
    sub: str
    mac: str
    nas: str
    nas_name: str
    nas_sub: str
    eap: str
    reply: str
    reason: str | None = None
    reason_key: str | None = None
    rtag_tone: str | None = None
    attr: str


class LogDetailOut(LogRowOut):
    attributes: dict[str, Any]
