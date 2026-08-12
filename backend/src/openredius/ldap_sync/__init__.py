"""AD/LDAP sync — fixture-driven design (docs/04)."""

from openredius.ldap_sync.connector import AdConnector, AdConnectorCtor, AdUserEntry
from openredius.ldap_sync.sync import run_ad_sync

__all__ = ["AdConnector", "AdConnectorCtor", "AdUserEntry", "run_ad_sync"]
