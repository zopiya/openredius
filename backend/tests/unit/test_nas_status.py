"""nas_status 派生规则单测(docs/02「NAS 在线状态」)。"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from openredius.services.sessions import NasActivity, nas_status


def _ago(minutes: int) -> datetime:
    return datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=minutes)


def test_high_load_ratio_is_configurable():
    activity = NasActivity(last_seen=_ago(0), active_sessions=8)
    # capacity 10 → 0.8 load: below the default 0.9 threshold…
    assert nas_status(activity, 300, 10) == "online"
    # …but above a lowered 0.7 threshold (docs/04 OPENRADIUS_NAS_HIGH_LOAD_RATIO).
    assert nas_status(activity, 300, 10, high_load_ratio=0.7) == "high-load"


def test_offline_and_online_windows():
    assert nas_status(NasActivity(last_seen=_ago(6), active_sessions=0), 300, 10) == "offline"
    assert nas_status(NasActivity(last_seen=_ago(1), active_sessions=0), 300, 10) == "online"
    assert nas_status(None, 300, 10) == "offline"


def test_zero_capacity_never_high_load():
    activity = NasActivity(last_seen=_ago(0), active_sessions=999)
    assert nas_status(activity, 300, 0) == "online"
