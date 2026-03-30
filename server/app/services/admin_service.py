from __future__ import annotations

from typing import Any

from psycopg import AsyncConnection

from app.core.exceptions import NotFoundError, ValidationError
from app.core.security import generate_temporary_password, password_manager
from app.db.queries import execute, fetch_all, fetch_one, fetch_val
from app.models.admin import AdminUserCreateRequest, AdminUserListResponse, AdminUserUpdateRequest
from app.models.common import PaginationMeta
from app.services.sql_utils import build_set_clause


async def list_users(
    conn: AsyncConnection,
    *,
    page: int = 1,
    size: int = 20,
    hospital_code: str | None = None,
    keyword: str | None = None,
) -> AdminUserListResponse:
    where = ["deleted_at IS NULL"]
    params: list[Any] = []
    if hospital_code:
        where.append("hospital_code = %s")
        params.append(hospital_code)
    if keyword:
        where.append("(lower(login_id) LIKE lower(%s) OR lower(full_name) LIKE lower(%s) OR lower(coalesce(email, '')) LIKE lower(%s))")
        pattern = f"%{keyword}%"
        params.extend([pattern, pattern, pattern])

    where_sql = " AND ".join(where)
    total = int(
        await fetch_val(
            conn,
            f"SELECT count(*) FROM auth.user_account WHERE {where_sql}",
            params,
            default=0,
        )
    )
    offset = max(page - 1, 0) * size
    rows = await fetch_all(
        conn,
        f"""
        SELECT user_id, login_id, full_name, hospital_code, role_code::text AS role_code,
               email, phone, is_active, is_locked, is_first_login, created_at, last_login_at
        FROM auth.user_account
        WHERE {where_sql}
        ORDER BY created_at DESC
        LIMIT %s OFFSET %s
        """,
        [*params, size, offset],
    )
    total_pages = max((total + size - 1) // size, 1)
    return AdminUserListResponse(
        pagination=PaginationMeta(
            current_page=page,
            total_pages=total_pages,
            total_elements=total,
            page_size=size,
        ),
        items=rows,
    )


async def create_user(conn: AsyncConnection, payload: AdminUserCreateRequest) -> dict[str, Any]:
    initial_password = payload.initial_password or generate_temporary_password()
    password_hash = await password_manager.hash_password(initial_password)

    existing = await fetch_val(
        conn,
        "SELECT 1 FROM auth.user_account WHERE lower(login_id) = lower(%s)",
        (payload.login_id,),
    )
    if existing:
        raise ValidationError("이미 사용 중인 로그인 ID입니다.", error_code="USER_LOGIN_ID_DUPLICATE")

    row = await fetch_one(
        conn,
        """
        INSERT INTO auth.user_account (
            user_id, hospital_code, login_id, password_hash, password_algo, full_name,
            email, phone, role_code, is_first_login, password_reset_required,
            is_active, is_locked, failed_login_count, created_at, updated_at
        ) VALUES (
            gen_random_uuid(), %s, %s, %s, 'argon2id', %s,
            %s, %s, %s::auth.app_role, true, false,
            true, false, 0, now(), now()
        )
        RETURNING user_id, login_id, full_name, hospital_code, role_code::text AS role_code, email, phone
        """,
        (
            payload.hospital_code,
            payload.login_id,
            password_hash,
            payload.full_name,
            payload.email,
            payload.phone,
            payload.role_code,
        ),
    )
    return {**row, "initial_password": initial_password}


async def update_user(conn: AsyncConnection, user_id, payload: AdminUserUpdateRequest) -> dict[str, Any]:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise ValidationError("수정할 항목이 없습니다.")

    if "role_code" in data and data["role_code"] is not None:
        data["role_code"] = data["role_code"]

    if "full_name" in data:
        data["full_name"] = data.pop("full_name")

    set_sql, values = build_set_clause(data)
    row = await fetch_one(
        conn,
        f"""
        UPDATE auth.user_account
           SET {set_sql}, updated_at = now()
         WHERE user_id = %s
           AND deleted_at IS NULL
     RETURNING user_id, login_id, full_name, hospital_code, role_code::text AS role_code,
               email, phone, is_active, is_locked, is_first_login, created_at, last_login_at
        """,
        [*values, str(user_id)],
    )
    if not row:
        raise NotFoundError(message="사용자를 찾을 수 없습니다.", error_code="USER_NOT_FOUND")
    return row


async def reset_user_password(conn: AsyncConnection, user_id, initial_password: str | None = None) -> dict[str, Any]:
    temp_password = initial_password or generate_temporary_password()
    password_hash = await password_manager.hash_password(temp_password)
    row = await fetch_one(
        conn,
        """
        UPDATE auth.user_account
           SET password_hash = %s,
               password_algo = 'argon2id',
               is_first_login = true,
               password_reset_required = false,
               failed_login_count = 0,
               is_locked = false,
               locked_at = NULL,
               locked_reason = NULL,
               updated_at = now()
         WHERE user_id = %s
           AND deleted_at IS NULL
     RETURNING user_id, login_id, full_name
        """,
        (password_hash, str(user_id)),
    )
    if not row:
        raise NotFoundError(message="사용자를 찾을 수 없습니다.", error_code="USER_NOT_FOUND")
    return {**row, "initial_password": temp_password}


async def deactivate_user(conn: AsyncConnection, user_id) -> None:
    count = await execute(
        conn,
        """
        UPDATE auth.user_account
           SET is_active = false,
               deleted_at = now(),
               updated_at = now()
         WHERE user_id = %s
           AND deleted_at IS NULL
        """,
        (str(user_id),),
    )
    if count == 0:
        raise NotFoundError(message="사용자를 찾을 수 없습니다.", error_code="USER_NOT_FOUND")
