from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from app.models.common import APIModel, PaginationMeta


class TimepointCode(str, Enum):
    PRE_OP = "PRE_OP"
    POST_1M = "POST_1M"
    POST_3M = "POST_3M"
    POST_6M = "POST_6M"
    POST_1Y = "POST_1Y"
    PREOP = "PREOP"
    POSTOP_1M = "POSTOP_1M"
    POSTOP_3M = "POSTOP_3M"
    POSTOP_6M = "POSTOP_6M"
    POSTOP_12M = "POSTOP_12M"
    POSTOP_24M = "POSTOP_24M"


class MemoVisibility(str, Enum):
    PRIVATE = "PRIVATE"
    HOSPITAL = "HOSPITAL"
    ADMIN = "ADMIN"


class PatientCreateRequest(APIModel):
    patient_initial: str = Field(min_length=1, max_length=20)
    sex: str = Field(default="UNKNOWN")
    birth_year: int | None = Field(default=None, ge=1900, le=2100)
    birth_date: date | None = None
    consent_date: date | None = None
    visit_date: date
    phone: str | None = None
    local_mrn: str | None = None
    diagnosis_code: str | None = None
    procedure_code: str | None = None
    spinal_region: str = "UNKNOWN"
    surgery_date: date | None = None
    surgeon_user_id: UUID | None = None
    coordinator_user_id: UUID | None = None


class PatientCreateResponse(APIModel):
    patient_id: UUID
    case_id: UUID
    registration_no: str
    current_step: str = "TAB_1"


class ClinicalUpdateRequest(APIModel):
    comorbidities: list[str] | None = None
    diagnosis_code: str | None = None
    diagnosis_detail: str | None = None
    procedure_code: str | None = None
    spinal_region: str | None = None
    surgery_date: date | None = None
    symptom_duration_weeks: float | None = None
    baseline_neuro_deficit_yn: bool | None = None
    preop_medication_jsonb: list[dict] | None = None
    preop_image_findings: str | None = None
    surgery_level: str | None = None
    approach_type: str | None = None
    laterality: str | None = None
    operation_minutes: int | None = Field(default=None, ge=0)
    estimated_blood_loss_ml: int | None = Field(default=None, ge=0)
    anesthesia_type: str | None = None
    implant_used_yn: bool | None = None
    discharge_date: date | None = None
    hospital_stay_days: float | None = Field(default=None, ge=0)
    adverse_events_jsonb: list[dict] | None = None
    intraop_note: str | None = None


class OutcomeUpdateRequest(APIModel):
    complication_yn: bool | None = None
    complication_detail: str | None = None
    readmission_30d_yn: bool | None = None
    reoperation_yn: bool | None = None
    surgeon_global_outcome: int | None = Field(default=None, ge=1, le=5)
    return_to_work_yn: bool | None = None
    final_note: str | None = None
    outcome_completed_at: datetime | None = None


class MemoUpdateRequest(APIModel):
    visibility: MemoVisibility = MemoVisibility.PRIVATE
    memo_text: str = Field(min_length=1)


class LockRequest(APIModel):
    is_locked: bool
    reason: str | None = None


class PromSendRequest(APIModel):
    timepoint_code: TimepointCode
    expires_in_days: int | None = Field(default=None, ge=1, le=30)
    remarks: str | None = None


class PatientListItem(APIModel):
    patient_id: UUID
    case_id: UUID
    no: int
    registration_no: str
    patient_initial: str
    gender_age: str
    visit_date: date
    surgery_date: date | None = None
    diagnosis_code: str | None = None
    procedure_code: str | None = None
    is_locked: bool
    has_memo: bool
    db_status: dict
    prom_alimtalk: dict


class PatientListResponse(APIModel):
    pagination: PaginationMeta
    patients: list[PatientListItem]


class MemoResponse(APIModel):
    memo_id: UUID
    visibility: str
    memo_text: str
    created_at: datetime
    created_by: UUID | None = None
