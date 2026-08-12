"""MAC normalization (docs/02 命名约定)."""

from __future__ import annotations

import pytest

from openredius.core.errors import ApiError
from openredius.core.mac import normalize_mac


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("3C:52:82:1A:4B:01", "3C:52:82:1A:4B:01"),
        ("3c:52:82:1a:4b:01", "3C:52:82:1A:4B:01"),
        ("3c-52-82-1a-4b-01", "3C:52:82:1A:4B:01"),
        ("3c.52.82.1a.4b.01", "3C:52:82:1A:4B:01"),
        ("3C52821A4B01", "3C:52:82:1A:4B:01"),
        ("  aabbccddeeff  ", "AA:BB:CC:DD:EE:FF"),
    ],
)
def test_normalize_mac_accepts_variants(raw: str, expected: str) -> None:
    assert normalize_mac(raw) == expected


@pytest.mark.parametrize("raw", ["", "3C:52:82:1A:4B", "GG:52:82:1A:4B:01", "3C52821A4B0", "no"])
def test_normalize_mac_rejects_invalid(raw: str) -> None:
    with pytest.raises(ApiError) as exc:
        normalize_mac(raw)
    assert exc.value.code == "invalid_mac"
    assert exc.value.status_code == 422
