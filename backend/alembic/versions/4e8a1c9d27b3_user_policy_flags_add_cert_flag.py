"""v_user_policy_flags: add cert flag (M3)

Revision ID: 4e8a1c9d27b3
Revises: cf9a9b67326d
Create Date: 2026-08-12

The M3 policy-openredius unlang also enforces certificate expiry
(docs/06 policy consumption), so the view must surface require_cert
as a ``cert`` flag alongside mac/edr/time.
"""

from alembic import op

revision = "4e8a1c9d27b3"
down_revision = "cf9a9b67326d"
branch_labels = None
depends_on = None

_VIEW_SQL = """
CREATE OR REPLACE VIEW public.v_user_policy_flags AS
SELECT b.account,
       concat_ws(',',
         CASE WHEN b.require_mac_bind THEN 'mac' END,
         CASE WHEN b.require_edr THEN 'edr' END,
         CASE WHEN b.time_window_enabled
              THEN 'time:' || to_char(b.time_from, 'HH24:MI')
                   || '-' || to_char(b.time_to, 'HH24:MI') END,
         CASE WHEN b.require_cert THEN 'cert' END
       ) AS flags_csv
FROM (
  SELECT DISTINCT ON (u.account)
         u.account, p.require_mac_bind, p.require_edr,
         p.time_window_enabled, p.time_from, p.time_to, p.require_cert
  FROM access_user u
  JOIN policy_group p ON p.id = u.policy_group_id
  WHERE p.enabled AND u.status = 'active'
  ORDER BY u.account, p.priority DESC
) b
"""

_VIEW_SQL_OLD = """
CREATE OR REPLACE VIEW public.v_user_policy_flags AS
SELECT b.account,
       concat_ws(',',
         CASE WHEN b.require_mac_bind THEN 'mac' END,
         CASE WHEN b.require_edr THEN 'edr' END,
         CASE WHEN b.time_window_enabled
              THEN 'time:' || to_char(b.time_from, 'HH24:MI')
                   || '-' || to_char(b.time_to, 'HH24:MI') END
       ) AS flags_csv
FROM (
  SELECT DISTINCT ON (u.account)
         u.account, p.require_mac_bind, p.require_edr,
         p.time_window_enabled, p.time_from, p.time_to
  FROM access_user u
  JOIN policy_group p ON p.id = u.policy_group_id
  WHERE p.enabled AND u.status = 'active'
  ORDER BY u.account, p.priority DESC
) b
"""


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute(_VIEW_SQL)


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute(_VIEW_SQL_OLD)
