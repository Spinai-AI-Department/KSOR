from __future__ import annotations

from app.models.common import APIModel


class ReportSummary(APIModel):
    total_surgeries: int = 0
    success_rate: float = 0.0
    complication_rate: float = 0.0
    avg_hospital_days: float = 0.0


class MonthlyTrendItem(APIModel):
    month: str
    surgeries: int = 0
    complications: int = 0


class SurgeryOutcome(APIModel):
    type: str
    success: float = 0.0
    improved: float = 0.0


class ReportResponse(APIModel):
    summary: ReportSummary
    monthly_trend: list[MonthlyTrendItem]
    surgery_outcomes: list[SurgeryOutcome]
