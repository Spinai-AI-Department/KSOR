from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass
from ipaddress import ip_address
from typing import Optional
from uuid import UUID


@dataclass(slots=True)
class RequestContext:
    request_id: UUID
    client_ip: str | None
    forwarded_for: str | None
    user_agent: str | None
    path: str
    method: str
    node_name: str | None = None
    load_balancer_id: str | None = None
    user_id: UUID | None = None
    hospital_code: str | None = None
    role_code: str | None = None
    session_id: UUID | None = None

    def normalized_ip(self) -> str | None:
        if not self.client_ip:
            return None
        try:
            return str(ip_address(self.client_ip))
        except ValueError:
            return None


_request_context: ContextVar[Optional[RequestContext]] = ContextVar("request_context", default=None)


def set_request_context(ctx: RequestContext):
    return _request_context.set(ctx)


def get_request_context() -> RequestContext | None:
    return _request_context.get()


def reset_request_context(token) -> None:
    _request_context.reset(token)
