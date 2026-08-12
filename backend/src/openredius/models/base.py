"""Declarative base with a stable naming convention (Alembic-friendly)."""

from __future__ import annotations

from enum import StrEnum

from sqlalchemy import Enum, MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def enum_column(enum_cls: type[StrEnum], length: int) -> Enum:
    """Enum column persisting the enum *values* (docs/02 semantics, e.g.
    'active'/'laptop'/'eap-tls') instead of SQLAlchemy's default member names,
    so server-side SQL consumed by FreeRADIUS (docs/06) sees documented values.
    """
    return Enum(
        enum_cls,
        values_callable=lambda e: [member.value for member in e],
        native_enum=False,
        length=length,
    )
