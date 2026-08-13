"""admin_linked_account

Revision ID: 85d5e918f367
Revises: 4e8a1c9d27b3
Create Date: 2026-08-12 13:54:50.877657

"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = '85d5e918f367'
down_revision: str | None = '4e8a1c9d27b3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("admin_user") as batch_op:
            batch_op.add_column(sa.Column("linked_account", sa.String(64), nullable=True))
            batch_op.alter_column("password_hash", existing_type=sa.String(255), nullable=True)
        return

    op.add_column("admin_user", sa.Column("linked_account", sa.String(64), nullable=True))
    op.alter_column("admin_user", "password_hash", existing_type=sa.String(255), nullable=True)


def downgrade() -> None:
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("admin_user") as batch_op:
            batch_op.drop_column("linked_account")
            batch_op.alter_column("password_hash", existing_type=sa.String(255), nullable=False)
        return

    op.drop_column("admin_user", "linked_account")
    op.alter_column("admin_user", "password_hash", existing_type=sa.String(255), nullable=False)
