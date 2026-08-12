"""System settings & alert rules (docs/03「系统设置」, system_setting table)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from openredius.core.db import get_db
from openredius.core.deps import require_role
from openredius.core.errors import ApiError
from openredius.models import AdminRole, AdminUser, AlertRule, SystemSetting
from openredius.schemas.settings import (
    AlertRuleOut,
    AlertRulesUpdate,
    SettingsOut,
    SettingsUpdate,
    SettingsWriteResult,
)
from openredius.services import audit

router = APIRouter()

_DEFAULT_PORTS = {"auth": 1812, "acct": 1813, "coa": 3799}
_CORE_KEYS = ("radius_auth_port", "radius_acct_port")


async def _get_setting(db: AsyncSession, key: str, default: dict | bool) -> dict | bool:
    setting = await db.get(SystemSetting, key)
    return setting.value_json if setting is not None else default


async def _put_setting(db: AsyncSession, key: str, value: dict | bool, actor: str) -> SystemSetting:
    setting = await db.get(SystemSetting, key)
    if setting is None:
        setting = SystemSetting(key=key)
        db.add(setting)
    setting.value_json = value
    setting.updated_by = actor
    await db.flush()
    return setting


def _assemble(ports: dict, alerts_enabled: bool, audit_enabled: bool) -> SettingsOut:
    return SettingsOut(
        radius_auth_port=ports.get("auth", _DEFAULT_PORTS["auth"]),
        radius_acct_port=ports.get("acct", _DEFAULT_PORTS["acct"]),
        coa_port=ports.get("coa", _DEFAULT_PORTS["coa"]),
        alerts_enabled=alerts_enabled,
        audit_enabled=audit_enabled,
    )


@router.get("")
async def get_settings(
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> SettingsOut:
    ports = await _get_setting(db, "radius.ports", _DEFAULT_PORTS)
    alerts = await _get_setting(db, "alerts.master", {"enabled": True})
    audit_enabled = await _get_setting(db, "audit.enabled", True)
    return _assemble(ports, alerts.get("enabled", True), bool(audit_enabled))


@router.put("")
async def update_settings(
    body: SettingsUpdate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> SettingsWriteResult:
    current = await get_settings(db=db, _admin=admin)
    core_changed = any(getattr(current, k) != getattr(body, k) for k in _CORE_KEYS)
    if core_changed and not body.confirm:
        raise ApiError(
            "confirm_required",
            "core RADIUS port change requires confirm=true",
            409,
            details={"confirm_required": True},
        )
    ports = {"auth": body.radius_auth_port, "acct": body.radius_acct_port, "coa": body.coa_port}
    await _put_setting(db, "radius.ports", ports, admin.username)
    await _put_setting(db, "alerts.master", {"enabled": body.alerts_enabled}, admin.username)
    await _put_setting(db, "audit.enabled", body.audit_enabled, admin.username)
    await audit.record_audit(
        db,
        actor=admin.username,
        action="settings.update",
        target_type="system_setting",
        detail=body.model_dump(exclude={"confirm"}),
    )
    await db.commit()
    out = _assemble(ports, body.alerts_enabled, body.audit_enabled)
    return SettingsWriteResult(settings=out, radius_reload_required=core_changed)


@router.get("/alert-rules")
async def get_alert_rules(
    db: AsyncSession = Depends(get_db),
    _admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> list[AlertRuleOut]:
    rules = (await db.execute(select(AlertRule).order_by(AlertRule.key))).scalars().all()
    return [
        AlertRuleOut(key=r.key, enabled=r.enabled, threshold=r.threshold_json or {}) for r in rules
    ]


@router.put("/alert-rules")
async def update_alert_rules(
    body: AlertRulesUpdate,
    db: AsyncSession = Depends(get_db),
    admin: AdminUser = Depends(require_role(AdminRole.ADMIN)),
) -> list[AlertRuleOut]:
    result: list[AlertRuleOut] = []
    for item in body.rules:
        rule = (
            await db.execute(select(AlertRule).where(AlertRule.key == item.key))
        ).scalar_one_or_none()
        if rule is None:
            rule = AlertRule(key=item.key)
            db.add(rule)
        rule.enabled = item.enabled
        rule.threshold_json = item.threshold
        result.append(AlertRuleOut(key=rule.key, enabled=rule.enabled, threshold=item.threshold))
    await audit.record_audit(
        db,
        actor=admin.username,
        action="alert_rules.update",
        target_type="alert_rule",
        detail={"rules": [r.model_dump() for r in body.rules]},
    )
    await db.commit()
    return result
