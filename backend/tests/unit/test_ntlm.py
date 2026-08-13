"""NTLM/MD4 unit tests — RFC 1320 and NT-hash known vectors."""

from openredius.core.ntlm import md4, ntlm_hash


def test_md4_known_vectors():
    # RFC 1320 appendix A test suite.
    assert md4(b"").hex() == "31d6cfe0d16ae931b73c59d7e0c089c0"
    assert md4(b"a").hex() == "bde52cb31de33e46245e05fbdbd6fb24"
    assert md4(b"abc").hex() == "a448017aaf21d8525fc10ae87aa6729d"
    assert md4(b"message digest").hex() == "d9130a8164549fe818874806e1c7014b"


def test_ntlm_hash_known_vectors():
    # NT hash = MD4(UTF-16LE(password)).
    assert ntlm_hash("") == "31d6cfe0d16ae931b73c59d7e0c089c0"
    assert ntlm_hash("password") == "8846f7eaee8fb117ad06bdd830b7586c"
