"""MAC normalization (docs/02 命名约定, docs/06 norm_mac semantics)."""

from __future__ import annotations

import re

from openredius.core.errors import ApiError

_HEX_PAIR = re.compile(r"^[0-9A-F]{2}$")
_BARE = re.compile(r"^[0-9A-F]{12}$")


def normalize_mac(value: str) -> str:
    """Uppercase, colon-separated canonical form.

    Accepts `-`/`.` separators (converted to `:`) and the bare 12-hex form.
    Anything that does not land on exactly six hex pairs is rejected, so
    mixed/truncated inputs can never reach the DB (docs/06 mac-bind relies
    on canonical equality with Calling-Station-Id).
    """
    cleaned = value.strip().upper().replace("-", ":").replace(".", ":")
    if ":" in cleaned:
        pairs = cleaned.split(":")
        if len(pairs) == 6 and all(_HEX_PAIR.fullmatch(p) for p in pairs):
            return ":".join(pairs)
        raise ApiError("invalid_mac", f"invalid MAC address: {value!r}", 422)
    if _BARE.fullmatch(cleaned):
        return ":".join(cleaned[i : i + 2] for i in range(0, 12, 2))
    raise ApiError("invalid_mac", f"invalid MAC address: {value!r}", 422)
