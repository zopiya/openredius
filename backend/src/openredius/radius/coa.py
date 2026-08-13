"""CoA / Disconnect client (RFC 5176, docs/04 CoA 客户端).

pyrad is synchronous, so every send runs in a worker thread. One retry on
timeout; NAK carries the RFC 5176 Error-Cause when present.
"""

from __future__ import annotations

import dataclasses
from importlib import resources
from pathlib import Path

import pyrad.client
import pyrad.dictionary
import pyrad.packet
from anyio import to_thread

_DICT_PATH = Path(resources.files("openredius.radius") / "radius.dict")
_dictionary: pyrad.dictionary.Dictionary | None = None

# RFC 5176 §2.6 — the causes a NAS actually returns for disconnects.
ERROR_CAUSES: dict[int, str] = {
    401: "unsupported-attribute",
    402: "missing-attribute",
    403: "nas-identification-mismatch",
    404: "invalid-request",
    405: "session-context-not-found",
    406: "session-context-not-removable",
    407: "other-proxy-processing-error",
    501: "administratively-prohibited",
    502: "request-not-routable",
    506: "administrative-prohibited",
}


@dataclasses.dataclass(frozen=True, slots=True)
class CoaOutcome:
    status: str  # ack / nak / timeout / error
    error_cause: str | None = None


def _dictionary_instance() -> pyrad.dictionary.Dictionary:
    global _dictionary
    if _dictionary is None:
        _dictionary = pyrad.dictionary.Dictionary(str(_DICT_PATH))
    return _dictionary


def _send_packet_sync(
    host: str,
    port: int,
    secret: str,
    username: str,
    acct_session_id: str,
    calling_station_id: str | None,
    timeout_s: float,
    code: int,
) -> CoaOutcome:
    client = pyrad.client.Client(
        server=host,
        coaport=port,
        secret=secret.encode(),
        dict=_dictionary_instance(),
        retries=1,
        timeout=timeout_s,
    )
    pkt = client.CreateCoAPacket(code=code)
    pkt["User-Name"] = username
    # CoA targets the NAS directly (backend → NAS, RFC 5176), independent of
    # which FreeRADIUS instance owns it. Multi-instance scaling lives in
    # radius.nas.server (docs/01「多 FreeRADIUS 实例」), not here.
    pkt["NAS-IP-Address"] = host
    pkt["Acct-Session-Id"] = acct_session_id
    if calling_station_id:
        pkt["Calling-Station-Id"] = calling_station_id

    try:
        reply = client.SendPacket(pkt)
    except pyrad.client.Timeout:
        return CoaOutcome(status="timeout")
    except (OSError, KeyError, ValueError) as exc:  # network/unreachable/bad attr
        return CoaOutcome(status="error", error_cause=str(exc)[:120])

    if reply.code in (pyrad.packet.DisconnectACK, pyrad.packet.CoAACK):
        return CoaOutcome(status="ack")

    cause = None
    if "Error-Cause" in reply:
        raw = int(reply["Error-Cause"][0])
        cause = ERROR_CAUSES.get(raw, f"code-{raw}")
    return CoaOutcome(status="nak", error_cause=cause)


async def _send_packet(
    host: str,
    port: int,
    secret: str,
    username: str,
    acct_session_id: str,
    calling_station_id: str | None,
    timeout_s: float,
    code: int,
) -> CoaOutcome:
    """Send one CoA-family packet; retry once on timeout (docs/04)."""
    outcome = await to_thread.run_sync(
        _send_packet_sync,
        host,
        port,
        secret,
        username,
        acct_session_id,
        calling_station_id,
        timeout_s,
        code,
    )
    if outcome.status == "timeout":
        outcome = await to_thread.run_sync(
            _send_packet_sync,
            host,
            port,
            secret,
            username,
            acct_session_id,
            calling_station_id,
            timeout_s,
            code,
        )
    return outcome


async def disconnect_session(
    host: str,
    port: int,
    secret: str,
    username: str,
    acct_session_id: str,
    calling_station_id: str | None = None,
    timeout_s: float = 3.0,
) -> CoaOutcome:
    """Send RFC 5176 Disconnect-Request (docs/04 CoA 客户端)."""
    return await _send_packet(
        host,
        port,
        secret,
        username,
        acct_session_id,
        calling_station_id,
        timeout_s,
        code=pyrad.packet.DisconnectRequest,
    )


async def reauthorize_session(
    host: str,
    port: int,
    secret: str,
    username: str,
    acct_session_id: str,
    calling_station_id: str | None = None,
    timeout_s: float = 3.0,
) -> CoaOutcome:
    """Send RFC 5176 CoA-Request to trigger re-authorization (docs/01 批量 CoA)."""
    return await _send_packet(
        host,
        port,
        secret,
        username,
        acct_session_id,
        calling_station_id,
        timeout_s,
        code=pyrad.packet.CoARequest,
    )
