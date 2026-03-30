from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import AuthenticatedContext, require_auth, require_pi_or_admin
from app.core.responses import success
from app.models.patient import ClinicalUpdateRequest, LockRequest, MemoUpdateRequest, OutcomeUpdateRequest, PatientCreateRequest, PromSendRequest
from app.services import patient_service

router = APIRouter(prefix="/patients", tags=["patients"])


@router.get("")
async def list_patients(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    keyword: str | None = None,
    procedure_code: str | None = None,
    diagnosis_code: str | None = None,
    status_filter: str | None = None,
    ctx: AuthenticatedContext = Depends(require_auth),
):
    data = await patient_service.list_cases(
        ctx.conn,
        page=page,
        size=size,
        keyword=keyword,
        procedure_code=procedure_code,
        diagnosis_code=diagnosis_code,
        status_filter=status_filter,
    )
    return success("환자 리스트 조회가 완료되었습니다.", data.model_dump())


@router.post("")
async def create_patient(payload: PatientCreateRequest, ctx: AuthenticatedContext = Depends(require_auth)):
    data = await patient_service.create_patient_case(ctx.conn, ctx.principal.sub, payload)
    return success("신규 환자가 성공적으로 등록되었습니다.", data.model_dump(), status_code=201)


@router.patch("/{case_id}/clinical")
async def update_clinical(case_id: UUID, payload: ClinicalUpdateRequest, ctx: AuthenticatedContext = Depends(require_auth)):
    data = await patient_service.update_clinical(ctx.conn, case_id, payload)
    return success("진단 및 수술 정보가 저장되었습니다.", data)


@router.patch("/{case_id}/outcomes")
async def update_outcomes(case_id: UUID, payload: OutcomeUpdateRequest, ctx: AuthenticatedContext = Depends(require_auth)):
    data = await patient_service.update_outcome(ctx.conn, case_id, payload)
    return success("수술 결과 및 합병증 정보가 저장되었습니다.", data)


@router.get("/{case_id}/memo")
async def get_memo(case_id: UUID, ctx: AuthenticatedContext = Depends(require_auth)):
    data = await patient_service.get_latest_memo(ctx.conn, case_id)
    return success("메모 조회가 완료되었습니다.", data.model_dump())


@router.put("/{case_id}/memo")
async def put_memo(case_id: UUID, payload: MemoUpdateRequest, ctx: AuthenticatedContext = Depends(require_auth)):
    data = await patient_service.put_memo(ctx.conn, case_id, ctx.principal.sub, payload)
    return success("메모가 저장되었습니다.", data.model_dump())


@router.patch("/{case_id}/lock")
async def patch_lock(case_id: UUID, payload: LockRequest, ctx: AuthenticatedContext = Depends(require_auth)):
    data = await patient_service.set_lock(ctx.conn, case_id, ctx.principal.sub, ctx.principal.role, payload)
    return success("데이터 잠금 상태가 변경되었습니다.", data)


@router.post("/{case_id}/prom-alimtalk")
async def send_prom(case_id: UUID, payload: PromSendRequest, ctx: AuthenticatedContext = Depends(require_auth)):
    data = await patient_service.send_prom_request(ctx.conn, case_id, ctx.principal.sub, payload)
    return success("환자에게 알림톡 발송 요청이 접수되었습니다.", data, status_code=202)
