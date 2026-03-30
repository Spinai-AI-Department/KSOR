from __future__ import annotations

import logging
from time import perf_counter
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core.context import RequestContext, reset_request_context, set_request_context

logger = logging.getLogger(__name__)


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = uuid4()
        client_ip = None
        forwarded_for = request.headers.get("x-forwarded-for")
        if settings.trust_x_forwarded_for and forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()
        elif request.client:
            client_ip = request.client.host

        ctx = RequestContext(
            request_id=request_id,
            client_ip=client_ip,
            forwarded_for=forwarded_for,
            user_agent=request.headers.get("user-agent"),
            method=request.method,
            path=request.url.path,
            node_name=settings.app_node_name,
            load_balancer_id=settings.app_load_balancer_id,
        )
        token = set_request_context(ctx)
        request.state.request_id = request_id
        request.state.request_started_at = perf_counter()

        try:
            response = await call_next(request)
        finally:
            reset_request_context(token)

        response.headers["X-Request-ID"] = str(request_id)
        return response
