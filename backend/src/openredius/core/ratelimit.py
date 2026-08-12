"""In-memory sliding-window rate limiter (single-replica assumption, docs/08)."""

from __future__ import annotations

import time
from collections import defaultdict, deque


class SlidingWindowRateLimiter:
    """Counts events per key inside a rolling window. Not distributed."""

    def __init__(self, limit: int, window_seconds: int) -> None:
        self._limit = limit
        self._window = window_seconds
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        """Record an event for ``key``; return False when over the limit."""
        now = time.monotonic()
        events = self._events[key]
        while events and now - events[0] > self._window:
            events.popleft()
        if len(events) >= self._limit:
            return False
        events.append(now)
        return True

    def reset(self, key: str) -> None:
        self._events.pop(key, None)


# Login endpoint limit: 20 attempts/minute per IP (docs/08). Instance is
# created per app (see main.create_app) so test apps start clean.
LOGIN_RATE_LIMIT = 20
LOGIN_RATE_WINDOW_SECONDS = 60
