from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone

from app.core.context import get_request_context
from app.core.config import settings


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ctx = get_request_context()
        payload = {
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": ctx.request_id if ctx else None,
            "client_ip": str(ctx.client_ip) if ctx and ctx.client_ip else None,
            "user_id": str(ctx.user_id) if ctx and ctx.user_id else None,
            "hospital_code": ctx.hospital_code if ctx else None,
            "node": settings.app_node_name,
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


_configured = False


def configure_logging() -> None:
    global _configured
    if _configured:
        return

    root = logging.getLogger()
    root.setLevel(logging.INFO)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.handlers[:] = [handler]

    for noisy in ("uvicorn.access",):
        logging.getLogger(noisy).propagate = True

    _configured = True
