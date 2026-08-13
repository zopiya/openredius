"""CoA client unit tests: Disconnect vs CoA-Request code selection (docs/01, 04)."""

from __future__ import annotations

import pyrad.packet

from openredius.radius import coa


async def test_reauthorize_sends_coa_request(monkeypatch):
    captured: dict[str, int] = {}

    def fake_send(
        host, port, secret, username, acct_session_id, calling_station_id, timeout_s, code
    ):
        captured["code"] = code
        return coa.CoaOutcome(status="ack")

    monkeypatch.setattr(coa, "_send_packet_sync", fake_send)
    outcome = await coa.reauthorize_session("1.2.3.4", 3799, "s", "u", "sid")
    assert outcome.status == "ack"
    assert captured["code"] == pyrad.packet.CoARequest


async def test_disconnect_sends_disconnect_request(monkeypatch):
    captured: dict[str, int] = {}

    def fake_send(
        host, port, secret, username, acct_session_id, calling_station_id, timeout_s, code
    ):
        captured["code"] = code
        return coa.CoaOutcome(status="ack")

    monkeypatch.setattr(coa, "_send_packet_sync", fake_send)
    await coa.disconnect_session("1.2.3.4", 3799, "s", "u", "sid")
    assert captured["code"] == pyrad.packet.DisconnectRequest
