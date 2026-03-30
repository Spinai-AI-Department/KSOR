from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import AuthenticatedContext, require_admin
from app.core.responses import success
from app.models.admin import AdminResetPasswordRequest, AdminUserCreateRequest, AdminUserUpdateRequest
from app.services import admin_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    hospital_code: str | None = None,
    keyword: str | None = None,
    ctx: AuthenticatedContext = Depends(require_admin),
):
    data = await admin_service.list_users(ctx.conn, page=page, size=size, hospital_code=hospital_code, keyword=keyword)
    return success("회원 리스트 조회가 완료되었습니다.", data.model_dump())


@router.post("/users")
async def create_user(payload: AdminUserCreateRequest, ctx: AuthenticatedContext = Depends(require_admin)):
    data = await admin_service.create_user(ctx.conn, payload)
    return success("사용자 계정이 생성되었습니다.", data, status_code=201)


@router.put("/users/{user_id}")
async def update_user(user_id: UUID, payload: AdminUserUpdateRequest, ctx: AuthenticatedContext = Depends(require_admin)):
    data = await admin_service.update_user(ctx.conn, user_id, payload)
    return success("사용자 계정이 수정되었습니다.", data)


@router.put("/users/{user_id}/reset-password")
async def reset_user_password(user_id: UUID, payload: AdminResetPasswordRequest, ctx: AuthenticatedContext = Depends(require_admin)):
    data = await admin_service.reset_user_password(ctx.conn, user_id, initial_password=payload.initial_password)
    return success("임시 비밀번호가 재설정되었습니다.", data)


@router.delete("/users/{user_id}")
async def delete_user(user_id: UUID, ctx: AuthenticatedContext = Depends(require_admin)):
    await admin_service.deactivate_user(ctx.conn, user_id)
    return success("사용자 계정이 비활성화되었습니다.", None)
