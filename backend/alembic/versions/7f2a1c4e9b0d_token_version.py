"""admin_user: add token_version for password-change revocation

Revision ID: 7f2a1c4e9b0d
Revises: 85d5e918f367
Create Date: 2026-08-12

docs/08「认证机制」: 改密后旧 refresh 作废。令牌携带 ``ver`` 声明,与
admin_user.token_version 比对;改密时递增该列,使旧 access/refresh 全部失效。
默认 0,对既有令牌(无 ver 声明)向后兼容。
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7f2a1c4e9b0d"
down_revision: str | None = "85d5e918f367"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "admin_user",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("admin_user", "token_version")
