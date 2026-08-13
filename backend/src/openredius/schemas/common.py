"""Shared DTO shapes (docs/03 envelope)."""

from __future__ import annotations

from pydantic import BaseModel


class Affected(BaseModel):
    affected: int
