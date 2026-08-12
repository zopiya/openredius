"""Application configuration (pydantic-settings, env prefix OPENRADIUS_).

Source of truth: docs/04-backend-design.md「配置」. Prod mode enforces
secret strength (see docs/08-security.md).
"""

from __future__ import annotations

import re
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_TTL_RE = re.compile(r"^(\d+)\s*([smhd])$")
_TTL_UNITS_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400}

_DEV_JWT_SECRET = "dev-only-jwt-secret-change-me-000"
_MIN_PROD_JWT_SECRET_LEN = 32


def parse_ttl(value: str) -> int:
    """Parse a TTL string like ``15m`` / ``7d`` into seconds."""
    match = _TTL_RE.match(value.strip().lower())
    if not match:
        raise ValueError(f"invalid TTL value: {value!r} (expected e.g. '15m', '7d')")
    return int(match.group(1)) * _TTL_UNITS_SECONDS[match.group(2)]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="OPENRADIUS_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    env: str = Field(default="dev", description="dev/prod; prod enforces secret validation")
    database_url: str = "sqlite+aiosqlite:///./openredius-dev.db"

    jwt_secret: str = _DEV_JWT_SECRET
    jwt_access_ttl: str = "15m"
    jwt_refresh_ttl: str = "7d"

    radius_coa_port: int = 3799
    radius_coa_timeout: float = 3.0
    # After a Disconnect-ACK, poll radacct this long for the NAS-side stop
    # before backend-closing the row (docs/04 CoA).
    radius_coa_close_poll_s: float = 10.0
    # Command used by POST /api/ops/reload-radius (empty = manual mode).
    # Dev: "docker compose -f deploy/docker-compose.dev.yml restart freeradius"
    radius_reload_command: str = ""
    nas_online_window: int = 300

    ad_url: str = ""
    ad_bind_dn: str = ""
    ad_bind_pw: str = ""
    ad_base_dn: str = ""
    ad_filter: str = ""
    ad_sync_cron: str = "*/15 * * * *"

    lockout_max_fails: int = 5
    lockout_window: int = 600
    lockout_duration: int = 1800

    cert_expire_warn_days: int = 14

    # Background jobs (docs/04): APScheduler assembly. Disabled in API tests.
    jobs_enabled: bool = True
    jobs_lockout_interval_s: int = 60
    jobs_nas_watchdog_interval_s: int = 60
    jobs_cert_scan_interval_s: int = 3600
    jobs_alert_gc_interval_s: int = 86400
    # Same (rule_key, subject) won't re-fire within this window (docs/04).
    alerts_dedup_window_s: int = 600
    alerts_retention_days: int = 90

    bootstrap_admin_user: str = ""
    bootstrap_admin_password: str = ""

    @field_validator("jwt_access_ttl", "jwt_refresh_ttl")
    @classmethod
    def _validate_ttl(cls, value: str) -> str:
        parse_ttl(value)
        return value

    @property
    def is_prod(self) -> bool:
        return self.env.lower() == "prod"

    @property
    def jwt_access_ttl_seconds(self) -> int:
        return parse_ttl(self.jwt_access_ttl)

    @property
    def jwt_refresh_ttl_seconds(self) -> int:
        return parse_ttl(self.jwt_refresh_ttl)

    def validate_for_env(self) -> None:
        """Prod-mode hard validation (docs/08). Raises ``ValueError`` on violation."""
        if not self.is_prod:
            return
        problems: list[str] = []
        if len(self.jwt_secret) < _MIN_PROD_JWT_SECRET_LEN or self.jwt_secret == _DEV_JWT_SECRET:
            problems.append(
                f"OPENRADIUS_JWT_SECRET must be >= {_MIN_PROD_JWT_SECRET_LEN} chars "
                "and not the dev default"
            )
        if self.database_url.startswith("sqlite"):
            problems.append("OPENRADIUS_DATABASE_URL must be PostgreSQL in prod")
        # Bootstrap credentials are intentionally not required here: they are a
        # first-start mechanism (docs/08). Startup fails instead when the DB has
        # no admin at all (see main.lifespan).
        if problems:
            raise ValueError("prod configuration invalid: " + "; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.validate_for_env()
    return settings
