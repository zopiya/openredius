"""FastAPI application factory + uvicorn entry point (docs/04)."""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from sqlalchemy import func, select
from starlette.middleware.cors import CORSMiddleware

from openredius import __version__
from openredius.api import api_router
from openredius.core.config import Settings, get_settings
from openredius.core.db import close_db, get_session_factory, init_db
from openredius.core.errors import register_exception_handlers
from openredius.core.logging import client_ip_var, request_id_var, setup_logging
from openredius.core.ratelimit import (
    LOGIN_RATE_LIMIT,
    LOGIN_RATE_WINDOW_SECONDS,
    SlidingWindowRateLimiter,
)
from openredius.jobs.scheduler import build_scheduler
from openredius.models import AdminUser
from openredius.services.bootstrap import bootstrap_admin

logger = logging.getLogger("openredius")

_DEV_CORS_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings: Settings = app.state.settings
    app.state.started_at = time.monotonic()
    init_db(settings.database_url)
    async with get_session_factory()() as session:
        await bootstrap_admin(session, settings)
        admin_count = await session.scalar(select(func.count()).select_from(AdminUser))
    if admin_count == 0:
        message = (
            "no admin accounts exist; set OPENRADIUS_BOOTSTRAP_ADMIN_USER/_PASSWORD "
            "or run scripts/create_admin.py"
        )
        if settings.is_prod:
            raise RuntimeError(message)
        logger.warning(message)
    scheduler = build_scheduler(settings)
    if scheduler is not None:
        scheduler.start()
        logger.info("background jobs started")
    logger.info("openredius backend started env=%s", settings.env)
    try:
        yield
    finally:
        if scheduler is not None:
            scheduler.shutdown(wait=False)
        await close_db()


def create_app(settings: Settings | None = None) -> FastAPI:
    setup_logging()
    settings = settings or get_settings()
    settings.validate_for_env()

    app = FastAPI(
        title="OpenRedius",
        version=__version__,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.login_rate_limiter = SlidingWindowRateLimiter(
        limit=LOGIN_RATE_LIMIT, window_seconds=LOGIN_RATE_WINDOW_SECONDS
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request_id_var.set(request_id)
        client_ip_var.set(request.client.host if request.client else None)
        try:
            response = await call_next(request)
        finally:
            request_id_var.set(None)
            client_ip_var.set(None)
        response.headers["X-Request-ID"] = request_id
        return response

    if not settings.is_prod:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=_DEV_CORS_ORIGINS,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    elif settings.cors_origins:
        # Prod: restrictive CORS only when explicitly configured.
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type"],
        )

    register_exception_handlers(app)
    app.include_router(api_router, prefix="/api")
    return app


app = create_app()
