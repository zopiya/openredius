"""MAC normalization (docs/02 命名约定, docs/06 norm_mac semantics)."""

from __future__ import annotations

import re

from openredius.core.errors import ApiError

_HEX_PAIRS = re.compile(r"^([0-9A-Fa-f]{2}[:-]?){5}[0-9A-Fa-f]{2}$")


def normalize_mac(value: str) -> str:
    """Uppercase, colon-separated. Accepts `-`/`.` separators and bare form."""
    compact = value.strip().upper().replace("-", ":").replace(".", ":")
    if ":" not in compact and len(compact) == 12 and compact.isalnum():
        compact = ":".join(compact[i : i + 2] for i in range(0, 12, 2))
    if not _HEX_PAIRS.fullmatch(compact):
        raise ApiError("invalid_mac", f"invalid MAC address: {value!r}", 422)
    return compact
