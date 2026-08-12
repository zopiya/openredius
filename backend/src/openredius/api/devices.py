"""Device endpoints: NAS + endpoints (docs/03「设备管理」).

M2 manages the app-side tables; writing radius.nas and triggering the FreeRADIUS
reload happen with the M3 stack integration. Responses already carry the
contracted `reload_required` flag (docs/03).
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.db import get_db
from openredius.core.deps import current_admin, require_role
from openredius.core.errors import ApiError
from openredius.core.listing import PageParams, apply_sort, page_envelope
from openredius.core.mac import normalize_mac
from openredius.models import (
    AccessUser,
    AdminRole,
    AdminUser,
    Compliance,
    Endpoint,
    EndpointType,
    NasDevice,
    NasType,
)
from openredius.schemas.common import Affected
from openredius.schemas.devices import (
    EndpointCreate,
    EndpointImport,
    EndpointOut,
    EndpointUpdate,
    NasCreate,
    NasOut,
    NasSecret,
    NasUpdate,
    NasWriteResult,
)
from openredius.services import audit

router = APIRouter()

_NAS_SORT = {
    "name": NasDevice.name,
    "nasname": NasDevice.nasname,
    "created_at": NasDevice.created_at,
}
_ENDPOINT_SORT = {"mac": Endpoint.mac, "etype": Endpoint.etype, "created_at": Endpoint.created_at}


def mask_secret(secret: str) -> str:
    if len(secret) <= 8:
        return "****"
    return f"{secret[:4]}…{secret[-4:]}"


def _nas_out(device: NasDevice) -> NasOut:
    return NasOut(
        id=device.id,
        name=device.name,
        nasname=device.nasname,
        type=device.type,
        area=device.area,
        capacity=device.capacity,
        baseline_enabled=device.baseline_enabled,
        notes=device.notes,
        secret_masked=mask_secret(device.secret_enc),
        radius_nas_id=device.radius_nas_id,
        created_at=device.created_at,
        updated_at=device.updated_at,
    )


async def _check_nas_unique(
    db: AsyncSession, *, name: str, nasname: str, exclude_id: int | None = None
) -> None:
    stmt = select(NasDevice).where((NasDevice.name == name) | (NasDevice.nasname == nasname))
    if exclude_id is not None:
        stmt = stmt.where(NasDevice.id != exclude_id)
    clashes = (await db.execute(stmt)).scalars().all()
    if clashes:
        field = "name" if any(c.name == name for c in clashes) else "nasname"
        raise ApiError("conflict", f"NAS {field} already in use", 409)


# ---------------------------------------------------------------- NAS ----


@router.get("/nas")
async def list_nas(
    type: NasType | None = Query(default=None),
    area: str | None = None,
    status: str | None = Query(
        default=None,
        description="online/offline; derived from radpostauth/radacct in M6, inert in M2",
    ),
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(current_admin),
) -> dict:
    stmt = select(NasDevice)
    if type is not None:
        stmt = stmt.where(NasDevice.type == type)
    if area:
        stmt = stmt.where(NasDevice.area == area)
    total = len((await db.execute(stmt)).scalars().all())
    stmt = apply_sort(stmt, None, _NAS_SORT, "name")
    devices = (await db.execute(stmt)).scalars().all()
    return page_envelope([_nas_out(d) for d in devices], total, PageParams(1, max(total, 1)))


@router.post("/nas", status_code=201)
async def create_nas(
    body: NasCreate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> NasWriteResult:
    await _check_nas_unique(db, name=body.name, nasname=body.nasname)
    device = NasDevice(**body.model_dump(exclude={"secret"}), secret_enc=body.secret)
    db.add(device)
    await db.flush()
    await audit.record_audit(
        db,
        actor=admin.username,
        action="nas.create",
        target_type="nas_device",
        target_id=str(device.id),
        detail={"name": device.name, "nasname": device.nasname},
    )
    await db.commit()
    return NasWriteResult(device=_nas_out(device), reload_required=True)


@router.patch("/nas/{device_id}")
async def update_nas(
    device_id: int,
    body: NasUpdate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> NasWriteResult:
    device = await db.get(NasDevice, device_id)
    if device is None:
        raise ApiError("not_found", f"NAS {device_id} not found", 404)
    await _check_nas_unique(db, name=body.name, nasname=body.nasname, exclude_id=device_id)
    changes: dict[str, str | None] = {}
    for field, value in body.model_dump(exclude={"secret"}).items():
        if getattr(device, field) != value:
            changes[field] = f"{getattr(device, field)!r} -> {value!r}"
            setattr(device, field, value)
    if body.secret is not None and body.secret != device.secret_enc:
        device.secret_enc = body.secret
        changes["secret"] = "<changed>"
    await audit.record_audit(
        db,
        actor=admin.username,
        action="nas.update",
        target_type="nas_device",
        target_id=str(device_id),
        detail={"name": device.name, "changes": changes},
    )
    await db.commit()
    await db.refresh(device)
    return NasWriteResult(device=_nas_out(device), reload_required=True)


@router.delete("/nas/{device_id}", status_code=204)
async def delete_nas(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> None:
    device = await db.get(NasDevice, device_id)
    if device is None:
        raise ApiError("not_found", f"NAS {device_id} not found", 404)
    # M6 enforces "no active sessions" via radacct; M2 has no session source.
    await db.delete(device)
    await audit.record_audit(
        db,
        actor=admin.username,
        action="nas.delete",
        target_type="nas_device",
        target_id=str(device_id),
        detail={"name": device.name, "nasname": device.nasname},
    )
    await db.commit()


@router.get("/nas/{device_id}/secret")
async def reveal_nas_secret(
    device_id: int,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> NasSecret:
    device = await db.get(NasDevice, device_id)
    if device is None:
        raise ApiError("not_found", f"NAS {device_id} not found", 404)
    # Forced audit per docs/08; the plaintext itself never enters the audit row.
    await audit.record_audit(
        db,
        actor=admin.username,
        action="secret.reveal",
        target_type="nas_device",
        target_id=str(device_id),
        detail={"name": device.name},
    )
    await db.commit()
    return NasSecret(secret=device.secret_enc)


# ----------------------------------------------------------- endpoints ----


async def _endpoint_out(db: AsyncSession, endpoint: Endpoint) -> EndpointOut:
    owner_account = None
    owner_name = None
    if endpoint.owner_user_id is not None:
        owner = await db.get(AccessUser, endpoint.owner_user_id)
        if owner:
            owner_account = owner.account
            owner_name = owner.name
    return EndpointOut(
        id=endpoint.id,
        mac=endpoint.mac,
        fingerprint=endpoint.fingerprint,
        owner_account=owner_account,
        owner_name=owner_name,
        etype=endpoint.etype,
        compliance=endpoint.compliance,
        comp_detail=endpoint.comp_detail,
        cert_not_after=endpoint.cert_not_after,
        first_seen_at=endpoint.first_seen_at,
        whitelisted=endpoint.whitelisted,
        created_at=endpoint.created_at,
        updated_at=endpoint.updated_at,
    )


async def _resolve_owner(db: AsyncSession, account: str | None) -> int | None:
    if not account:
        return None
    user = (
        await db.execute(select(AccessUser).where(AccessUser.account == account.lower()))
    ).scalar_one_or_none()
    if user is None:
        raise ApiError("not_found", f"owner account {account!r} not found", 404)
    return user.id


@router.get("/endpoints")
async def list_endpoints(
    type: EndpointType | None = Query(default=None),
    comp: Compliance | None = None,
    q: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(current_admin),
) -> dict:
    stmt = select(Endpoint)
    if type is not None:
        stmt = stmt.where(Endpoint.etype == type)
    if comp is not None:
        stmt = stmt.where(Endpoint.compliance == comp)
    if q:
        stmt = stmt.where(Endpoint.mac.like(f"%{q.upper()}%"))
    stmt = apply_sort(stmt, None, _ENDPOINT_SORT, "mac")
    rows = (await db.execute(stmt)).scalars().all()
    items = [await _endpoint_out(db, e) for e in rows]
    return page_envelope(items, len(rows), PageParams(1, max(len(rows), 1)))


@router.post("/endpoints", status_code=201)
async def create_endpoint(
    body: EndpointCreate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> EndpointOut:
    mac = normalize_mac(body.mac)
    exists = (await db.execute(select(Endpoint).where(Endpoint.mac == mac))).scalar_one_or_none()
    if exists is not None:
        raise ApiError("conflict", f"endpoint {mac} already registered", 409)
    endpoint = Endpoint(
        mac=mac,
        fingerprint=body.fingerprint,
        owner_user_id=await _resolve_owner(db, body.owner_account),
        etype=body.etype,
        compliance=body.compliance,
        comp_detail=body.comp_detail,
        whitelisted=body.whitelisted,
        first_seen_at=datetime.now(UTC),
    )
    db.add(endpoint)
    await db.flush()
    await audit.record_audit(
        db,
        actor=admin.username,
        action="endpoint.create",
        target_type="endpoint",
        target_id=mac,
    )
    await db.commit()
    return await _endpoint_out(db, endpoint)


@router.patch("/endpoints/{mac}")
async def update_endpoint(
    mac: str,
    body: EndpointUpdate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> EndpointOut:
    endpoint = (
        await db.execute(select(Endpoint).where(Endpoint.mac == normalize_mac(mac)))
    ).scalar_one_or_none()
    if endpoint is None:
        raise ApiError("not_found", f"endpoint {mac} not found", 404)
    endpoint.fingerprint = body.fingerprint
    endpoint.owner_user_id = await _resolve_owner(db, body.owner_account)
    endpoint.etype = body.etype
    endpoint.compliance = body.compliance
    endpoint.comp_detail = body.comp_detail
    endpoint.whitelisted = body.whitelisted
    await audit.record_audit(
        db,
        actor=admin.username,
        action="endpoint.update",
        target_type="endpoint",
        target_id=endpoint.mac,
    )
    await db.commit()
    await db.refresh(endpoint)
    return await _endpoint_out(db, endpoint)


@router.post("/endpoints/import", response_model=Affected)
async def import_endpoints(
    body: EndpointImport,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> Affected:
    existing = {row[0] for row in await db.execute(select(Endpoint.mac))}
    added = 0
    for raw in body.macs:
        mac = normalize_mac(raw)
        if mac in existing:
            continue
        db.add(Endpoint(mac=mac, first_seen_at=datetime.now(UTC)))
        existing.add(mac)
        added += 1
    await audit.record_audit(
        db,
        actor=admin.username,
        action="endpoint.import",
        target_type="endpoint",
        detail={"submitted": len(body.macs), "added": added},
    )
    await db.commit()
    return Affected(affected=added)


@router.delete("/endpoints/{mac}/whitelist", response_model=Affected)
async def remove_from_whitelist(
    mac: str,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> Affected:
    endpoint = (
        await db.execute(select(Endpoint).where(Endpoint.mac == normalize_mac(mac)))
    ).scalar_one_or_none()
    if endpoint is None:
        raise ApiError("not_found", f"endpoint {mac} not found", 404)
    if not endpoint.whitelisted:
        return Affected(affected=0)
    endpoint.whitelisted = False
    if endpoint.compliance is Compliance.WHITE:
        endpoint.compliance = Compliance.OK
        endpoint.comp_detail = ""
    await audit.record_audit(
        db,
        actor=admin.username,
        action="endpoint.whitelist.remove",
        target_type="endpoint",
        target_id=endpoint.mac,
    )
    await db.commit()
    return Affected(affected=1)


@router.post("/endpoints/{mac}/revoke-cert", response_model=Affected)
async def revoke_endpoint_cert(
    mac: str,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> Affected:
    endpoint = (
        await db.execute(select(Endpoint).where(Endpoint.mac == normalize_mac(mac)))
    ).scalar_one_or_none()
    if endpoint is None:
        raise ApiError("not_found", f"endpoint {mac} not found", 404)
    endpoint.compliance = Compliance.BAD
    endpoint.comp_detail = "证书已吊销"
    await audit.record_audit(
        db,
        actor=admin.username,
        action="endpoint.cert.revoke",
        target_type="endpoint",
        target_id=endpoint.mac,
        detail={"cert_serial": endpoint.cert_serial},
    )
    await db.commit()
    return Affected(affected=1)
