"""Alembic migrations must apply and roll back cleanly (SQLite)."""

import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]


def test_alembic_upgrade_and_downgrade(tmp_path):
    db_path = tmp_path / "migration-check.db"
    url = f"sqlite+aiosqlite:///{db_path}"
    env_url = {"OPENRADIUS_DATABASE_URL": url}
    import os

    env = {**os.environ, **env_url}
    for args in (
        ["alembic", "upgrade", "head"],
        ["alembic", "downgrade", "base"],
        ["alembic", "upgrade", "head"],
    ):
        result = subprocess.run(
            [sys.executable, "-m", *args],
            cwd=BACKEND_DIR,
            env=env,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, f"{args} failed:\n{result.stderr}"
