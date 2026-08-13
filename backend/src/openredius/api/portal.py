"""Visitor portal / self-service namespace (docs/01「扩展性留白」).

Reserved, not implemented: guest self-registration and self-service password
reset live here later. Every route returns 501 so the namespace is visible in
OpenAPI and callers get an explicit "not implemented" instead of a 404.
"""

from __future__ import annotations

from fastapi import APIRouter

from openredius.core.errors import ApiError

router = APIRouter()

_MESSAGE = "portal namespace is reserved (docs/01); not implemented"


async def _portal_root() -> None:
    raise ApiError("not_implemented", _MESSAGE, 501)


async def _portal_catch_all(path: str) -> None:
    raise ApiError("not_implemented", _MESSAGE, 501)


router.add_api_route("", _portal_root, methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
router.add_api_route(
    "/{path:path}", _portal_catch_all, methods=["GET", "POST", "PUT", "PATCH", "DELETE"]
)
