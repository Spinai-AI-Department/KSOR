import { api } from './client'

export interface ReportParams {
  date_from: string   // YYYY-MM-DD
  date_to: string     // YYYY-MM-DD
}

export interface ReportSummary {
  total_surgeries: number
  success_rate: number
  complication_rate: number
  avg_hospital_days: number
}

export interface MonthlyDataPoint {
  month: string
  surgeries: number
  complications: number
}

export interface SurgeryOutcome {
  type: string
  success: number
  improved: number
}

export interface ReportData {
  summary: ReportSummary
  monthly_trend: MonthlyDataPoint[]
  surgery_outcomes: SurgeryOutcome[]
}

export const reportService = {
  getData: (params: ReportParams, token: string) => {
    const query = new URLSearchParams(params).toString()
    return api.get<ReportData>(`/reports?${query}`, token)
  },

  downloadPdf: async (params: ReportParams, token: string) => {
    const query = new URLSearchParams(params).toString()
    const res = await fetch(
      `${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'}/reports/pdf?${query}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) throw new Error('PDF 다운로드에 실패했습니다.')
    return res.blob()
  },
}
