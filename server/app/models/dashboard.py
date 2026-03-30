from __future__ import annotations

from app.models.common import APIModel


class DashboardSummary(APIModel):
    total_surgeries: int
    monthly_surgeries: int
    prom_pending_cases: int


class MonthlyTrendItem(APIModel):
    month: str
    count: int


class RatioItem(APIModel):
    label: str
    count: int
    percentage: float


class SurgeriesResponse(APIModel):
    monthly_trends: list[MonthlyTrendItem]
    procedure_ratio: list[RatioItem]
    diagnosis_ratio: list[RatioItem]


class PromTrendItem(APIModel):
    timepoint: str
    vas_back: float | None = None
    vas_leg: float | None = None
    odi: float | None = None
    ndi: float | None = None


class OutcomeSummary(APIModel):
    average_los_days: float | None = None
    complication_rate: float | None = None


class OutcomesResponse(APIModel):
    prom_trends: list[PromTrendItem]
    outcome_summary: OutcomeSummary


class BenchmarkTrendItem(APIModel):
    timepoint: str
    my_hospital: float | None = None
    ksor_average: float | None = None


class OverallImprovementRate(APIModel):
    indicator: str
    my_hospital: float | None = None
    ksor_average: float | None = None


class BenchmarkResponse(APIModel):
    odi_improvement_trend: list[BenchmarkTrendItem]
    overall_improvement_rate: OverallImprovementRate
