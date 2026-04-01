from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import EmailStr, Field, SecretStr

from app.models.common import APIModel


class LoginRequest(APIModel):
    login_id: str = Field(min_length=3, max_length=100)
    password: SecretStr = Field(min_length=8, max_length=128)


class UserInfo(APIModel):
    user_id: UUID
    name: str
    hospital_code: str | None = None
    role: str


class LoginResponseData(APIModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int
    require_password_change: bool
    session_id: UUID
    user_info: UserInfo


class RefreshTokenRequest(APIModel):
    refresh_token: SecretStr


class RefreshTokenResponseData(APIModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int
    session_id: UUID


class ChangePasswordRequest(APIModel):
    current_password: SecretStr = Field(min_length=8, max_length=128)
    new_password: SecretStr = Field(min_length=8, max_length=128)
    new_password_confirm: SecretStr = Field(min_length=8, max_length=128)


class ResetPasswordRequest(APIModel):
    login_id: str = Field(min_length=3, max_length=100)
    email: EmailStr | None = None


class MyProfileResponse(APIModel):
    user_id: UUID
    login_id: str
    name: str
    hospital_code: str | None = None
    role: str
    email: str | None = None
    phone: str | None = None
    department: str | None = None
    specialty: str | None = None
    license_number: str | None = None
    is_first_login: bool
    last_login_at: datetime | None = None


class UpdateMyInfoRequest(APIModel):
    email: EmailStr | None = None
    phone: str | None = None
