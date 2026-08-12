"""HTTP routers mounted under /api."""

from fastapi import APIRouter

from openredius.api.auth import router as auth_router
from openredius.api.ops import router as ops_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(ops_router, tags=["ops"])
