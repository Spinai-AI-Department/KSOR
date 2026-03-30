from __future__ import annotations

import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

try:
    import bcrypt
except ImportError:  # pragma: no cover
    bcrypt = None
import jwt
from anyio import to_thread
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import settings
from app.core.encryption import crypto
from app.core.exceptions import UnauthorizedError, ValidationError


PASSWORD_RE = re.compile(settings.password_regex)


@dataclass(slots=True)
class AccessTokenClaims:
    sub: UUID
    login_id: str
    role: str
    hospital_code: str | None
    sid: UUID
    jti: UUID
    exp: int
    token_use: Literal["access", "survey"]
    request_id: UUID | None = None
    case_id: UUID | None = None


class PasswordManager:
    def __init__(self) -> None:
        self.hasher = PasswordHasher()

    async def hash_password(self, password: str) -> str:
        self.validate_password_strength(password)
        return await to_thread.run_sync(self.hasher.hash, password)

    async def verify_password(self, stored_hash: str, password: str, algo: str = "argon2id") -> bool:
        if algo.lower() == "bcrypt" or stored_hash.startswith("$2"):
            if bcrypt is None:
                return False
            return await to_thread.run_sync(lambda: bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8")))

        try:
            return await to_thread.run_sync(self.hasher.verify, stored_hash, password)
        except VerifyMismatchError:
            return False
        except InvalidHashError:
            return False

    async def needs_rehash(self, stored_hash: str, algo: str = "argon2id") -> bool:
        if algo.lower() != "argon2id":
            return False
        try:
            return await to_thread.run_sync(self.hasher.check_needs_rehash, stored_hash)
        except InvalidHashError:
            return False

    def validate_password_strength(self, password: str) -> None:
        if not PASSWORD_RE.match(password):
            raise ValidationError(
                message="비밀번호는 영문, 숫자, 특수문자를 포함하여 8자 이상 128자 이하이어야 합니다.",
                error_code="VALIDATION_PASSWORD_WEAK",
            )


class JWTManager:
    def __init__(self) -> None:
        self.secret = settings.jwt_secret_key
        self.algorithm = settings.jwt_algorithm
        self.issuer = settings.jwt_issuer
        self.audience = settings.jwt_audience

    def create_access_token(
        self,
        *,
        user_id: UUID,
        login_id: str,
        role: str,
        hospital_code: str | None,
        session_id: UUID,
        jti: UUID | None = None,
        expires_delta: timedelta | None = None,
    ) -> tuple[str, UUID, datetime]:
        jti = jti or uuid4()
        now = datetime.now(tz=timezone.utc)
        expires_at = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
        payload = {
            "sub": str(user_id),
            "login_id": login_id,
            "role": role,
            "hospital_code": hospital_code,
            "sid": str(session_id),
            "jti": str(jti),
            "iat": now,
            "nbf": now,
            "exp": expires_at,
            "iss": self.issuer,
            "aud": self.audience,
            "token_use": "access",
        }
        token = jwt.encode(payload, self.secret, algorithm=self.algorithm)
        return token, jti, expires_at

    def create_survey_token(
        self,
        *,
        request_id: UUID,
        case_id: UUID,
        hospital_code: str,
    ) -> tuple[str, datetime]:
        now = datetime.now(tz=timezone.utc)
        expires_at = now + timedelta(minutes=settings.survey_token_expire_minutes)
        payload = {
            "sub": str(request_id),
            "request_id": str(request_id),
            "case_id": str(case_id),
            "hospital_code": hospital_code,
            "sid": str(request_id),
            "jti": str(uuid4()),
            "iat": now,
            "nbf": now,
            "exp": expires_at,
            "iss": self.issuer,
            "aud": self.audience,
            "token_use": "survey",
        }
        token = jwt.encode(payload, self.secret, algorithm=self.algorithm)
        return token, expires_at

    def decode_token(self, token: str) -> AccessTokenClaims:
        try:
            data = jwt.decode(
                token,
                self.secret,
                algorithms=[self.algorithm],
                issuer=self.issuer,
                audience=self.audience,
                options={"require": ["exp", "iat", "nbf", "iss", "aud", "sub", "jti", "token_use"]},
            )
        except jwt.PyJWTError as exc:
            raise UnauthorizedError(message="유효하지 않거나 만료된 토큰입니다.", error_code="AUTH_INVALID_TOKEN") from exc

        return AccessTokenClaims(
            sub=UUID(data["sub"]),
            login_id=data.get("login_id", ""),
            role=data.get("role", "SYSTEM"),
            hospital_code=data.get("hospital_code"),
            sid=UUID(data["sid"]),
            jti=UUID(data["jti"]),
            exp=int(data["exp"]),
            token_use=data["token_use"],
            request_id=UUID(data["request_id"]) if data.get("request_id") else None,
            case_id=UUID(data["case_id"]) if data.get("case_id") else None,
        )


password_manager = PasswordManager()
jwt_manager = JWTManager()


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)



def hash_token(token: str) -> str:
    return crypto.sha256_hex(token) or ""



def generate_temporary_password(length: int = 14) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()"
    while True:
        candidate = "".join(secrets.choice(alphabet) for _ in range(length))
        if PASSWORD_RE.match(candidate):
            return candidate
