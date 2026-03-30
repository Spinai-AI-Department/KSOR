import { api } from './client'

export type Approach = 'Full-endo' | 'UBE' | 'Open'
export type Technique = 'interlaminar' | 'transforaminal'

export interface Proms {
  back_vas?: number
  leg_vas?: number
  odi?: number
  eq5d?: number
  ndi?: number
}

export interface SurgeryRecord {
  id: string
  patient_id: string
  surgery_date: string
  surgeon: string
  diagnosis: string
  op_level: string
  op_time_min: number
  blood_loss_ml: number
  hospital_days: number
  approach: Approach
  technique: Technique
  device: string
  implants: {
    cage: boolean
    screws: boolean
    none: boolean
  }
  conversion_to_open: boolean
  pre_op_proms: Proms
  created_at?: string
}

export type CreateSurgeryRequest = Omit<SurgeryRecord, 'id' | 'created_at'>

export const surgeryService = {
  list: (patientId: string, token: string) =>
    api.get<SurgeryRecord[]>(`/patients/${patientId}/surgeries`, token),

  get: (surgeryId: string, token: string) =>
    api.get<SurgeryRecord>(`/surgeries/${surgeryId}`, token),

  create: (data: CreateSurgeryRequest, token: string) =>
    api.post<SurgeryRecord>('/surgeries', data, token),

  update: (surgeryId: string, data: Partial<CreateSurgeryRequest>, token: string) =>
    api.patch<SurgeryRecord>(`/surgeries/${surgeryId}`, data, token),

  delete: (surgeryId: string, token: string) =>
    api.delete<void>(`/surgeries/${surgeryId}`, token),
}
