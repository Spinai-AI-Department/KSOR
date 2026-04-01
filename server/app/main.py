from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from starlette.middleware import Middleware
from starlette.middleware.gzip import GZipMiddleware

import psycopg
import psycopg.errors

from app.api.router import api_router
from app.core.config import settings
from app.core.exceptions import AppError
from app.core.logging import configure_logging
from app.db.pool import db
from app.middleware.audit_logging import AuditLoggingMiddleware
from app.middleware.request_context import RequestContextMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    await db.open()
    app.state.db = db
    app.state.settings = settings
    try:
        yield
    finally:
        await db.close()


middleware = [
    Middleware(RequestContextMiddleware),
    Middleware(SecurityHeadersMiddleware),
    Middleware(GZipMiddleware, minimum_size=1024),
    Middleware(AuditLoggingMiddleware),
]


app = FastAPI(
    title=settings.app_name,
    debug=settings.app_debug,
    version="1.0.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    middleware=middleware,
)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    return ORJSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "error_code": exc.error_code,
            "message": exc.message,
            "data": exc.data,
        },
    )


@app.exception_handler(psycopg.errors.ForeignKeyViolation)
async def fk_violation_handler(request: Request, exc: psycopg.errors.ForeignKeyViolation):
    detail = str(exc).split("DETAIL:  ")[-1].split("\n")[0] if "DETAIL:" in str(exc) else str(exc)
    return ORJSONResponse(
        status_code=400,
        content={
            "status": "error",
            "error_code": "FOREIGN_KEY_VIOLATION",
            "message": f"참조 데이터가 존재하지 않습니다: {detail}",
            "data": None,
        },
    )


@app.exception_handler(psycopg.errors.UniqueViolation)
async def unique_violation_handler(request: Request, exc: psycopg.errors.UniqueViolation):
    detail = str(exc).split("DETAIL:  ")[-1].split("\n")[0] if "DETAIL:" in str(exc) else str(exc)
    return ORJSONResponse(
        status_code=409,
        content={
            "status": "error",
            "error_code": "DUPLICATE_ENTRY",
            "message": f"이미 존재하는 데이터입니다: {detail}",
            "data": None,
        },
    )


@app.exception_handler(psycopg.errors.CheckViolation)
async def check_violation_handler(request: Request, exc: psycopg.errors.CheckViolation):
    return ORJSONResponse(
        status_code=400,
        content={
            "status": "error",
            "error_code": "CHECK_VIOLATION",
            "message": f"데이터 제약 조건 위반: {exc}",
            "data": None,
        },
    )


@app.exception_handler(psycopg.errors.RaiseException)
async def raise_exception_handler(request: Request, exc: psycopg.errors.RaiseException):
    return ORJSONResponse(
        status_code=400,
        content={
            "status": "error",
            "error_code": "DB_RULE_VIOLATION",
            "message": str(exc).split("\n")[0],
            "data": None,
        },
    )


@app.exception_handler(psycopg.errors.NotNullViolation)
async def not_null_violation_handler(request: Request, exc: psycopg.errors.NotNullViolation):
    detail = str(exc).split("DETAIL:  ")[-1].split("\n")[0] if "DETAIL:" in str(exc) else str(exc)
    return ORJSONResponse(
        status_code=400,
        content={
            "status": "error",
            "error_code": "NOT_NULL_VIOLATION",
            "message": f"필수 항목이 누락되었습니다: {detail}",
            "data": None,
        },
    )


@app.exception_handler(psycopg.errors.InsufficientPrivilege)
async def insufficient_privilege_handler(request: Request, exc: psycopg.errors.InsufficientPrivilege):
    return ORJSONResponse(
        status_code=403,
        content={
            "status": "error",
            "error_code": "INSUFFICIENT_PRIVILEGE",
            "message": "데이터 접근 권한이 없습니다.",
            "data": None,
        },
    )


@app.exception_handler(psycopg.Error)
async def generic_db_error_handler(request: Request, exc: psycopg.Error):
    import logging
    logging.getLogger(__name__).error("Unhandled DB error: %s", exc, exc_info=True)
    return ORJSONResponse(
        status_code=500,
        content={
            "status": "error",
            "error_code": "DATABASE_ERROR",
            "message": f"데이터베이스 오류가 발생했습니다: {str(exc).split(chr(10))[0]}",
            "data": None,
        },
    )


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(request: Request, exc: RequestValidationError):
    field_errors = []
    for err in exc.errors():
        loc = err.get("loc", [])
        # Skip the first element if it's 'body'/'query'/'path'
        field_parts = [str(p) for p in loc if p not in ("body", "query", "path")]
        field_name = ".".join(field_parts) if field_parts else "unknown"
        field_errors.append({"field": field_name, "message": err.get("msg", ""), "type": err.get("type", "")})

    field_names = ", ".join(e["field"] for e in field_errors)
    message = f"입력값 검증 실패: {field_names}" if field_names else "요청 값 검증에 실패했습니다."

    return ORJSONResponse(
        status_code=422,
        content={
            "status": "error",
            "error_code": "REQUEST_VALIDATION_ERROR",
            "message": message,
            "data": field_errors,
        },
    )


app.include_router(api_router, prefix=settings.api_prefix)
