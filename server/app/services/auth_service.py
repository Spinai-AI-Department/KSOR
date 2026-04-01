from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from psycopg import AsyncConnection

from app.core.config import settings
from app.core.context import get_request_context
from app.core.exceptions import AppError, ConflictError, NotFoundError, UnauthorizedError, ValidationError
from app.core.security import (
    generate_refresh_token,
    generate_temporary_password,
    hash_token,
    jwt_manager,
    password_manager,
)
from app.db.queries import execute, fetch_all, fetch_one, fetch_val
from app.models.auth import LoginRequest, LoginResponseData, MyProfileResponse, RefreshTokenRequest, RefreshTokenResponseData, UserInfo


async def _login_throttle_check(conn: AsyncConnection, login_id: str, client_ip: str | None) -> None:
    window = settings.login_throttle_window_seconds
    by_login = await fetch_val(
        conn,
        """
        SELECT count(*)
        FROM auth.login_event
        WHERE lower(login_id) = lower(%s)
          AND occurred_at >= now() - make_interval(secs => %s)
          AND success = false
        """,
        (login_id, window),
        default=0,
    )
    if by_login and int(by_login) >= settings.login_throttle_max_per_login_id:
        raise UnauthorizedError(
            message="로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
            error_code="AUTH_LOGIN_THROTTLED",
        )

    if client_ip:
        by_ip = await fetch_val(
            conn,
            """
            SELECT count(*)
            FROM auth.login_event
            WHERE client_ip = %s::inet
              AND occurred_at >= now() - make_interval(secs => %s)
              AND success = false
            """,
            (client_ip, window),
            default=0,
        )
        if by_ip and int(by_ip) >= settings.login_throttle_max_per_ip:
            raise UnauthorizedError(
                message="로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
                error_code="AUTH_IP_THROTTLED",
            )


