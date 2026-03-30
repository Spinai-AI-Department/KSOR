from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.models.common import APIModel


class SurveyStatusResponse(APIModel):
    request_id: UUID
    token_status: str
    expired: bool
    opened_at: datetime | None = None
    verified_at: datetime | None = None
    submitted_at: datetime | None = None
    hospital_name: str | None = None
    doctor_name: str | None = None
    patient_name_masked: str | None = None
    timepoint_label: str | None = None


class SurveyVerifyRequest(APIModel):
    method_code: str = Field(pattern="^(birth_ymd|phone_last4)$")
    value: str = Field(min_length=4, max_length=20)


class SurveyVerifyResponse(APIModel):
    verified: bool
    survey_token: str
    expires_at: datetime


class SurveyQuestionOption(APIModel):
    value: int | str
    label: str


class SurveyQuestion(APIModel):
    step: int
    category: str
    instrument_code: str
    question_code: str
    title: str
    ui_type: str
    options: list[SurveyQuestionOption] | None = None
    min_val: int | None = None
    max_val: int | None = None


class SurveyQuestionsResponse(APIModel):
    patient_name: str | None = None
    doctor_name: str | None = None
    timepoint_label: str | None = None
    total_questions: int
    questions: list[SurveyQuestion]


class SurveySaveRequest(APIModel):
    question_id: str
    answer_value: int | str | bool | float | dict | list | None


class SurveySubmitRequest(APIModel):
    answers: dict[str, int | str | bool | float | dict | list | None]


class SurveySubmitResponse(APIModel):
    is_completed: bool
    sync_status: str = "SUCCESS"
    submitted_at: datetime
