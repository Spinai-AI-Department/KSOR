from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.models.common import APIModel


class SiteExportFilter(APIModel):
    start_date: str | None = None
    end_date: str | None = None
    procedure_code: str | None = None
    diagnosis_code: str | None = None
    timepoint_code: str | None = None


class GlobalExportRequestCreate(APIModel):
    reason: str = Field(min_length=10)
    filter_jsonb: dict = Field(default_factory=dict)


class GlobalExportApprovalRequest(APIModel):
    approved: bool
    approved_until: datetime | None = None
    review_comment: str | None = None


class GlobalExportRequestItem(APIModel):
    export_request_id: UUID
    requester_user_id: UUID
    requester_hospital_code: str | None = None
    export_scope: str
    approval_status: str
    reason: str
    created_at: datetime
    reviewed_at: datetime | None = None
    review_comment: str | None = None
