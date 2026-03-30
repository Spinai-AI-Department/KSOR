from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, status


@dataclass(slots=True)
class AppError(Exception):
    message: str
    error_code: str
    status_code: int = status.HTTP_400_BAD_REQUEST
    data: Any = None


class UnauthorizedError(AppError):
    def __init__(self, message: str = "인증이 필요합니다.", error_code: str = "AUTH_REQUIRED"):
        super().__init__(message=message, error_code=error_code, status_code=status.HTTP_401_UNAUTHORIZED)


class ForbiddenError(AppError):
    def __init__(self, message: str = "접근 권한이 없습니다.", error_code: str = "PERMISSION_DENIED"):
        super().__init__(message=message, error_code=error_code, status_code=status.HTTP_403_FORBIDDEN)


class NotFoundError(AppError):
    def __init__(self, message: str = "대상을 찾을 수 없습니다.", error_code: str = "NOT_FOUND"):
        super().__init__(message=message, error_code=error_code, status_code=status.HTTP_404_NOT_FOUND)


class ConflictError(AppError):
    def __init__(self, message: str = "충돌이 발생했습니다.", error_code: str = "CONFLICT"):
        super().__init__(message=message, error_code=error_code, status_code=status.HTTP_409_CONFLICT)


class ValidationError(AppError):
    def __init__(self, message: str, error_code: str = "VALIDATION_ERROR", data: Any = None):
        super().__init__(message=message, error_code=error_code, status_code=status.HTTP_400_BAD_REQUEST, data=data)



def to_http_exception(exc: AppError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail={
        "status": "error",
        "error_code": exc.error_code,
        "message": exc.message,
        "data": exc.data,
    })
