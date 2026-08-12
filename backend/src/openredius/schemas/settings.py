"""System settings & alert-rule DTOs (docs/03「系统设置」)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SettingsOut(BaseModel):
    radius_auth_port: int
    radius_acct_port: int
    coa_port: int
    alerts_enabled: bool
    audit_enabled: bool


class SettingsUpdate(BaseModel):
    radius_auth_port: int = Field(ge=1, le=65535)
    radius_acct_port: int = Field(ge=1, le=65535)
    coa_port: int = Field(ge=1, le=65535)
    alerts_enabled: bool
    audit_enabled: bool
    # Core-port changes require explicit confirmation (docs/03).
    confirm: bool = False


class SettingsWriteResult(BaseModel):
    settings: SettingsOut
    radius_reload_required: bool


class AlertRuleOut(BaseModel):
    key: str
    enabled: bool
    threshold: dict[str, Any]


class AlertRuleIn(BaseModel):
    key: str
    enabled: bool
    threshold: dict[str, Any] = Field(default_factory=dict)


class AlertRulesUpdate(BaseModel):
    rules: list[AlertRuleIn]
