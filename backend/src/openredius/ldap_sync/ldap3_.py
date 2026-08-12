"""ldap3 connector — production AD implementation."""

from __future__ import annotations

from datetime import datetime

from ldap3 import ALL, Connection, Server

from openredius.ldap_sync.connector import AdConnector, AdConnectorCtor, AdUserEntry


def _safe_str(value) -> str:
    """Extract string from ldap3 attribute, tolerant of None / missing."""
    try:
        return str(value.value) if value is not None and value.value else ""
    except Exception:
        return ""


def _safe_uac(entry) -> int:
    try:
        return int(entry.userAccountControl.value or 0)
    except Exception:
        return 0


def _parse_when_changed(entry) -> datetime | None:
    """Parse ldap3 whenChanged string → naïve UTC datetime."""
    try:
        wc = entry.whenChanged.value if hasattr(entry, "whenChanged") else None
        if wc:
            return datetime.strptime(str(wc), "%Y%m%d%H%M%S.0Z")
    except (ValueError, AttributeError):
        return None
    return None


class Ldap3Connector(AdConnector):
    """Real AD connector using ldap3 synchronous API, called via ``anyio.to_thread``.

    The caller is responsible for running ``fetch()`` off the event-loop
    thread (see ``api/users.py`` for the pattern).
    """

    def __init__(self, url: str, bind_dn: str, bind_pw: str) -> None:
        self._url = url
        self._bind_dn = bind_dn
        self._bind_pw = bind_pw
        self._conn: Connection | None = None

    async def fetch(self, base_dn: str, search_filter: str) -> list[AdUserEntry]:
        import anyio

        return await anyio.to_thread.run_sync(self._fetch_sync, base_dn, search_filter)

    def _fetch_sync(self, base_dn: str, search_filter: str) -> list[AdUserEntry]:
        if self._conn is None:
            server = Server(self._url, get_info=ALL)
            self._conn = Connection(
                server,
                user=self._bind_dn,
                password=self._bind_pw,
                auto_bind=True,
            )
        self._conn.search(
            search_base=base_dn,
            search_filter=search_filter,
            attributes=[
                "sAMAccountName",
                "displayName",
                "department",
                "title",
                "distinguishedName",
                "whenChanged",
                "userAccountControl",
            ],
        )
        entries: list[AdUserEntry] = []
        for entry in self._conn.entries:
            entries.append(
                AdUserEntry(
                    sAMAccountName=_safe_str(entry.sAMAccountName),
                    displayName=_safe_str(entry.displayName),
                    department=_safe_str(entry.department),
                    title=_safe_str(entry.title),
                    distinguishedName=_safe_str(entry.distinguishedName),
                    whenChanged=_parse_when_changed(entry),
                    disabled=bool(_safe_uac(entry) & 0x2),
                )
            )
        return entries

    async def close(self) -> None:
        if self._conn:
            import anyio

            await anyio.to_thread.run_sync(self._conn.unbind)
            self._conn = None


class Ldap3ConnectorCtor(AdConnectorCtor):
    """Factory that produces ``Ldap3Connector`` instances."""

    async def __call__(self, url: str, bind_dn: str, bind_pw: str) -> AdConnector:
        return Ldap3Connector(url, bind_dn, bind_pw)
