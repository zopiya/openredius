"""JSON logging with per-request ``request_id`` and client IP context."""

from __future__ import annotations

import contextvars
import json
import logging
from datetime import UTC, datetime

request_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)
client_ip_var: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "client_ip", default=None
)


class JsonFormatter(logging.Formatter):
    """Single-line JSON log records; sensitive values never logged here."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        request_id = request_id_var.get()
        if request_id:
            payload["request_id"] = request_id
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    root.setLevel(level)
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root.handlers[:] = [handler]
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
