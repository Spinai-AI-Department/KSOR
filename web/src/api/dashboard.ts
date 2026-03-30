import { api } from './client'

export interface DashboardStats {
  total_surgeries: number
  monthly_surgeries: number
  prom_pending_cases: number
  avg_op_time_min: number
  complications_count: number
}

export interface VasOdiDataPoint {
  timepoint: string
  vas_back: number | null
  vas_leg: number | null
  odi: number | null
}

export interface SurgeryTypeDistribution {
  label: string
  count: number
  percentage: number
}

export interface DashboardData {
  stats: DashboardStats
  vas_odi_trend: VasOdiDataPoint[]
  surgery_type_distribution: SurgeryTypeDistribution[]
}

interface SummaryResponse {
  total_surgeries: number
  monthly_surgeries: number
  prom_pending_cases: number
  avg_op_time_min: number | null
  complications_count: number
}

interface SurgeriesResponse {
  monthly_trends: { month: string; count: number }[]
  procedure_ratio: { label: string; count: number; percentage: number }[]
  diagnosis_ratio: { label: string; count: number; percentage: number }[]
}

interface OutcomesResponse {
  prom_trends: { timepoint: string; vas_back: number | null; vas_leg: number | null; odi: number | null; ndi: number | null }[]
  outcome_summary: { average_los_days: number | null; complication_rate: number | null }
}

export interface ApproachComparison {
  approach_type: string
  avg_op_time_minutes: number | null
  avg_blood_loss_ml: number | null
  avg_hospital_days: number | null
  complication_rate: number | null
  case_count: number
}

export interface SatisfactionScore {
  score: number
  count: number
  percentage: number
}

export interface PatientOutcomePoint {
  case_id: string
  registration_no: string
  preop_odi: number | null
  postop_odi: number | null
  improvement: number | null
  age: number | null
  approach_type: string | null
  satisfaction_score: number | null
}

export interface StatisticsSummary {
  avg_vas_improvement: number | null
  avg_odi_improvement: number | null
  satisfaction_rate: number | null
  reoperation_rate: number | null
  total_cases: number
}

export interface StatisticsData {
  summary: StatisticsSummary
  approach_comparison: ApproachComparison[]
  satisfaction_scores: SatisfactionScore[]
  patient_outcomes: PatientOutcomePoint[]
}

export interface RecentFollowup {
  patient_id: string
  case_id: string
  registration_no: string
  patient_initial: string
  timepoint: string
  status: string
  date: string
}

export const dashboardService = {
  getData: async (token: string): Promise<DashboardData> => {
    const [summary, surgeries, outcomes] = await Promise.all([
      api.get<SummaryResponse>('/dashboard/summary', token),
      api.get<SurgeriesResponse>('/dashboard/my-surgeries', token),
      api.get<OutcomesResponse>('/dashboard/outcomes', token),
    ])

    return {
      stats: {
        total_surgeries: summary.total_surgeries,
        monthly_surgeries: summary.monthly_surgeries,
        prom_pending_cases: summary.prom_pending_cases,
        avg_op_time_min: summary.avg_op_time_min ?? 0,
        complications_count: summary.complications_count ?? 0,
      },
      vas_odi_trend: outcomes.prom_trends.map(t => ({
        timepoint: t.timepoint,
        vas_back: t.vas_back,
        vas_leg: t.vas_leg,
        odi: t.odi,
      })),
      surgery_type_distribution: surgeries.procedure_ratio,
    }
  },

  getStatistics: (token: string) =>
    api.get<StatisticsData>('/dashboard/statistics', token),

  getRecentFollowups: (token: string) =>
    api.get<RecentFollowup[]>('/dashboard/recent-followups', token),
}
