"""ldap3 connector normalisation tests (docs/15 C-003 mobile fallback)."""

from __future__ import annotations

import pytest

from openredius.ldap_sync.ldap3_ import Ldap3Connector


class _FakeAttr:
    def __init__(self, value):
        self.value = value


class _FakeEntry:
    def __init__(self, **attrs: str):
        for name, value in attrs.items():
            setattr(self, name, _FakeAttr(value))

    def __getattr__(self, name):
        # ldap3 Entry returns None for unrequested/missing attributes.
        return None


class _FakeConn:
    def __init__(self, entries):
        self._entries = entries
        self.searched_attributes: list[str] = []

    @property
    def entries(self):
        return self._entries

    def search(self, search_base, search_filter, attributes):  # noqa: ARG002
        self.searched_attributes = attributes


def _fetch(connector: Ldap3Connector, entries) -> list:
    connector._conn = _FakeConn(entries)
    return connector._fetch_sync("DC=contoso,DC=com", "(objectClass=user)")


def test_mobile_preferred_over_telephone():
    connector = Ldap3Connector("ldap://dc", "cn=svc", "pw")
    [entry] = _fetch(
        connector,
        [_FakeEntry(sAMAccountName="u1", mobile="13800001111", telephoneNumber="010-1234")],
    )
    assert entry.mobile == "13800001111"


def test_mobile_falls_back_to_telephone():
    connector = Ldap3Connector("ldap://dc", "cn=svc", "pw")
    [entry] = _fetch(
        connector,
        [_FakeEntry(sAMAccountName="u1", mobile="", telephoneNumber="010-1234")],
    )
    assert entry.mobile == "010-1234"


def test_mobile_empty_when_both_missing():
    connector = Ldap3Connector("ldap://dc", "cn=svc", "pw")
    [entry] = _fetch(connector, [_FakeEntry(sAMAccountName="u1")])
    assert entry.mobile == ""


def test_mail_description_synced():
    connector = Ldap3Connector("ldap://dc", "cn=svc", "pw")
    [entry] = _fetch(
        connector,
        [_FakeEntry(sAMAccountName="u1", mail="u1@contoso.com", description="驻场")],
    )
    assert entry.mail == "u1@contoso.com"
    assert entry.description == "驻场"


@pytest.mark.parametrize("uac", ["512", "514"])
def test_disabled_flag_and_requested_attributes(uac):
    connector = Ldap3Connector("ldap://dc", "cn=svc", "pw")
    conn = _FakeConn([_FakeEntry(sAMAccountName="u1", userAccountControl=uac)])
    connector._conn = conn
    entries = connector._fetch_sync("DC=contoso,DC=com", "(objectClass=user)")
    assert entries[0].disabled == (int(uac) & 0x2 != 0)
    assert "mail" in conn.searched_attributes
    assert "mobile" in conn.searched_attributes
    assert "telephoneNumber" in conn.searched_attributes
    assert "description" in conn.searched_attributes
