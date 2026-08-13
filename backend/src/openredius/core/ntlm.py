"""NTLM hash (MD4) for radcheck ``NT-Password`` comparison (docs/08).

FreeRADIUS ``NT-Password`` stores the NT one-way hash = MD4(password as
UTF-16LE). Python's OpenSSL 3.0 build exposes no ``md4`` via hashlib, so this
module carries a self-contained RFC 1320 MD4 — used only for credential
comparison against an already-stored hash, never as a fresh security primitive.
"""

from __future__ import annotations

import struct

_F = lambda x, y, z: (x & y) | (~x & z)  # noqa: E731
_G = lambda x, y, z: (x & y) | (x & z) | (y & z)  # noqa: E731
_H = lambda x, y, z: x ^ y ^ z  # noqa: E731

# (message-index, rotate) per RFC 1320 round.
_R1 = [(i, (3, 7, 11, 19)[i % 4]) for i in range(16)]
_R2 = [
    (k, (3, 5, 9, 13)[i % 4])
    for i, k in enumerate([0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15])
]
_R3 = [
    (k, (3, 9, 11, 15)[i % 4])
    for i, k in enumerate([0, 8, 4, 12, 2, 10, 6, 14, 1, 9, 5, 13, 3, 11, 7, 15])
]


def _rol(x: int, n: int) -> int:
    return ((x << n) | (x >> (32 - n))) & 0xFFFFFFFF


def _round(
    a: int, b: int, c: int, d: int, x: list[int], func, steps, const: int
) -> tuple[int, int, int, int]:
    for k, s in steps:
        a = _rol((a + func(b, c, d) + x[k] + const) & 0xFFFFFFFF, s)
        a, b, c, d = d, a, b, c
    return a, b, c, d


def md4(data: bytes) -> bytes:
    """RFC 1320 MD4 digest (16 bytes)."""
    msg = data + b"\x80"
    msg += b"\x00" * ((56 - len(msg) % 64) % 64)
    msg += struct.pack("<Q", (len(data) * 8) & 0xFFFFFFFFFFFFFFFF)

    a, b, c, d = 0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476
    for off in range(0, len(msg), 64):
        x = list(struct.unpack("<16I", msg[off : off + 64]))
        aa, bb, cc, dd = a, b, c, d
        a, b, c, d = _round(a, b, c, d, x, _F, _R1, 0x00000000)
        a, b, c, d = _round(a, b, c, d, x, _G, _R2, 0x5A827999)
        a, b, c, d = _round(a, b, c, d, x, _H, _R3, 0x6ED9EBA1)
        a = (a + aa) & 0xFFFFFFFF
        b = (b + bb) & 0xFFFFFFFF
        c = (c + cc) & 0xFFFFFFFF
        d = (d + dd) & 0xFFFFFFFF
    return struct.pack("<4I", a, b, c, d)


def ntlm_hash(password: str) -> str:
    """NT one-way hash (hex) used by FreeRADIUS ``NT-Password``."""
    return md4(password.encode("utf-16-le")).hex()
