"""Unit tests for config parsing and prod validation (docs/04)."""

import pytest

from openredius.core.config import Settings, parse_ttl


def test_parse_ttl_units():
    assert parse_ttl("15m") == 900
    assert parse_ttl("7d") == 604800
    assert parse_ttl("30s") == 30
    assert parse_ttl("2h") == 7200


def test_parse_ttl_rejects_garbage():
    for bad in ("", "15", "m", "15x", "abc"):
        with pytest.raises(ValueError):
            parse_ttl(bad)


def test_settings_ttl_properties():
    settings = Settings(jwt_access_ttl="15m", jwt_refresh_ttl="7d", _env_file=None)
    assert settings.jwt_access_ttl_seconds == 900
    assert settings.jwt_refresh_ttl_seconds == 604800


def test_invalid_ttl_rejected_at_construction():
    with pytest.raises(ValueError):
        Settings(jwt_access_ttl="banana", _env_file=None)


def test_prod_validation_rejects_dev_secret():
    settings = Settings(
        env="prod",
        jwt_secret="dev-only-jwt-secret-change-me",
        database_url="postgresql+asyncpg://u:p@localhost/openredius",
        bootstrap_admin_user="admin",
        bootstrap_admin_password="long-enough-password",
        _env_file=None,
    )
    with pytest.raises(ValueError, match="JWT_SECRET"):
        settings.validate_for_env()


def test_prod_validation_rejects_sqlite():
    settings = Settings(
        env="prod",
        jwt_secret="a-strong-secret-that-is-long-enough-32",
        database_url="sqlite+aiosqlite:///./prod.db",
        bootstrap_admin_user="admin",
        bootstrap_admin_password="long-enough-password",
        _env_file=None,
    )
    with pytest.raises(ValueError, match="PostgreSQL"):
        settings.validate_for_env()


def test_prod_validation_accepts_good_config():
    settings = Settings(
        env="prod",
        jwt_secret="a-strong-secret-that-is-long-enough-32",
        database_url="postgresql+asyncpg://u:p@localhost/openredius",
        bootstrap_admin_user="admin",
        bootstrap_admin_password="long-enough-password",
        _env_file=None,
    )
    settings.validate_for_env()


def test_dev_mode_skips_strict_validation():
    Settings(env="dev", _env_file=None).validate_for_env()
