"""Policy compiler service seam (docs/04).

M2 shipped a placeholder audit-only stub; M3 delegates to the real
``radius.compiler`` which diffs policy/user state into the radius schema.
On SQLite dev the radius writes are skipped but the audit row is still
recorded (docs/04: every compile writes audit_log).
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from openredius.radius.compiler import CompileSummary, compile_all


async def compile_policies(
    db: AsyncSession,
    *,
    actor: str,
    trigger: str,
) -> CompileSummary:
    """Recompile full policy/user state; ``trigger`` identifies the caller."""
    return await compile_all(db, actor=actor, trigger=trigger)
