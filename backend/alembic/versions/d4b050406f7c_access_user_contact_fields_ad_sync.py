"""access_user contact fields (AD sync)

Revision ID: d4b050406f7c
Revises: a1b2c3d4e5f6
Create Date: 2026-08-14 03:09:54.725459

Adds email/mobile/description to access_user (docs/15 FR-005: AD attribute
sync). Existing rows get the empty-string default — no guessing of values.
Also creates the ix_admin_user_linked_account index that the
85d5e918f367 migration missed (model has index=True; autogenerate surfaces
it on every run otherwise).
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d4b050406f7c"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "access_user",
        sa.Column("email", sa.String(length=128), nullable=False, server_default=""),
    )
    op.add_column(
        "access_user",
        sa.Column("mobile", sa.String(length=32), nullable=False, server_default=""),
    )
    op.add_column(
        "access_user",
        sa.Column("description", sa.String(length=256), nullable=False, server_default=""),
    )
    # Missed by 85d5e918f367 (model declares index=True on linked_account).
    op.create_index(op.f("ix_admin_user_linked_account"), "admin_user", ["linked_account"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_admin_user_linked_account"), table_name="admin_user")
    op.drop_column("access_user", "description")
    op.drop_column("access_user", "mobile")
    op.drop_column("access_user", "email")
