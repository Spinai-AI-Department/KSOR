from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from app.api.deps import require_survey_token
from app.core.responses import success
from app.db.session import get_db
from app.models.survey import SurveySaveRequest, SurveySubmitRequest, SurveyVerifyRequest
from app.services import survey_service

router = APIRouter(prefix="/survey", tags=["survey"])


@router.get("/{token_uuid}/status")
async def survey_status(token_uuid: UUID, conn=Depends(get_db)):
    data = await survey_service.get_status(conn, token_uuid)
    return success("설문 상태 조회가 완료되었습니다.", data.model_dump())


@router.post("/{token_uuid}/verify")
async def survey_verify(token_uuid: UUID, payload: SurveyVerifyRequest, conn=Depends(get_db)):
    data = await survey_service.verify(conn, token_uuid, payload)
    return success("본인 확인이 완료되었습니다.", data.model_dump())


@router.get("/{token_uuid}/questions")
async def survey_questions(token_uuid: UUID, claims=Depends(require_survey_token), conn=Depends(get_db)):
    data = await survey_service.get_questions(conn, claims)
    return success("설문 문항 조회가 완료되었습니다.", data.model_dump())


@router.patch("/{token_uuid}/save")
async def survey_save(token_uuid: UUID, payload: SurveySaveRequest, claims=Depends(require_survey_token), conn=Depends(get_db)):
    await survey_service.save_draft(conn, claims, payload.question_id, payload.answer_value)
    return success("임시 저장이 완료되었습니다.", None)


@router.post("/{token_uuid}/submit")
async def survey_submit(token_uuid: UUID, payload: SurveySubmitRequest, claims=Depends(require_survey_token), conn=Depends(get_db)):
    data = await survey_service.submit(conn, claims, payload.answers)
    return success("제출이 완료되었습니다. 소중한 건강 정보를 남겨주셔서 감사합니다.", data.model_dump())