async def login(conn: AsyncConnection, payload: LoginRequest) -> LoginResponseData:
    ctx = get_request_context()
    client_ip = ctx.normalized_ip() if ctx else None
    await _login_throttle_check(conn, payload.login_id, client_ip)

    snapshot = await fetch_one(
        conn,
        "SELECT * FROM auth.get_user_auth_snapshot(%s)",
        (payload.login_id,),
    )

    if not snapshot:
        await fetch_one(
            conn,
            "SELECT * FROM auth.record_login_attempt(%s, %s, %s, %s, %s, %s, %s, %s)",
            (
                payload.login_id,
                False,
                "AUTH_INVALID_CREDENTIALS",
                str(ctx.request_id) if ctx else None,
                client_ip,
                ctx.forwarded_for if ctx else None,
                ctx.user_agent if ctx else None,
                settings.app_node_name,
            ),
        )
        raise UnauthorizedError(message="아이디 또는 비밀번호가 일치하지 않습니다.", error_code="AUTH_INVALID_CREDENTIALS")

    if not snapshot["is_active"]:
        raise UnauthorizedError(message="비활성화된 계정입니다.", error_code="AUTH_INACTIVE")
    if snapshot["is_locked"]:
        raise UnauthorizedError(message="계정이 잠겨 있습니다. 관리자에게 문의하세요.", error_code="AUTH_ACCOUNT_LOCKED")

    is_valid = await password_manager.verify_password(
        snapshot["password_hash"],
        payload.password.get_secret_value(),
        snapshot["password_algo"],
    )
    if not is_valid:
        result = await fetch_one(
            conn,
            "SELECT * FROM auth.record_login_attempt(%s, %s, %s, %s, %s, %s, %s, %s)",
            (
                payload.login_id,
                False,
                "AUTH_INVALID_CREDENTIALS",
                str(ctx.request_id) if ctx else None,
                client_ip,
                ctx.forwarded_for if ctx else None,
                ctx.user_agent if ctx else None,
                settings.app_node_name,
            ),
        )
        attempts = result["failed_login_count"] if result else None
        max_attempts = settings.login_failure_lock_count
        raise AppError(
            message=f"아이디 또는 비밀번호가 일치하지 않습니다. (실패: {attempts}/{max_attempts})" if attempts else "아이디 또는 비밀번호가 일치하지 않습니다.",
            error_code="AUTH_INVALID_CREDENTIALS",
            status_code=401,
            data={"failed_attempts": attempts, "max_attempts": max_attempts} if attempts else None,
        )

    await fetch_one(
        conn,
        "SELECT * FROM auth.record_login_attempt(%s, %s, %s, %s, %s, %s, %s, %s)",
        (
            payload.login_id,
            True,
            None,
            str(ctx.request_id) if ctx else None,
            client_ip,
            ctx.forwarded_for if ctx else None,
            ctx.user_agent if ctx else None,
            settings.app_node_name,
        ),
    )

    if await password_manager.needs_rehash(snapshot["password_hash"], snapshot["password_algo"]):
        new_hash = await password_manager.hash_password(payload.password.get_secret_value())
        await execute(
            conn,
            """
            UPDATE auth.user_account
               SET password_hash = %s,
                   password_algo = 'argon2id',
                   last_password_changed_at = now(),
                   updated_at = now()
             WHERE user_id = %s
            """,
            (new_hash, str(snapshot["user_id"])),
        )

    refresh_token = generate_refresh_token()
    refresh_hash = hash_token(refresh_token)
    access_token, jti, access_expires_at = jwt_manager.create_access_token(
        user_id=snapshot["user_id"],
        login_id=snapshot["login_id"],
        role=str(snapshot["role_code"]),
        hospital_code=snapshot["hospital_code"],
        session_id=snapshot["user_id"],  # temporary, overwritten by DB session_id below
    )

    session_row = await fetch_one(
        conn,
        """
        INSERT INTO auth.auth_session (
            session_id, user_id, refresh_token_hash, access_jti, issued_at, last_seen_at,
            expires_at, client_ip, forwarded_for, user_agent, app_node, load_balancer_id,
            request_id, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), %s, %s, %s, now(), now(),
            %s, %s::inet, %s, %s, %s, %s,
            %s, now(), now()
        )
        RETURNING session_id
        """,
        (
            str(snapshot["user_id"]),
            refresh_hash,
            str(jti),
            datetime.now(tz=timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
            client_ip,
            ctx.forwarded_for if ctx else None,
            ctx.user_agent if ctx else None,
            settings.app_node_name,
            settings.app_load_balancer_id,
            str(ctx.request_id) if ctx else None,
        ),
    )
    session_id = session_row["session_id"]

    access_token, jti, access_expires_at = jwt_manager.create_access_token(
        user_id=snapshot["user_id"],
        login_id=snapshot["login_id"],
        role=str(snapshot["role_code"]),
        hospital_code=snapshot["hospital_code"],
        session_id=session_id,
        jti=jti,
    )
    await execute(
        conn,
        "UPDATE auth.auth_session SET access_jti = %s, updated_at = now() WHERE session_id = %s",
        (str(jti), str(session_id)),
    )

    return LoginResponseData(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.access_token_expire_minutes * 60,
        require_password_change=bool(snapshot["is_first_login"] or snapshot["password_reset_required"]),
        session_id=session_id,
        user_info=UserInfo(
            user_id=snapshot["user_id"],
            name=snapshot["full_name"],
            hospital_code=snapshot["hospital_code"],
            role=str(snapshot["role_code"]),
        ),
    )


async def refresh_token(conn: AsyncConnection, payload: RefreshTokenRequest) -> RefreshTokenResponseData:
    refresh_hash = hash_token(payload.refresh_token.get_secret_value())
    row = await fetch_one(
        conn,
        """
        SELECT
            s.session_id,
            s.user_id,
            s.expires_at,
            s.revoked_at,
            ua.login_id,
            ua.role_code::text AS role_code,
            ua.hospital_code,
            ua.is_active,
            ua.is_locked
        FROM auth.auth_session s
        JOIN auth.user_account ua ON ua.user_id = s.user_id
        WHERE s.refresh_token_hash = %s
        """,
        (refresh_hash,),
    )
    if not row or row["revoked_at"] is not None or row["expires_at"] <= datetime.now(tz=timezone.utc):
        raise UnauthorizedError(message="리프레시 토큰이 유효하지 않습니다.", error_code="AUTH_REFRESH_INVALID")
    if not row["is_active"] or row["is_locked"]:
        raise UnauthorizedError(message="계정 상태가 유효하지 않습니다.", error_code="AUTH_ACCOUNT_INVALID")

    new_refresh = generate_refresh_token()
    new_refresh_hash = hash_token(new_refresh)
    access_token, jti, _ = jwt_manager.create_access_token(
        user_id=row["user_id"],
        login_id=row["login_id"],
        role=row["role_code"],
        hospital_code=row["hospital_code"],
        session_id=row["session_id"],
    )

    await execute(
        conn,
        """
        UPDATE auth.auth_session
           SET refresh_token_hash = %s,
               access_jti = %s,
               last_seen_at = now(),
               expires_at = %s,
               updated_at = now()
         WHERE session_id = %s
        """,
        (
            new_refresh_hash,
            str(jti),
            datetime.now(tz=timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
            str(row["session_id"]),
        ),
    )
    return RefreshTokenResponseData(
        access_token=access_token,
        refresh_token=new_refresh,
        expires_in=settings.access_token_expire_minutes * 60,
        session_id=row["session_id"],
    )


async def logout(conn: AsyncConnection, session_id, reason: str = "USER_LOGOUT") -> None:
    await execute(
        conn,
        """
        UPDATE auth.auth_session
           SET revoked_at = now(),
               revoke_reason = %s,
               updated_at = now()
         WHERE session_id = %s
           AND revoked_at IS NULL
        """,
        (reason, str(session_id)),
    )


async def get_my_profile(conn: AsyncConnection, user_id) -> MyProfileResponse:
    row = await fetch_one(
        conn,
        """
        SELECT user_id, login_id, full_name, hospital_code, role_code::text AS role_code,
               email, phone, department, specialty, license_number,
               is_first_login, last_login_at
          FROM auth.user_account
         WHERE user_id = %s
        """,
        (str(user_id),),
    )
    if not row:
        raise NotFoundError(message="사용자를 찾을 수 없습니다.", error_code="USER_NOT_FOUND")
    return MyProfileResponse(
        user_id=row["user_id"],
        login_id=row["login_id"],
        name=row["full_name"],
        hospital_code=row["hospital_code"],
        role=row["role_code"],
        email=row["email"],
        phone=row["phone"],
        department=row["department"],
        specialty=row["specialty"],
        license_number=row["license_number"],
        is_first_login=row["is_first_login"],
        last_login_at=row["last_login_at"],
    )


async def update_my_info(conn: AsyncConnection, user_id, *, email: str | None, phone: str | None) -> None:
    await execute(
        conn,
        """
        UPDATE auth.user_account
           SET email = %s,
               phone = %s,
               updated_at = now()
         WHERE user_id = %s
        """,
        (email, phone, str(user_id)),
    )


async def change_password(conn: AsyncConnection, user_id, current_password: str, new_password: str, new_password_confirm: str) -> None:
    if new_password != new_password_confirm:
        raise ValidationError("새 비밀번호 확인 값이 일치하지 않습니다.", error_code="VALIDATION_PASSWORD_CONFIRM_MISMATCH")

    row = await fetch_one(
        conn,
        "SELECT user_id, password_hash, password_algo FROM auth.user_account WHERE user_id = %s",
        (str(user_id),),
    )
    if not row:
        raise NotFoundError(message="사용자를 찾을 수 없습니다.", error_code="USER_NOT_FOUND")
    if not await password_manager.verify_password(row["password_hash"], current_password, row["password_algo"]):
        raise UnauthorizedError(message="현재 비밀번호가 올바르지 않습니다.", error_code="AUTH_INVALID_CURRENT_PASSWORD")

    hashed = await password_manager.hash_password(new_password)
    await execute(
        conn,
        """
        INSERT INTO auth.user_password_history (password_history_id, user_id, password_hash, changed_at, changed_by)
        VALUES (gen_random_uuid(), %s, %s, now(), %s)
        """,
        (str(user_id), row["password_hash"], str(user_id)),
    )
    await execute(
        conn,
        """
        UPDATE auth.user_account
           SET password_hash = %s,
               password_algo = 'argon2id',
               is_first_login = false,
               password_reset_required = false,
               last_password_changed_at = now(),
               updated_at = now()
         WHERE user_id = %s
        """,
        (hashed, str(user_id)),
    )


async def request_password_reset(conn: AsyncConnection, *, login_id: str, email: str | None) -> dict[str, Any] | None:
    row = await fetch_one(
        conn,
        """
        SELECT user_id, login_id, full_name, email
        FROM auth.user_account
        WHERE lower(login_id) = lower(%s)
          AND deleted_at IS NULL
          AND (%s IS NULL OR lower(email) = lower(%s))
        """,
        (login_id, email, email),
    )
    if not row:
        return None

    temp_password = generate_temporary_password()
    password_hash = await password_manager.hash_password(temp_password)
    await execute(
        conn,
        """
        INSERT INTO auth.password_reset_token (
            reset_token_id, user_id, token_hash, reset_channel, request_ip, requested_at,
            expires_at, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), %s, %s, %s, %s::inet, now(),
            now() + interval '1 day', now(), now()
        )
        """,
        (
            str(row["user_id"]),
            hash_token(temp_password),
            "EMAIL" if row["email"] else "ADMIN",
            get_request_context().normalized_ip() if get_request_context() else None,
        ),
    )
    await execute(
        conn,
        """
        UPDATE auth.user_account
           SET password_hash = %s,
               password_algo = 'argon2id',
               is_first_login = true,
               password_reset_required = true,
               failed_login_count = 0,
               is_locked = false,
               locked_at = NULL,
               locked_reason = NULL,
               updated_at = now()
         WHERE user_id = %s
        """,
        (password_hash, str(row["user_id"])),
    )

    return {
        "login_id": row["login_id"],
        "email": row["email"],
        "temporary_password": temp_password if settings.app_env != "production" else None,
    }
