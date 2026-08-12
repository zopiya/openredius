"""AD/LDAP connector — abstract base for fixture-driven testing (docs/04).

Production uses ldap3; tests inject a mock connector that returns pre-canned
entries without touching a real directory.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol


@dataclass
class AdUserEntry:
    """Normalised AD user record returned by a connector."""

    sAMAccountName: str
    displayName: str = ""
    department: str = ""
    title: str = ""
    distinguishedName: str = ""
    whenChanged: datetime | None = None
    # True when the directory marks the account as disabled (UAC 0x2).
    disabled: bool = False


class AdConnector(ABC):
    """Pluggable AD/LDAP backend.

    The ``_fetch`` hook is the only required method; subclasses may also
    override ``close()`` for cleanup.
    """

    @abstractmethod
    async def fetch(self, base_dn: str, search_filter: str) -> list[AdUserEntry]:
        """Run an LDAP search; return normalised entries."""

    async def close(self) -> None:  # noqa: B027
        """Release resources (connection, pool, etc.)."""


class AdConnectorCtor(Protocol):
    """Callable that produces an ``AdConnector``, taking settings for auth."""

    async def __call__(self, url: str, bind_dn: str, bind_pw: str) -> AdConnector: ...
