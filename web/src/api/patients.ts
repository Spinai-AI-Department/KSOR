import { api } from './client'

export type FollowUpStatus = 'Completed' | 'Pending' | 'Not Due' | 'Overdue'

// Backend's actual patient list item shape
export interface PatientListItem {
  patient_id: string
  case_id: string
  no: number
  registration_id: string
  patient_initial: string
  gender_age: string
  visit_date: string
  surgery_date: string | null
  diagnosis_code: string | null
  procedure_code: string | null
  is_locked: boolean
  has_memo: boolean
  db_status: Record<string, unknown>
  prom_alimtalk: Record<string, unknown>
}

// Frontend-friendly patient (mapped from backend)
export interface Patient {
  id: string
  caseId: string
  registrationId: string
  name: string
  genderAge: string
  visitDate: string
  surgeryDate: string | null
  diagnosisCode: string | null
  procedureCode: string | null
  isLocked: boolean
  hasMemo: boolean
  dbStatus: Record<string, unknown>
  promAlimtalk: Record<string, unknown>
}

export interface CreatePatientRequest {
  patient_initial: string
  sex: 'M' | 'F' | 'OTHER' | 'UNKNOWN'
  birth_year?: number
  birth_date?: string  // YYYY-MM-DD — enables birth_ymd survey verification
  visit_date: string
  phone?: string
  local_mrn?: string
  diagnosis_code?: string
  procedure_code?: string
  spinal_region?: string
  surgery_date?: string
}

export interface CreatePatientResponse {
  patient_id: string
  case_id: string
  registration_id: string
  current_step: string
}

export interface PatientListParams {
  keyword?: string
  procedure_code?: string
  diagnosis_code?: string
  status_filter?: string
  sex?: string
  surgery_date_from?: string
  surgery_date_to?: string
  page?: number
  size?: number
}

export interface PaginatedPatients {
  items: Patient[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface BackendPatientList {
  pagination: {
    current_page: number
    total_pages: number
    total_elements: number
    page_size: number
  }
  patients: PatientListItem[]
}

function mapPatient(p: PatientListItem): Patient {
  return {
    id: p.patient_id,
    caseId: p.case_id,
    registrationId: p.registration_id,
    name: p.patient_initial,
    genderAge: p.gender_age,
    visitDate: p.visit_date,
    surgeryDate: p.surgery_date,
    diagnosisCode: p.diagnosis_code,
    procedureCode: p.procedure_code,
    isLocked: p.is_locked,
    hasMemo: p.has_memo,
    dbStatus: p.db_status,
    promAlimtalk: p.prom_alimtalk,
  }
}

export interface PromSendRequest {
  timepoint_code: string
  expires_in_days?: number
  remarks?: string
}

export interface CaseDetail {
  case_id: string
  patient_id: string
  registration_id: string
  patient_initial: string
  sex: string
  birth_year: number | null
  visit_date: string
  surgery_date: string | null
  diagnosis_code: string | null
  procedure_code: string | null
  spinal_region: string | null
  initial_form: {
    comorbidities: string[]
    diagnosis_detail: string | null
    symptom_duration_weeks: number | null
    baseline_neuro_deficit_yn: boolean | null
    additional_attributes: Record<string, unknown> | null
  } | null
  extended_form: {
    surgery_level: string | null
    approach_type: string | null
    laterality: string | null
    operation_minutes: number | null
    estimated_blood_loss_ml: number | null
    anesthesia_type: string | null
    implant_used_yn: boolean | null
    hospital_stay_days: number | null
    intraop_note: string | null
  } | null
  outcome_form: {
    complication_yn: boolean | null
    complication_detail: string | null
    readmission_30d_yn: boolean | null
    reoperation_yn: boolean | null
    final_note: string | null
  } | null
}

export const patientService = {
  getDetail: (caseId: string, token: string) =>
    api.get<CaseDetail>(`/patients/${caseId}`, token),

  list: async (params: PatientListParams, token: string): Promise<PaginatedPatients> => {
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)])
    ).toString()
    const res = await api.get<BackendPatientList>(`/patients${query ? `?${query}` : ''}`, token)
    return {
      items: res.patients.map(mapPatient),
      total: res.pagination.total_elements,
      page: res.pagination.current_page,
      pageSize: res.pagination.page_size,
      totalPages: res.pagination.total_pages,
    }
  },

  create: (data: CreatePatientRequest, token: string) =>
    api.post<CreatePatientResponse>('/patients', data, token),

  updateClinical: (caseId: string, data: Record<string, unknown>, token: string) =>
    api.patch<unknown>(`/patients/${caseId}/clinical`, data, token),

  updateOutcomes: (caseId: string, data: Record<string, unknown>, token: string) =>
    api.patch<unknown>(`/patients/${caseId}/outcomes`, data, token),

  sendAlimtalk: (caseId: string, data: PromSendRequest, token: string) =>
    api.post<unknown>(`/patients/${caseId}/prom-alimtalk`, data, token),

  getMemo: (caseId: string, token: string) =>
    api.get<{ memo_id: string; visibility: string; memo_text: string; created_at: string }>(`/patients/${caseId}/memo`, token),

  putMemo: (caseId: string, data: { visibility: string; memo_text: string }, token: string) =>
    api.put<unknown>(`/patients/${caseId}/memo`, data, token),

  setLock: (caseId: string, data: { is_locked: boolean; reason?: string }, token: string) =>
    api.patch<unknown>(`/patients/${caseId}/lock`, data, token),

  delete: (caseId: string, token: string) =>
    api.delete<unknown>(`/patients/${caseId}`, token),
}
