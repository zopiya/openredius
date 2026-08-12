"""HTTP routers mounted under /api."""

from fastapi import APIRouter

from openredius.api.admins import router as admins_router
from openredius.api.audit import router as audit_router
from openredius.api.auth import router as auth_router
from openredius.api.devices import router as devices_router
from openredius.api.ops import health_router
from openredius.api.ops import router as ops_router
from openredius.api.policies import router as policies_router
from openredius.api.settings import router as settings_router
from openredius.api.users import router as users_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(admins_router, prefix="/auth/admins", tags=["admins"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(policies_router, prefix="/policies", tags=["policies"])
api_router.include_router(devices_router, prefix="/devices", tags=["devices"])
api_router.include_router(settings_router, prefix="/settings", tags=["settings"])
api_router.include_router(audit_router, prefix="/audit", tags=["audit"])
api_router.include_router(health_router, tags=["ops"])
api_router.include_router(ops_router, prefix="/ops", tags=["ops"])
