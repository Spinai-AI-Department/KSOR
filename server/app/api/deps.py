from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, Request

from app.core.context import get_request_context
from app.core.encryption import crypto
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import AccessTokenClaims, jwt_manager
from app.db.queries import execute, fetch_one
from app.db.session import get_db


@dataclass(slots=True)
class AuthenticatedContext:
    conn: any
    principal: AccessTokenClaims
    request: Request


async def get_principal_from_request(request: Request) -> AccessTokenClaims | None:
    principal = getattr(request.state, "principal", None)
    if principal is not None:
        return principal
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    principal = jwt_manager.decode_token(token)
    request.state.principal = principal
    ctx = get_request_context()
    if ctx and principal.token_use == "access":
        ctx.user_id = principal.sub
        ctx.hospital_code = principal.hospital_code
        ctx.role_code = principal.role
        ctx.session_id = principal.sid
    return principal


async def require_auth(request: Request, conn=Depends(get_db)) -> AuthenticatedContext:
    principal = await get_principal_from_request(request)
    if principal is None or principal.token_use != "access":
        raise UnauthorizedError()

    row = await fetch_one(
        conn,
        """
        SELECT
            ua.user_id,
            ua.login_id,
            ua.full_name,
            ua.hospital_code,
            ua.role_code::text AS role_code,
            ua.is_active,
            ua.is_locked,
            s.session_id,
            s.revoked_at,
            s.expires_at
        FROM auth.auth_session s
        JOIN auth.user_account ua ON ua.user_id = s.user_id
        WHERE s.session_id = %s
          AND s.access_jti = %s
        """,
        (str(principal.sid), str(principal.jti)),
    )
    if not row:
        raise UnauthorizedError(message="세션이 유효하지 않습니다.", error_code="AUTH_SESSION_NOT_FOUND")
    if row["revoked_at"] is not None:
        raise UnauthorizedError(message="로그아웃된 세션입니다.", error_code="AUTH_SESSION_REVOKED")
    if not row["is_active"]:
        raise UnauthorizedError(message="비활성화된 계정입니다.", error_code="AUTH_INACTIVE")
    if row["is_locked"]:
        raise UnauthorizedError(message="잠긴 계정입니다.", error_code="AUTH_ACCOUNT_LOCKED")

    await execute(
        conn,
        """
        UPDATE auth.auth_session
           SET last_seen_at = now(),
               updated_at = now()
         WHERE session_id = %s
           AND (last_seen_at IS NULL OR last_seen_at < now() - make_interval(secs => %s))
        """,
        (str(principal.sid), request.app.state.settings.last_active_write_interval_seconds),
    )
    await execute(
        conn,
        """
        UPDATE auth.user_account
           SET last_active_at = now(),
               updated_at = now()
         WHERE user_id = %s
           AND (last_active_at IS NULL OR last_active_at < now() - make_interval(secs => %s))
        """,
        (str(principal.sub), request.app.state.settings.last_active_write_interval_seconds),
    )
    return AuthenticatedContext(conn=conn, principal=principal, request=request)


async def require_admin(ctx: Annotated[AuthenticatedContext, Depends(require_auth)]) -> AuthenticatedContext:
    if ctx.principal.role not in {"ADMIN", "STEERING"}:
        raise ForbiddenError()
    return ctx


async def require_pi_or_admin(ctx: Annotated[AuthenticatedContext, Depends(require_auth)]) -> AuthenticatedContext:
    if ctx.principal.role not in {"ADMIN", "STEERING", "PI"}:
        raise ForbiddenError(message="책임연구자 이상 권한이 필요합니다.")
    return ctx


async def require_survey_token(
    request: Request,
    x_survey_token: Annotated[str | None, Header(alias="X-Survey-Token")] = None,
):
    token = x_survey_token or request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token:
        raise UnauthorizedError(message="설문 인증이 필요합니다.", error_code="SURVEY_TOKEN_REQUIRED")
    claims = jwt_manager.decode_token(token)
    if claims.token_use != "survey":
        raise UnauthorizedError(message="설문 토큰이 아닙니다.", error_code="SURVEY_TOKEN_INVALID")
    return claims
