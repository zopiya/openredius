"""RBAC guard matrix (docs/08): exercised via test-only protected routes."""

from __future__ import annotations

from fastapi import Depends

from openredius.core.deps import require_role
from openredius.models import AdminRole
from tests.conftest import create_admin_user

OPERATOR_PASSWORD = "operator-password-1"
AUDITOR_PASSWORD = "auditor-password-1"


def _install_probe_routes(app) -> None:
    @app.post("/api/_probe/admin-only")
    async def admin_only(admin=Depends(require_role(AdminRole.ADMIN))):
        return {"role": admin.role.value}

    @app.post("/api/_probe/operator-plus")
    async def operator_plus(admin=Depends(require_role(AdminRole.ADMIN, AdminRole.OPERATOR))):
        return {"role": admin.role.value}


async def _login(client, username, password):
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_role_matrix(app, client):
    _install_probe_routes(app)
    await create_admin_user("op", OPERATOR_PASSWORD, AdminRole.OPERATOR)
    await create_admin_user("aud", AUDITOR_PASSWORD, AdminRole.AUDITOR)

    admin_headers = await _login(client, "admin", "bootstrap-password-1")
    op_headers = await _login(client, "op", OPERATOR_PASSWORD)
    aud_headers = await _login(client, "aud", AUDITOR_PASSWORD)

    # admin-only endpoint
    assert (await client.post("/api/_probe/admin-only", headers=admin_headers)).status_code == 200
    assert (await client.post("/api/_probe/admin-only", headers=op_headers)).status_code == 403
    assert (await client.post("/api/_probe/admin-only", headers=aud_headers)).status_code == 403

    # operator+ endpoint (auditor still excluded)
    assert (await client.post("/api/_probe/operator-plus", headers=op_headers)).status_code == 200
    assert (await client.post("/api/_probe/operator-plus", headers=aud_headers)).status_code == 403

    # no token → 401
    assert (await client.post("/api/_probe/admin-only")).status_code == 401
