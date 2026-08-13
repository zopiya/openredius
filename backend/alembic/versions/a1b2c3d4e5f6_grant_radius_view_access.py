"""Grant radius role SELECT on public views (project audit 2026-08-13)

Revision ID: a1b2c3d4e5f6
Revises: 7f2a1c4e9b0d
Create Date: 2026-08-13

The policy-openredius unlang block reads ``public.v_user_policy_flags`` via
rlm_sql's inline xlat (radius role, search_path=radius). The 01-init.sh
default privileges cover tables only; PostgreSQL views are not covered by
``GRANT ... ON TABLES`` default privileges, so a fresh database left the
view unreadable to radius — every mac/edr/time/cert check silently no-oped
(requests were accepted instead of rejected). Grant explicitly, PostgreSQL
only (the view itself is PG-conditional per docs/04).
"""

from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "7f2a1c4e9b0d"
branch_labels = None
depends_on = None

_VIEW = "public.v_user_policy_flags"
# Tables the unlang inline SQL reads directly (mac/edr checks join these).
_UNLANG_TABLES = ("public.endpoint", "public.access_user")


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        for obj in _UNLANG_TABLES:
            op.execute(f"GRANT SELECT ON {obj} TO radius")
        op.execute(f"GRANT SELECT ON {_VIEW} TO radius")
        op.execute("GRANT EXECUTE ON FUNCTION public.norm_mac(text) TO radius")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute(f"REVOKE SELECT ON {_VIEW} FROM radius")
        op.execute("REVOKE EXECUTE ON FUNCTION public.norm_mac(text) FROM radius")
        for obj in _UNLANG_TABLES:
            op.execute(f"REVOKE SELECT ON {obj} FROM radius")
