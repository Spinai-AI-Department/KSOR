from __future__ import annotations

from typing import Any

from fastapi.responses import ORJSONResponse



def success(message: str, data: Any = None, status_code: int = 200) -> ORJSONResponse:
    return ORJSONResponse(
        status_code=status_code,
        content={
            "status": "success",
            "message": message,
            "data": data,
        },
    )



def error(message: str, error_code: str, data: Any = None, status_code: int = 400) -> ORJSONResponse:
    return ORJSONResponse(
        status_code=status_code,
        content={
            "status": "error",
            "error_code": error_code,
            "message": message,
            "data": data,
        },
    )
