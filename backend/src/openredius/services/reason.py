"""Failure-reason classifier for auth logs & reports (docs/02 归类表).

FreeRADIUS unlang reject paths write ``Class = "reason=<key>"`` (docs/06); the
classifier checks Class first and falls back to Reply-Message matching, so
built-in FreeRADIUS rejects (no Class) still land in the right bucket.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from openredius.core.errors import ApiError

# key -> (Chinese label, badge tone); order doubles as documentation order.
REASON_CLASSES: dict[str, tuple[str, str]] = {
    "account-locked": ("账号锁定", "warn"),
    "account-disabled": ("账号已停用", "warn"),
    "cert-expired": ("证书过期", "danger"),
    "mac-unbound": ("MAC 未绑定", "warn"),
    "bad-password": ("密码错误", "danger"),
    "time-policy": ("时间策略拒绝", "info"),
    "non-compliant": ("终端不合规", "warn"),
}
OTHER_KEY = "other"
OTHER_LABEL = "其他"
OTHER_TONE = "muted"

# Reply-Message fallbacks (docs/02 identification rules). Own unlang messages
# are Chinese; FreeRADIUS built-ins are English — match both.
_MESSAGE_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("account-locked", re.compile(r"account\s+lock|账号.*锁定|已被锁定", re.I)),
    ("cert-expired", re.compile(r"certificate\s+expired|证书.*过期", re.I)),
    ("mac-unbound", re.compile(r"mac\s+not\s+bound|MAC.*未绑定", re.I)),
    ("bad-password", re.compile(r"wrong\s+password|密码错误|口令错误", re.I)),
    ("time-policy", re.compile(r"outside\s+allowed\s+time|时间.*策略|窗口", re.I)),
    ("non-compliant", re.compile(r"not\s+compliant|不合规", re.I)),
]

_CLASS_RE = re.compile(r"reason=([a-z-]+)", re.I)

# Filter inputs the API accepts -> canonical key.
_LABEL_TO_KEY = {label: key for key, (label, _) in REASON_CLASSES.items()}
_LABEL_TO_KEY[OTHER_LABEL] = OTHER_KEY


@dataclass(frozen=True, slots=True)
class Reason:
    key: str
    label: str
    tone: str


def classify_reason(class_value: str | None, reply_message: str | None = None) -> Reason:
    """Classify one auth-log row; accepts (02) rejects only by convention but
    works for any row (accept rows yield ``other``)."""
    if class_value:
        m = _CLASS_RE.search(class_value)
        if m and m.group(1) in REASON_CLASSES:
            label, tone = REASON_CLASSES[m.group(1)]
            return Reason(key=m.group(1), label=label, tone=tone)
    if reply_message:
        for key, pattern in _MESSAGE_PATTERNS:
            if pattern.search(reply_message):
                label, tone = REASON_CLASSES[key]
                return Reason(key=key, label=label, tone=tone)
    return Reason(key=OTHER_KEY, label=OTHER_LABEL, tone=OTHER_TONE)


def reason_key_from_param(value: str | None) -> str | None:
    """Normalize the ``reason=`` query param (key or Chinese label) to a key.

    Raises ``ApiError(422)`` for unknown values so a typo doesn't silently
    drop the filter (consistent with the other list filter params).
    """
    if not value:
        return None
    v = value.strip()
    if v in REASON_CLASSES or v == OTHER_KEY:
        return v
    key = _LABEL_TO_KEY.get(v)
    if key is None:
        raise ApiError("invalid_reason", f"unsupported reason filter: {value}", 422)
    return key
