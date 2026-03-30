from __future__ import annotations

from app.models.common import APIModel


class DashboardSummary(APIModel):
    total_surgeries: int
    monthly_surgeries: int
    prom_pending_cases: int
    avg_op_time_min: float | None = None
    complications_count: int = 0


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


class ApproachComparisonItem(APIModel):
    approach_type: str
    avg_op_time_minutes: float | None = None
    avg_blood_loss_ml: float | None = None
    avg_hospital_days: float | None = None
    complication_rate: float | None = None
    case_count: int = 0


class SatisfactionScoreItem(APIModel):
    score: int
    count: int
    percentage: float


class PatientOutcomePoint(APIModel):
    case_id: str
    registration_no: str
    preop_odi: float | None = None
    postop_odi: float | None = None
    improvement: float | None = None
    age: int | None = None
    approach_type: str | None = None
    satisfaction_score: int | None = None


class StatisticsSummary(APIModel):
    avg_vas_improvement: float | None = None
    avg_odi_improvement: float | None = None
    satisfaction_rate: float | None = None
    reoperation_rate: float | None = None
    total_cases: int = 0


class StatisticsResponse(APIModel):
    summary: StatisticsSummary
    approach_comparison: list[ApproachComparisonItem]
    satisfaction_scores: list[SatisfactionScoreItem]
    patient_outcomes: list[PatientOutcomePoint]


class RecentFollowupItem(APIModel):
    patient_id: str
    case_id: str
    registration_no: str
    patient_initial: str
    timepoint: str
    status: str
    date: str
