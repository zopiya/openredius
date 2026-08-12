"""radius-schema table mappings (docs/06, deploy/postgres/init/schema.sql).

Core (non-ORM) tables so the compiler can do set-based upsert/delete diffs.
The schema is parameterized: ``"radius"`` on PostgreSQL, ``None`` on SQLite so
compiler logic stays unit-testable (docs/09 scenario 1).
"""

from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    Integer,
    MetaData,
    String,
    Table,
    inspect,
)
from sqlalchemy import cast as _sa_cast
from sqlalchemy import func as _sa_func
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.ext.asyncio import AsyncSession

ATTR_LEN = 64
OP_LEN = 2
VALUE_LEN = 253
GROUP_LEN = 64

# radacct inet columns on PostgreSQL; plain text on SQLite test doubles.
_INET = INET().with_variant(String(64), "sqlite")


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
        "radacct",
        meta,
        Column("radacctid", BigInteger().with_variant(Integer, "sqlite"), primary_key=True),
        Column("acctsessionid", String(64), nullable=False, default=""),
        Column("acctuniqueid", String(32), nullable=False, default=""),
        Column("username", String(ATTR_LEN), nullable=False, default=""),
        Column("groupname", String(GROUP_LEN), nullable=False, default=""),
        Column("realm", String(ATTR_LEN), default=""),
        Column("nasipaddress", _INET, nullable=False),
        Column("nasportid", String(32)),
        Column("nasporttype", String(32)),
        Column("acctstarttime", DateTime),
        Column("acctupdatetime", DateTime),
        Column("acctstoptime", DateTime),
        Column("acctinterval", BigInteger, nullable=False, default=0),
        Column("acctsessiontime", BigInteger, nullable=False, default=0),
        Column("acctauthentic", String(32)),
        Column("connectinfo_start", String(50)),
        Column("connectinfo_stop", String(50)),
        Column("acctinputoctets", BigInteger, nullable=False, default=0),
        Column("acctoutputoctets", BigInteger, nullable=False, default=0),
        Column("calledstationid", String(50), nullable=False, default=""),
        Column("callingstationid", String(50), nullable=False, default=""),
        Column("acctterminatecause", String(32), nullable=False, default=""),
        Column("servicetype", String(32)),
        Column("framedprotocol", String(32)),
        Column("framedipaddress", _INET),
        Column("framedipv6address", _INET, nullable=False, default="::"),
        Column("class", String(ATTR_LEN), nullable=False, default=""),
    )
    Table(
        "radpostauth",
        meta,
        Column("id", BigInteger().with_variant(Integer, "sqlite"), primary_key=True),
        Column("username", String(ATTR_LEN), nullable=False, default=""),
        Column("pass", String(1024)),
        Column("reply", String(32)),
        Column("calledstationid", String(50)),
        Column("callingstationid", String(50)),
        Column("nasipaddress", String(64), nullable=False, default=""),
        Column("authdate", DateTime, nullable=False),
        Column("class", String(ATTR_LEN), nullable=False, default=""),
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


async def radius_readable(db: AsyncSession, table: str = "radacct") -> bool:
    """Whether the radius accounting tables exist for this dialect.

    PostgreSQL carries them in the ``radius`` schema (compose init); the SQLite
    dev/test DB has none, so read services must degrade to empty results
    instead of 500s.
    """
    conn = await db.connection()

    def _probe(sync_conn) -> bool:
        insp = inspect(sync_conn)
        schemas = [schema_for_dialect(conn.dialect.name)]
        return any(insp.has_table(table, schema=sc) for sc in schemas)

    return await conn.run_sync(_probe)


_META_CACHE: dict[str | None, MetaData] = {}


def radius_meta(dialect_name: str) -> MetaData:
    """Cached radius metadata per dialect — reuse the same Table objects so
    SQLAlchemy FROM-correlation works across query pieces (docs/04 读服务)."""
    schema = schema_for_dialect(dialect_name)
    meta = _META_CACHE.get(schema)
    if meta is None:
        meta = _META_CACHE[schema] = build_radius_metadata(schema)
    return meta


def radius_table(dialect_name: str, name: str) -> Table:
    """Fetch a radius table by bare name regardless of schema prefix."""
    meta = radius_meta(dialect_name)
    schema = schema_for_dialect(dialect_name)
    key = f"{schema}.{name}" if schema else name
    return meta.tables[key]


def ip_text(db: AsyncSession, column):
    """Textual IP for joins/comparisons.

    ``radacct.nasipaddress`` is ``inet`` on PostgreSQL; casting it to text
    yields CIDR form (``127.0.0.2/32``), so use ``host()`` there. SQLite test
    doubles store plain text.
    """
    if db.get_bind().dialect.name == "postgresql":
        return _sa_func.host(column)
    return _sa_cast(column, String(64))
