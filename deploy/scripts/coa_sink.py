#!/usr/bin/env python3
"""Fake-NAS CoA/Disconnect sink (docs/06, 09 场景 13).

Listens for RFC 5176 Disconnect/CoA-Request on a UDP port and replies
Disconnect-ACK (or NAK with ``--nak``), logging each received packet as one
JSON line so tests can assert on it without real hardware.

    python coa_sink.py --port 3799 --secret testing123 --log /tmp/coa.jsonl

Self-contained: ships a minimal RADIUS dictionary inline so it runs without
the backend package installed (pyrad is the only dependency).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile

import pyrad.packet
import pyrad.server

_DICTIONARY = """\
ATTRIBUTE\tUser-Name\t\t1\tstring
ATTRIBUTE\tUser-Password\t\t2\tstring
ATTRIBUTE\tNAS-IP-Address\t\t4\tipaddr
ATTRIBUTE\tNAS-Port\t\t5\tinteger
ATTRIBUTE\tCalled-Station-Id\t30\tstring
ATTRIBUTE\tCalling-Station-Id\t31\tstring
ATTRIBUTE\tAcct-Session-Id\t\t44\tstring
ATTRIBUTE\tMessage-Authenticator\t80\toctets
ATTRIBUTE\tError-Cause\t\t101\tinteger
ATTRIBUTE\tReply-Message\t\t18\tstring
"""


def _write_dictionary() -> str:
    fd, path = tempfile.mkstemp(prefix="openredius-coa-", suffix=".dict")
    with os.fdopen(fd, "w") as fh:
        fh.write(_DICTIONARY)
    return path


class SinkServer(pyrad.server.Server):
    def __init__(self, *args, log_path: str | None, nak: bool, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.log_path = log_path
        self.nak = nak

    def _record(self, pkt: pyrad.packet.Packet, kind: str) -> None:
        if not self.log_path:
            return
        entry = {
            "kind": kind,
            "source": pkt.source[0],
            "attrs": {
                key: list(pkt[key]) for key in pkt.keys() if isinstance(key, str)
            },
        }
        with open(self.log_path, "a") as fh:
            fh.write(json.dumps(entry, default=str) + "\n")

    def HandleDisconnectPacket(self, pkt: pyrad.packet.Packet) -> None:
        self._record(pkt, "disconnect")
        reply = pkt.CreateReply()
        if self.nak:
            reply.code = pyrad.packet.DisconnectNAK
            reply["Error-Cause"] = 405  # session-context-not-found
        else:
            reply.code = pyrad.packet.DisconnectACK
        self._reply(pkt, reply)

    def HandleCoaPacket(self, pkt: pyrad.packet.Packet) -> None:
        self._record(pkt, "coa")
        reply = pkt.CreateReply()
        reply.code = pyrad.packet.CoANAK if self.nak else pyrad.packet.CoAACK
        self._reply(pkt, reply)

    def _reply(self, request: pyrad.packet.Packet, reply: pyrad.packet.Packet) -> None:
        # SendReplyPacket addresses the reply via its own .source/.fd.
        reply.source = request.source
        reply.fd = request.fd
        self.SendReplyPacket(request.fd, reply)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3799)
    parser.add_argument("--secret", default="testing123")
    parser.add_argument("--log", default=None, help="JSONL file for received packets")
    parser.add_argument("--nak", action="store_true", help="reply NAK instead of ACK")
    args = parser.parse_args()

    import pyrad.dictionary

    dictionary = pyrad.dictionary.Dictionary(_write_dictionary())
    hosts = {
        "0.0.0.0": pyrad.server.RemoteHost("0.0.0.0", args.secret.encode(), "any")
    }
    server = SinkServer(
        addresses=["0.0.0.0"],
        coaport=args.port,
        hosts=hosts,
        dict=dictionary,
        auth_enabled=False,
        acct_enabled=False,
        coa_enabled=True,
        log_path=args.log,
        nak=args.nak,
    )
    print(f"coa_sink listening on udp/{args.port} (nak={args.nak})", flush=True)
    server.Run()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
