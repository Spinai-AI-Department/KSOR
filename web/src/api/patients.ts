import { api } from './client'

export type FollowUpStatus = 'Completed' | 'Pending' | 'Not Due' | 'Overdue'

export interface Patient {
  id: string
  name: string
  age: number
  gender: 'M' | 'F'
  phone?: string
  preOp: FollowUpStatus
  m1: FollowUpStatus
  m3: FollowUpStatus
  m6: FollowUpStatus
  yr1: FollowUpStatus
}

export interface CreatePatientRequest {
  name: string
  age: number
  gender: 'M' | 'F'
  phone?: string
}

export interface PatientListParams {
  search_id?: string
  search_name?: string
  follow_up_period?: string
  page?: number
  page_size?: number
}

export interface PaginatedPatients {
  items: Patient[]
  total: number
  page: number
  page_size: number
}

export interface SendAlimtalkRequest {
  patient_id: string
  follow_up_period: 'preOp' | 'm1' | 'm3' | 'm6' | 'yr1'
}

export interface SendAlimtalkResponse {
  success: boolean
  message_id?: string
  prom_url?: string
}

export const patientService = {
  list: (params: PatientListParams, token: string) => {
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)])
    ).toString()
    return api.get<PaginatedPatients>(`/patients${query ? `?${query}` : ''}`, token)
  },

  get: (patientId: string, token: string) =>
    api.get<Patient>(`/patients/${patientId}`, token),

  create: (data: CreatePatientRequest, token: string) =>
    api.post<Patient>('/patients', data, token),

  update: (patientId: string, data: Partial<CreatePatientRequest>, token: string) =>
    api.patch<Patient>(`/patients/${patientId}`, data, token),

  delete: (patientId: string, token: string) =>
    api.delete<void>(`/patients/${patientId}`, token),

  sendAlimtalk: (data: SendAlimtalkRequest, token: string) =>
    api.post<SendAlimtalkResponse>('/patients/alimtalk', data, token),
}
