from __future__ import annotations

import asyncio
import logging
from time import perf_counter

from starlette.middleware.base import BaseHTTPMiddleware

from app.core.context import get_request_context
from app.db.pool import db
from app.db.queries import execute

logger = logging.getLogger(__name__)


class AuditLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        started_at = perf_counter()
        response = None
        exc: Exception | None = None
        try:
            response = await call_next(request)
            return response
        except Exception as e:  # noqa: BLE001
            exc = e
            raise
        finally:
            duration_ms = int((perf_counter() - started_at) * 1000)
            asyncio.create_task(
                self._write_log(
                    request=request,
                    response=response,
                    duration_ms=duration_ms,
                    exc=exc,
                )
            )

    async def _write_log(self, *, request, response, duration_ms: int, exc: Exception | None):
        ctx = get_request_context()
        principal = getattr(request.state, "principal", None)
        status_code = response.status_code if response else 500
        content_length = response.headers.get("content-length") if response else None
        try:
            async with db.pool.connection() as conn:
                await execute(
                    conn,
                    """
                    INSERT INTO audit.api_request_log (
                        occurred_at, request_log_id, request_id, session_id, user_id, hospital_code,
                        client_ip, forwarded_for, http_method, request_path, query_string,
                        response_status, latency_ms, request_bytes, response_bytes,
                        app_node, load_balancer_id, trace_id, error_code
                    ) VALUES (
                        now(), gen_random_uuid(), %s, %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s
                    )
                    """,
                    (
                        str(ctx.request_id) if ctx else None,
                        str(principal.sid) if principal and getattr(principal, "sid", None) else None,
                        str(principal.sub) if principal and getattr(principal, "sub", None) else None,
                        principal.hospital_code if principal else None,
                        ctx.normalized_ip() if ctx else None,
                        ctx.forwarded_for if ctx else None,
                        request.method,
                        request.url.path,
                        request.url.query or None,
                        status_code,
                        duration_ms,
                        int(request.headers.get("content-length") or 0),
                        int(content_length or 0),
                        request.app.state.settings.app_node_name,
                        request.app.state.settings.app_load_balancer_id,
                        request.headers.get("x-trace-id"),
                        exc.__class__.__name__ if exc else None,
                    ),
                )
        except Exception as log_exc:  # noqa: BLE001
            logger.warning("failed_to_write_api_request_log", exc_info=log_exc)
