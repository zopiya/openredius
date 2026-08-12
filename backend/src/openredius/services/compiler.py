"""Policy compiler (docs/04). M2 ships the placeholder: policy writes record a
`policy.compile` audit event; the real radcheck/radgroupreply/… compilation
lands with the M3 stack integration."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from openredius.services import audit


async def compile_policies_placeholder(
    db: AsyncSession, *, actor: str, trigger: str, policy_ids: list[int]
) -> None:
    await audit.record_audit(
        db,
        actor=actor,
        action="policy.compile",
        target_type="policy_group",
        target_id=",".join(str(i) for i in policy_ids) or None,
        detail={"status": "placeholder", "trigger": trigger},
    )
