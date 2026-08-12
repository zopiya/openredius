"""Server-side pagination & sorting (docs/03 list convention)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import Select, asc, desc

MAX_PAGE_SIZE = 500
DEFAULT_PAGE_SIZE = 50


class PageParams:
    def __init__(self, page: int = 1, size: int = DEFAULT_PAGE_SIZE) -> None:
        self.page = max(page, 1)
        self.size = min(max(size, 1), MAX_PAGE_SIZE)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.size


def apply_sort(
    stmt: Select,
    sort: str | None,
    columns: dict[str, Any],
    default: str,
) -> Select:
    """`sort=-created_at` → desc; `sort=name` → asc. Unknown fields → 422-free
    fallback to the default order (keeps list endpoints forgiving)."""
    raw = (sort or default).strip()
    descending = raw.startswith("-")
    field = raw.lstrip("-")
    column = columns.get(field, columns[default.lstrip("-")])
    return stmt.order_by(desc(column) if descending else asc(column))


def page_envelope(items: list[Any], total: int, params: PageParams) -> dict[str, Any]:
    return {"items": items, "total": total, "page": params.page, "size": params.size}
