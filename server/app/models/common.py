from __future__ import annotations

from datetime import date, datetime
from typing import Any, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class PaginationMeta(APIModel):
    current_page: int
    total_pages: int
    total_elements: int
    page_size: int


T = TypeVar("T")


class ApiEnvelope(APIModel, Generic[T]):
    status: str = "success"
    message: str
    data: T | None = None


class IdResponse(APIModel):
    id: UUID


class DateRangeFilter(APIModel):
    start_date: date | None = None
    end_date: date | None = None


class AuditMeta(APIModel):
    request_id: UUID
    timestamp: datetime
