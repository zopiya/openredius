"""Audit log writer (docs/08). IP falls back to the request context var.

M1 wires the hook; M2 enables comprehensive write-path auditing.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.logging import client_ip_var
from openredius.models import AuditLog


async def record_audit(
    db: AsyncSession,
    *,
    actor: str,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    detail: dict[str, Any] | None = None,
    ip: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor=actor,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail_json=detail,
        ip=ip or client_ip_var.get(),
    )
    db.add(entry)
    await db.flush()
    return entry
