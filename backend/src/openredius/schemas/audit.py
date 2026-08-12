"""Audit query DTO (docs/03「审计」)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditOut(BaseModel):
    id: int
    actor: str
    action: str
    target_type: str | None
    target_id: str | None
    detail: dict[str, Any] | None
    ip: str | None
    created_at: datetime
