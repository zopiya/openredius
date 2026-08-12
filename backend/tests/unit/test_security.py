"""Unit tests for security primitives and the rate limiter."""

from openredius.core.ratelimit import SlidingWindowRateLimiter
from openredius.core.security import hash_password, verify_password


def test_password_hash_roundtrip():
    hashed = hash_password("a-strong-password")
    assert verify_password(hashed, "a-strong-password")
    assert not verify_password(hashed, "wrong-password")


def test_password_hash_is_salted():
    assert hash_password("same") != hash_password("same")


def test_verify_rejects_garbage_hash():
    assert not verify_password("not-an-argon2-hash", "whatever")


def test_rate_limiter_allows_then_blocks():
    limiter = SlidingWindowRateLimiter(limit=3, window_seconds=60)
    assert limiter.allow("ip1")
    assert limiter.allow("ip1")
    assert limiter.allow("ip1")
    assert not limiter.allow("ip1")
    # Other keys are independent.
    assert limiter.allow("ip2")


def test_rate_limiter_reset():
    limiter = SlidingWindowRateLimiter(limit=1, window_seconds=60)
    assert limiter.allow("ip1")
    assert not limiter.allow("ip1")
    limiter.reset("ip1")
    assert limiter.allow("ip1")
