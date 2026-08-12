"""radius-schema table mappings (docs/06, deploy/postgres/init/schema.sql).

Core (non-ORM) tables so the compiler can do set-based upsert/delete diffs.
The schema is parameterized: ``"radius"`` on PostgreSQL, ``None`` on SQLite so
compiler logic stays unit-testable (docs/09 scenario 1).
"""

from __future__ import annotations

from sqlalchemy import Column, Integer, MetaData, String, Table

ATTR_LEN = 64
OP_LEN = 2
VALUE_LEN = 253
GROUP_LEN = 64


def build_radius_metadata(schema: str | None) -> MetaData:
    """Build the radius table set for the given schema (None = main schema)."""
    meta = MetaData(schema=schema)

    def check_table(name: str) -> Table:
        return Table(
            name,
            meta,
            Column("id", Integer, primary_key=True),
            Column("username", String(ATTR_LEN), nullable=False, default=""),
            Column("attribute", String(ATTR_LEN), nullable=False, default=""),
            Column("op", String(OP_LEN), nullable=False, default="=="),
            Column("value", String(VALUE_LEN), nullable=False, default=""),
        )

    def group_table(name: str) -> Table:
        return Table(
            name,
            meta,
            Column("id", Integer, primary_key=True),
            Column("groupname", String(GROUP_LEN), nullable=False, default=""),
            Column("attribute", String(ATTR_LEN), nullable=False, default=""),
            Column("op", String(OP_LEN), nullable=False, default="=="),
            Column("value", String(VALUE_LEN), nullable=False, default=""),
        )

    check_table("radcheck")
    check_table("radreply")
    group_table("radgroupcheck")
    group_table("radgroupreply")
    Table(
        "radusergroup",
        meta,
        Column("id", Integer, primary_key=True),
        Column("username", String(ATTR_LEN), nullable=False, default=""),
        Column("groupname", String(GROUP_LEN), nullable=False, default=""),
        Column("priority", Integer, nullable=False, default=0),
    )
    Table(
        "nas",
        meta,
        Column("id", Integer, primary_key=True),
        Column("nasname", String(128), nullable=False),
        Column("shortname", String(32)),
        Column("type", String(30), nullable=False, default="other"),
        Column("ports", Integer),
        Column("secret", String(60), nullable=False),
        Column("server", String(64)),
        Column("community", String(50)),
        Column("description", String(200)),
    )
    return meta


def schema_for_dialect(dialect_name: str) -> str | None:
    """radius schema on PostgreSQL; main schema elsewhere (test doubles)."""
    return "radius" if dialect_name == "postgresql" else None
