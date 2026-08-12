"""Create a console admin account manually.

Usage:
    uv run python scripts/create_admin.py <username> --password <pw> \
        [--role admin|operator|auditor] [--display-name NAME] [--force]

Run ``alembic upgrade head`` first. ``--force`` resets an existing account's
password instead of failing.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys

from sqlalchemy import select

from openredius.core.config import get_settings
from openredius.core.db import close_db, get_session_factory, init_db
from openredius.core.security import hash_password
from openredius.models import AdminRole, AdminUser
from openredius.services import audit

_MIN_PASSWORD_LEN = 10  # docs/08


async def create_admin(
    username: str, password: str, role: AdminRole, display_name: str, force: bool
) -> None:
    settings = get_settings()
    init_db(settings.database_url)
    async with get_session_factory()() as session:
        result = await session.execute(select(AdminUser).where(AdminUser.username == username))
        admin = result.scalar_one_or_none()
        if admin is not None:
            if not force:
                print(f"error: admin '{username}' already exists (use --force to reset)")
                sys.exit(1)
            admin.password_hash = hash_password(password)
            admin.role = role
            admin.display_name = display_name or admin.display_name
            action = "reset"
        else:
            admin = AdminUser(
                username=username,
                display_name=display_name or username,
                password_hash=hash_password(password),
                role=role,
            )
            session.add(admin)
            action = "created"
        await audit.record_audit(
            session,
            actor="script",
            action="admin.create" if action == "created" else "admin.password_reset",
            target_type="admin_user",
            target_id=username,
            detail={"role": role.value},
        )
        await session.commit()
    await close_db()
    print(f"admin '{username}' {action} (role={role.value})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("username")
    parser.add_argument("--password", default=None, help="prompted securely if omitted")
    parser.add_argument("--role", choices=[r.value for r in AdminRole], default="admin")
    parser.add_argument("--display-name", default="")
    parser.add_argument("--force", action="store_true", help="reset existing account")
    args = parser.parse_args()

    password = args.password or getpass.getpass("Password: ")
    if len(password) < _MIN_PASSWORD_LEN:
        print(f"error: password must be at least {_MIN_PASSWORD_LEN} characters")
        sys.exit(1)

    asyncio.run(
        create_admin(args.username, password, AdminRole(args.role), args.display_name, args.force)
    )


if __name__ == "__main__":
    main()
