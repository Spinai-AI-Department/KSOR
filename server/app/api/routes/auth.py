from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import AuthenticatedContext, require_auth
from app.core.responses import success
from app.db.session import get_db, get_db_auth
from app.models.auth import ChangePasswordRequest, LoginRequest, RefreshTokenRequest, ResetPasswordRequest, UpdateMyInfoRequest
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
async def login(payload: LoginRequest, conn=Depends(get_db_auth)):
    data = await auth_service.login(conn, payload)
    return success("로그인에 성공했습니다.", data.model_dump())


@router.post("/refresh")
async def refresh(payload: RefreshTokenRequest, conn=Depends(get_db_auth)):
    data = await auth_service.refresh_token(conn, payload)
    return success("토큰이 재발급되었습니다.", data.model_dump())


@router.post("/logout")
async def logout(ctx: AuthenticatedContext = Depends(require_auth)):
    await auth_service.logout(ctx.conn, ctx.principal.sid)
    return success("로그아웃되었습니다.", None)


@router.put("/password")
async def change_password(payload: ChangePasswordRequest, ctx: AuthenticatedContext = Depends(require_auth)):
    await auth_service.change_password(
        ctx.conn,
        ctx.principal.sub,
        payload.current_password.get_secret_value(),
        payload.new_password.get_secret_value(),
        payload.new_password_confirm.get_secret_value(),
    )
    return success("비밀번호가 성공적으로 변경되었습니다.", None)


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, conn=Depends(get_db_auth)):
    data = await auth_service.request_password_reset(conn, login_id=payload.login_id, email=payload.email)
    return success("등록된 연락처 또는 이메일로 임시 비밀번호 발급 절차가 진행되었습니다.", data)


@router.get("/me")
async def me(ctx: AuthenticatedContext = Depends(require_auth)):
    data = await auth_service.get_my_profile(ctx.conn, ctx.principal.sub)
    return success("내 정보 조회가 완료되었습니다.", data.model_dump())


@router.put("/me/info")
async def update_me(payload: UpdateMyInfoRequest, ctx: AuthenticatedContext = Depends(require_auth)):
    await auth_service.update_my_info(ctx.conn, ctx.principal.sub, email=payload.email, phone=payload.phone)
    return success("회원정보가 수정되었습니다.", None)
