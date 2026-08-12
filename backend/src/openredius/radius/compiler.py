"""Policy compiler (docs/04「策略编译器」, docs/06).

Compiles policy_group/access_user state from the app schema into the
radius schema consumed by FreeRADIUS (rlm_sql). Full recompile is idempotent:
existing rows owned by the compiler are diffed against the desired state and
upserted/deleted in one transaction. Rows the compiler does not own (e.g.
``radcheck`` ``Cleartext-Password`` written by seed/AD) are never touched.

On non-PostgreSQL dialects (local SQLite dev) radius writes are skipped —
there is no FreeRADIUS consumer there; callers still get a summary.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from sqlalchemy import MetaData, delete, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.models import AccessUser, PolicyGroup, UserStatus, Vlan
from openredius.radius.tables import build_radius_metadata, schema_for_dialect
from openredius.services.audit import record_audit

GROUP_PREFIX = "policy_"

# Rows the compiler owns per table (attribute-level for user tables).
_OWNED_RADCHECK_ATTRS = ("Auth-Type",)
_OWNED_RADREPLY_ATTRS = ("Class", "Reply-Message", "OpenRedius-Deny-Reason")

_REJECT_DETAIL = {
    UserStatus.LOCKED: ("reason=account-locked", "Account locked by administrator"),
    UserStatus.DISABLED: ("reason=account-disabled", "Account disabled"),
}


@lru_cache(maxsize=2)
def _radius_meta(schema: str | None) -> MetaData:
    return build_radius_metadata(schema)


@dataclass
class CompileSummary:
    groups_compiled: int = 0
    groups_dropped: int = 0
    user_assignments: int = 0
    reject_entries: int = 0
    rows_added: int = 0
    rows_removed: int = 0
    skipped: bool = False

    def as_audit_detail(self, trigger: str = "manual") -> dict:
        detail = {
            "trigger": trigger,
            "status": "skipped" if self.skipped else "ok",
            "groups_compiled": self.groups_compiled,
            "groups_dropped": self.groups_dropped,
            "user_assignments": self.user_assignments,
            "reject_entries": self.reject_entries,
            "rows_added": self.rows_added,
            "rows_removed": self.rows_removed,
        }
        if self.skipped:
            detail["reason"] = "radius schema only provisioned on postgresql"
        return detail


def _group_name(slug: str) -> str:
    return f"{GROUP_PREFIX}{slug}"


def _policy_flags(policy: PolicyGroup) -> list[str]:
    flags = []
    if policy.require_mac_bind:
        flags.append("mac")
    if policy.require_edr:
        flags.append("edr")
    if policy.time_window_enabled:
        flags.append("time")
    if policy.require_cert:
        flags.append("cert")
    return flags


def _desired_group_rows(policy: PolicyGroup, vlan_vid: int) -> tuple[list[tuple], list[tuple]]:
    """(radgroupreply rows, radgroupcheck rows) for one enabled policy."""
    name = _group_name(policy.slug)
    reply = [
        (name, "Tunnel-Type", ":=", "VLAN"),
        (name, "Tunnel-Medium-Type", ":=", "IEEE-802"),
        (name, "Tunnel-Private-Group-Id", ":=", str(vlan_vid)),
    ]
    if policy.acl_name:
        reply.append((name, "Filter-Id", ":=", policy.acl_name))
    if policy.session_timeout_s:
        reply.append((name, "Session-Timeout", ":=", str(policy.session_timeout_s)))
    if policy.rate_limit_mbps:
        bps = str(policy.rate_limit_mbps * 1_000_000)
        reply.append((name, "WISPr-Bandwidth-Max-Up", ":=", bps))
        reply.append((name, "WISPr-Bandwidth-Max-Down", ":=", bps))
    check = []
    flags = _policy_flags(policy)
    if flags:
        check.append((name, "OpenRedius-Flags", ":=", ",".join(flags)))
    return reply, check


async def _sync_rows(
    db: AsyncSession,
    table,
    *,
    key_cols: tuple[str, ...],
    existing: set[tuple],
    desired: set[tuple],
) -> tuple[int, int]:
    """Delete stale rows, insert missing ones; returns (added, removed)."""
    to_remove = existing - desired
    to_add = desired - existing
    if to_remove:
        for key in to_remove:
            conditions = [table.c[col] == value for col, value in zip(key_cols, key, strict=True)]
            await db.execute(delete(table).where(*conditions))
    if to_add:
        # Desired tuples already carry every mapped column (incl. op/value or priority).
        rows = [dict(zip(key_cols, row, strict=True)) for row in to_add]
        await db.execute(table.insert(), rows)
    return len(to_add), len(to_remove)


async def compile_all(db: AsyncSession, actor: str, trigger: str = "manual") -> CompileSummary:
    """Recompile the full policy/user state into the radius schema."""
    summary = CompileSummary()

    policies = (
        await db.execute(select(PolicyGroup, Vlan.vid).join(Vlan, PolicyGroup.vlan_id == Vlan.id))
    ).all()
    users = (
        await db.execute(
            select(AccessUser, PolicyGroup).join(
                PolicyGroup, AccessUser.policy_group_id == PolicyGroup.id
            )
        )
    ).all()

    dialect_name = db.get_bind().dialect.name
    schema = schema_for_dialect(dialect_name)
    has_tables = await db.run_sync(
        lambda s: inspect(s.connection()).has_table("radcheck", schema=schema)
    )
    if not has_tables:
        # No radius objects here (plain SQLite dev): nothing to compile against.
        summary.skipped = True
        await record_audit(
            db,
            actor=actor,
            action="policy.compile",
            target_type="policy",
            target_id="all",
            detail=summary.as_audit_detail(trigger),
        )
        return summary

    meta = _radius_meta(schema)
    prefix = f"{schema}." if schema else ""
    radgroupreply = meta.tables[f"{prefix}radgroupreply"]
    radgroupcheck = meta.tables[f"{prefix}radgroupcheck"]
    radusergroup = meta.tables[f"{prefix}radusergroup"]
    radcheck = meta.tables[f"{prefix}radcheck"]
    radreply = meta.tables[f"{prefix}radreply"]

    # ---- desired state -------------------------------------------------
    desired_reply: set[tuple] = set()
    desired_check: set[tuple] = set()
    enabled_groups: set[str] = set()
    for policy, vid in policies:
        if not policy.enabled:
            summary.groups_dropped += 1
            continue
        reply, check = _desired_group_rows(policy, vid)
        desired_reply.update(reply)
        desired_check.update(check)
        enabled_groups.add(_group_name(policy.slug))
        summary.groups_compiled += 1

    desired_usergroup: set[tuple] = set()
    for user, policy in users:
        if user.status != UserStatus.ACTIVE or not policy.enabled:
            continue
        desired_usergroup.add((user.account, _group_name(policy.slug), policy.priority))
    summary.user_assignments = len(desired_usergroup)

    desired_reject_check: set[tuple] = set()
    desired_reject_reply: set[tuple] = set()
    for user, _policy in users:
        if user.status == UserStatus.ACTIVE:
            continue
        class_value, message = _REJECT_DETAIL[user.status]
        desired_reject_check.add((user.account, "Auth-Type", ":=", "Reject"))
        desired_reject_reply.add((user.account, "Class", ":=", class_value))
        # String mirror: Class is octets on the wire; rlm_sql would persist it
        # as 0x-hex. radpostauth.class reads this attribute instead (docs/06).
        desired_reject_reply.add((user.account, "OpenRedius-Deny-Reason", ":=", class_value))
        desired_reject_reply.add((user.account, "Reply-Message", ":=", message))
        summary.reject_entries += 1

    # ---- diff + apply --------------------------------------------------
    existing_reply = {
        (r.groupname, r.attribute, r.op, r.value)
        for r in (
            await db.execute(
                select(radgroupreply).where(radgroupreply.c.groupname.startswith(GROUP_PREFIX))
            )
        ).all()
    }
    existing_check = {
        (r.groupname, r.attribute, r.op, r.value)
        for r in (
            await db.execute(
                select(radgroupcheck).where(radgroupcheck.c.groupname.startswith(GROUP_PREFIX))
            )
        ).all()
    }
    existing_usergroup = {
        (r.username, r.groupname, r.priority)
        for r in (
            await db.execute(
                select(radusergroup).where(radusergroup.c.groupname.startswith(GROUP_PREFIX))
            )
        ).all()
    }
    existing_reject_check = {
        (r.username, r.attribute, r.op, r.value)
        for r in (
            await db.execute(
                select(radcheck).where(radcheck.c.attribute.in_(_OWNED_RADCHECK_ATTRS))
            )
        ).all()
    }
    existing_reject_reply = {
        (r.username, r.attribute, r.op, r.value)
        for r in (
            await db.execute(
                select(radreply).where(radreply.c.attribute.in_(_OWNED_RADREPLY_ATTRS))
            )
        ).all()
    }

    added = removed = 0
    a, r = await _sync_rows(
        db,
        radgroupreply,
        key_cols=("groupname", "attribute", "op", "value"),
        existing=existing_reply,
        desired=desired_reply,
    )
    added += a
    removed += r
    a, r = await _sync_rows(
        db,
        radgroupcheck,
        key_cols=("groupname", "attribute", "op", "value"),
        existing=existing_check,
        desired=desired_check,
    )
    added += a
    removed += r
    a, r = await _sync_rows(
        db,
        radusergroup,
        key_cols=("username", "groupname", "priority"),
        existing=existing_usergroup,
        desired=desired_usergroup,
    )
    added += a
    removed += r
    a, r = await _sync_rows(
        db,
        radcheck,
        key_cols=("username", "attribute", "op", "value"),
        existing=existing_reject_check,
        desired=desired_reject_check,
    )
    added += a
    removed += r
    a, r = await _sync_rows(
        db,
        radreply,
        key_cols=("username", "attribute", "op", "value"),
        existing=existing_reject_reply,
        desired=desired_reject_reply,
    )
    added += a
    removed += r
    summary.rows_added = added
    summary.rows_removed = removed

    await record_audit(
        db,
        actor=actor,
        action="policy.compile",
        target_type="policy",
        target_id="all",
        detail=summary.as_audit_detail(trigger),
    )
    return summary
