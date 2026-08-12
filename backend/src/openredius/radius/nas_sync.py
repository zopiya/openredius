"""radius.nas client sync (docs/06「NAS 客户端生命周期」).

FreeRADIUS ``read_clients`` only loads the nas table at startup, so every
write here requires a server restart (``POST /api/ops/reload-radius``); the
device endpoints surface ``reload_required`` accordingly (docs/03).
"""

from __future__ import annotations

from sqlalchemy import delete, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.models import NasDevice
from openredius.radius.tables import build_radius_metadata, schema_for_dialect


async def radius_available(db: AsyncSession) -> bool:
    """radius.nas exists on this connection (PostgreSQL stack or test DB)."""
    schema = schema_for_dialect(db.get_bind().dialect.name)
    return await db.run_sync(lambda s: inspect(s.connection()).has_table("nas", schema=schema))


def _nas_table(dialect_name: str):
    schema = schema_for_dialect(dialect_name)
    meta = build_radius_metadata(schema)
    prefix = f"{schema}." if schema else ""
    return meta.tables[f"{prefix}nas"]


async def upsert_nas_client(db: AsyncSession, device: NasDevice) -> None:
    """Create/update the radius.nas row for a NAS device (idempotent)."""
    table = _nas_table(db.get_bind().dialect.name)
    await db.execute(delete(table).where(table.c.nasname == device.nasname))
    await db.execute(
        table.insert().values(
            nasname=device.nasname,
            shortname=device.name,
            type=device.type.value,
            ports=device.capacity,
            secret=device.secret_enc,
            description=f"{device.area} {device.notes}".strip(),
        )
    )


async def remove_nas_client(db: AsyncSession, nasname: str) -> None:
    table = _nas_table(db.get_bind().dialect.name)
    await db.execute(delete(table).where(table.c.nasname == nasname))


async def list_nas_clients(db: AsyncSession) -> list[str]:
    table = _nas_table(db.get_bind().dialect.name)
    rows = await db.execute(select(table.c.nasname))
    return list(rows.scalars())
