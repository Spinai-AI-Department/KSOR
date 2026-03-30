from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from starlette.middleware import Middleware
from starlette.middleware.gzip import GZipMiddleware

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


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(request: Request, exc: RequestValidationError):
    return ORJSONResponse(
        status_code=422,
        content={
            "status": "error",
            "error_code": "REQUEST_VALIDATION_ERROR",
            "message": "요청 값 검증에 실패했습니다.",
            "data": exc.errors(),
        },
    )


app.include_router(api_router, prefix=settings.api_prefix)
