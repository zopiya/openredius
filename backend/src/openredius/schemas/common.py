"""Shared DTO shapes (docs/03 envelope)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    size: int


class Affected(BaseModel):
    affected: int


class Detail(BaseModel):
    detail: dict[str, Any] | None = None
