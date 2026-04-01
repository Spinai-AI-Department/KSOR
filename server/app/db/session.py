from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Request

from app.core.context import get_request_context
from app.core.security import jwt_manager
from app.db.pool import db


async def set_app_context(conn, request: Request) -> None:
    ctx = get_request_context()
    principal = getattr(request.state, "principal", None)
    user_id = str(principal.sub) if principal and principal.token_use == "access" else None
    hospital_code = principal.hospital_code if principal and principal.token_use == "access" else None
    role = principal.role if principal and principal.token_use == "access" else None
    request_id = str(ctx.request_id) if ctx else None
    client_ip = ctx.normalized_ip() if ctx else None

    stmt_timeout = int(request.app.state.settings.db_statement_timeout_ms)
    idle_timeout = int(request.app.state.settings.db_idle_in_transaction_timeout_ms)

    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT app_private.set_context(%s, %s, %s, %s, %s, true)",
            (user_id, hospital_code, role, request_id, client_ip),
        )
        await cur.execute(f"SET LOCAL statement_timeout = {stmt_timeout}")
        await cur.execute(f"SET LOCAL idle_in_transaction_session_timeout = {idle_timeout}")


async def clear_app_context(conn) -> None:
    async with conn.cursor() as cur:
        await cur.execute("SELECT app_private.clear_context(true)")


async def get_db_auth(request: Request) -> AsyncIterator:
    """DB dependency for unauthenticated auth routes (login, refresh, reset-password).

    Sets app.role = 'SYSTEM' so that RLS policies on auth.user_account and
    auth.auth_session allow the necessary SELECT/INSERT/UPDATE operations
    without a real authenticated principal.
    """
    async with db.pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT app_private.set_context(%s, %s, %s, %s, %s, true)",
                (None, None, "SYSTEM", None, None),
            )
        try:
            yield conn
        finally:
            try:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT app_private.clear_context(true)")
            except Exception:
                pass


async def get_db(request: Request) -> AsyncIterator:
    if not hasattr(request.state, "principal"):
        token = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        if token:
            try:
                request.state.principal = jwt_manager.decode_token(token)
            except Exception:
                request.state.principal = None
        else:
            request.state.principal = None

    async with db.pool.connection() as conn:
        await set_app_context(conn, request)
        try:
            yield conn
        finally:
            try:
                await clear_app_context(conn)
            except Exception:
                pass
