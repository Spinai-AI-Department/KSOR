from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core.responses import success
from app.db.session import get_db_auth as get_db_system
from app.services import outbox_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/alimtalk/{vendor_code}")
async def alimtalk_webhook(vendor_code: str, request: Request, conn=Depends(get_db_system)):
    payload = await request.json()
    remote_ip = request.client.host if request.client else None
    await outbox_service.register_webhook(conn, vendor_code=vendor_code, payload=payload, remote_ip=remote_ip)
    return success("웹훅이 접수되었습니다.", None)
