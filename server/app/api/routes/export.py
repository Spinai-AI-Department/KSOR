from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.deps import AuthenticatedContext, require_admin, require_auth
from app.models.export import GlobalExportApprovalRequest, GlobalExportRequestCreate
from app.services import export_service

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/csv")
async def export_csv(
    start_date: str | None = None,
    end_date: str | None = None,
    procedure_code: str | None = None,
    diagnosis_code: str | None = None,
    timepoint_code: str | None = None,
    ctx: AuthenticatedContext = Depends(require_auth),
):
    return await export_service.export_site_csv(
        ctx.conn,
        {
            "start_date": start_date,
            "end_date": end_date,
            "procedure_code": procedure_code,
            "diagnosis_code": diagnosis_code,
            "timepoint_code": timepoint_code,
        },
    )


@router.post("/global/request")
async def create_global_request(payload: GlobalExportRequestCreate, ctx: AuthenticatedContext = Depends(require_auth)):
    data = await export_service.create_global_export_request(
        ctx.conn,
        requester_user_id=ctx.principal.sub,
        requester_hospital_code=ctx.principal.hospital_code,
        payload=payload,
    )
    from app.core.responses import success
    return success("전체 데이터 반출 요청이 접수되었습니다.", data, status_code=201)


@router.get("/global/requests")
async def list_global_requests(ctx: AuthenticatedContext = Depends(require_admin)):
    data = await export_service.list_global_export_requests(ctx.conn)
    from app.core.responses import success
    return success("전체 데이터 반출 요청 목록입니다.", data)


@router.put("/global/approve/{export_request_id}")
async def approve_global_request(export_request_id: UUID, payload: GlobalExportApprovalRequest, ctx: AuthenticatedContext = Depends(require_admin)):
    data = await export_service.approve_global_export_request(ctx.conn, export_request_id, ctx.principal.sub, payload)
    from app.core.responses import success
    return success("전체 데이터 반출 요청 검토가 완료되었습니다.", data)


@router.get("/global/download/{export_request_id}")
async def download_global(export_request_id: UUID, ctx: AuthenticatedContext = Depends(require_admin)):
    return await export_service.download_global_export(ctx.conn, export_request_id, ctx.principal.sub)
