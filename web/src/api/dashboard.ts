import { api } from './client'

export interface DashboardStats {
  total_surgeries: number
  avg_op_time_min: number
  complications_count: number
  paper_count: number
}

export interface VasOdiDataPoint {
  month: string
  back_vas: number
  leg_vas: number
  odi: number
}

export interface SurgeryTypeDistribution {
  name: string
  value: number
}

export interface RecentFollowUp {
  patient_id: string
  status: '입력 완료' | '대기 중' | '지연'
  date: string
}

export interface DashboardData {
  stats: DashboardStats
  vas_odi_trend: VasOdiDataPoint[]
  surgery_type_distribution: SurgeryTypeDistribution[]
  recent_follow_ups: RecentFollowUp[]
}

export const dashboardService = {
  getData: (token: string) =>
    api.get<DashboardData>('/dashboard', token),
}
