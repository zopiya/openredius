"""Stack scenarios 12–13 (docs/09): accounting rows + CoA disconnect via sink."""

from __future__ import annotations

import subprocess
import sys
import time
import uuid

import pytest
from httpx import AsyncClient

from openredius.core.config import Settings
from tests.integration.conftest import (
    REPO_ROOT,
    acctclient,
    pg_execute,
    pg_rows,
)

pytestmark = pytest.mark.integration

SINK_SCRIPT = REPO_ROOT / "deploy" / "scripts" / "coa_sink.py"
COA_PORT = 3799
COA_SECRET = "testing123-coa"


# --- scenario 12: Accounting-Start/Stop → radacct ---------------------------


async def test_accounting_start_stop_rows() -> None:
    session_id = f"IT-{uuid.uuid4().hex[:12]}"
    acct_attrs = {
        "User-Name": "li.na",
        "Acct-Session-Id": session_id,
        "NAS-IP-Address": "10.99.0.11",
        "NAS-Port": "12",
        "NAS-Port-Type": "Ethernet",
        "Calling-Station-Id": "3C:52:82:1A:4B:01",
        "Called-Station-Id": "SW-3F-01",
        "Framed-IP-Address": "10.20.3.99",
        "Acct-Status-Type": "Start",
        "Acct-Session-Time": "0",
        "Acct-Authentic": "RADIUS",
        "Service-Type": "Framed-User",
    }
    start_out = acctclient(dict(acct_attrs))
    assert "Invalid" not in start_out, start_out

    rows = await pg_rows(
        "SELECT acctstoptime FROM radius.radacct WHERE acctsessionid = :sid",
        {"sid": session_id},
    )
    assert rows, f"Start did not create a radacct row: {start_out}"
    assert rows[0][0] is None, "fresh session must have acctstoptime NULL"

    stop_attrs = dict(acct_attrs, **{"Acct-Status-Type": "Stop", "Acct-Session-Time": "60"})
    stop_out = acctclient(stop_attrs)
    assert "Invalid" not in stop_out, stop_out

    rows = await pg_rows(
        "SELECT acctstoptime, acctterminatecause FROM radius.radacct WHERE acctsessionid = :sid",
        {"sid": session_id},
    )
    assert rows[0][0] is not None, f"Stop did not close the session: {stop_out}"


# --- scenario 13: CoA sink receives Disconnect, radacct closed ---------------


@pytest.fixture
def coa_sink(tmp_path):
    log_file = tmp_path / "coa.jsonl"
    proc = subprocess.Popen(
        [
            sys.executable,
            str(SINK_SCRIPT),
            "--port",
            str(COA_PORT),
            "--secret",
            COA_SECRET,
            "--log",
            str(log_file),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    # Give the listener a moment to bind; fail fast if it exits.
    deadline = time.time() + 10
    while time.time() < deadline:
        if proc.poll() is not None:
            out = proc.stdout.read().decode() if proc.stdout else ""
            raise RuntimeError(f"coa_sink exited early:\n{out}")
        time.sleep(0.5)
        if log_file.parent.exists():
            break
    time.sleep(1.0)
    yield log_file
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


@pytest.fixture
def coa_settings(settings: Settings) -> Settings:
    return settings.model_copy(update={"radius_coa_port": COA_PORT, "radius_coa_close_poll_s": 1.0})


async def _seed_coa_session(nas_ip: str, session_id: str, account: str = "li.na") -> str:
    unique = f"U-{uuid.uuid4().hex[:12]}"
    await pg_execute(
        """
        INSERT INTO radius.radacct (
            acctsessionid, acctuniqueid, username, nasipaddress, nasportid,
            nasporttype, acctstarttime, acctupdatetime, callingstationid,
            calledstationid, acctterminatecause, servicetype, framedipaddress
        ) VALUES (
            :sid, :uid, :user, CAST(:nas AS inet), 'Gi1/0/9', 'Ethernet', now(), now(),
            '3C:52:82:1A:4B:01', 'SW-3F-01', '', 'Framed-User', '10.20.3.77'
        )
        """,
        {"sid": session_id, "uid": unique, "user": account, "nas": nas_ip},
    )
    return unique


async def test_disconnect_via_coa_sink(
    client: AsyncClient, admin_headers, coa_settings, coa_sink
) -> None:
    """Backend → fake NAS (sink): Disconnect-Request received, session closed."""
    from asgi_lifespan import LifespanManager
    from httpx import ASGITransport

    from openredius.core.db import close_db, init_db
    from openredius.main import create_app

    # App bound to the CoA-ported settings (module fixture app uses defaults).
    init_db(coa_settings.database_url)
    app = create_app(coa_settings)
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as coa_client:
            login = await coa_client.post(
                "/api/auth/login",
                json={"username": "admin", "password": "Admin-Dev-2026"},
            )
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

            # NAS device + a sink-bound active session.
            nas_ip = "127.0.0.2"  # loopback alias; 127.0.0.1 is the radtest client
            # Hermetic: drop leftovers from a failed previous run.
            await pg_execute("DELETE FROM public.nas_device WHERE name = 'COA-SINK-NAS'")
            await pg_execute("DELETE FROM radius.nas WHERE nasname = :ip", {"ip": nas_ip})
            created = await coa_client.post(
                "/api/devices/nas",
                headers=headers,
                json={
                    "name": "COA-SINK-NAS",
                    "nasname": nas_ip,
                    "type": "switch",
                    "area": "lab",
                    "secret": COA_SECRET,
                },
            )
            assert created.status_code in {201, 409}, created.text
            session_id = f"COA-{uuid.uuid4().hex[:10]}"
            unique = await _seed_coa_session(nas_ip, session_id)

            resp = await coa_client.post(
                "/api/sessions/disconnect",
                headers=headers,
                json={"session_ids": [unique], "confirm": True},
            )
            assert resp.status_code == 200, resp.text
            body = resp.json()
            assert body["disconnected"] == 1, body
            assert body["failed"] == []

    await close_db()

    # Sink actually received the Disconnect-Request with matching attributes.
    import json

    lines = [json.loads(line) for line in coa_sink.read_text().splitlines() if line.strip()]
    disconnects = [entry for entry in lines if entry["kind"] == "disconnect"]
    assert disconnects, "sink received no Disconnect-Request"
    attrs = disconnects[-1]["attrs"]
    assert attrs["User-Name"] == ["li.na"]
    assert attrs["Acct-Session-Id"] == [session_id]

    # Fallback close applied (the fake NAS never sends Accounting-Stop).
    rows = await pg_rows(
        "SELECT acctstoptime, acctterminatecause, connectinfo_stop "
        "FROM radius.radacct WHERE acctuniqueid = :uid",
        {"uid": unique},
    )
    assert rows[0][0] is not None
    assert rows[0][1] == "Admin-Reset"
    assert rows[0][2] == "backend-closed"

    # Cleanup: remove the session + lab NAS so reruns stay hermetic.
    await pg_execute("DELETE FROM radius.radacct WHERE acctuniqueid = :uid", {"uid": unique})
    await pg_execute("DELETE FROM radius.nas WHERE nasname = :ip", {"ip": nas_ip})
    await pg_execute("DELETE FROM public.nas_device WHERE name = 'COA-SINK-NAS'")
