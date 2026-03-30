from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core.responses import success
from app.db.queries import fetch_val
from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health/live")
async def live() :
    return success("OK", {"status": "alive"})


@router.get("/health/ready")
async def ready(request: Request, conn=Depends(get_db)):
    ping = await fetch_val(conn, "SELECT 1", default=1)
    return success(
        "OK",
        {
            "status": "ready",
            "db": int(ping) == 1,
            "node": request.app.state.settings.app_node_name,
        },
    )
