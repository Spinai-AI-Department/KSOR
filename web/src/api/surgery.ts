import { api } from './client'

// Surgery data is managed through patient clinical/outcome updates
// These types represent the form data for the surgery entry page

export type Approach = 'Full-endo' | 'UBE' | 'Biportal' | 'Open'
export type Technique = 'interlaminar' | 'transforaminal'

export interface ClinicalData {
  diagnosis_code?: string
  diagnosis_detail?: string
  procedure_code?: string
  spinal_region?: string
  surgery_date?: string
  symptom_duration_weeks?: number
  baseline_neuro_deficit_yn?: boolean
  surgery_level?: string
  approach_type?: string
  laterality?: string
  operation_minutes?: number
  estimated_blood_loss_ml?: number
  anesthesia_type?: string
  implant_used_yn?: boolean
  discharge_date?: string
  hospital_stay_days?: number
  intraop_note?: string
  comorbidities?: string[]
}

export interface OutcomeData {
  complication_yn?: boolean
  complication_detail?: string
  readmission_30d_yn?: boolean
  reoperation_yn?: boolean
  surgeon_global_outcome?: number
  return_to_work_yn?: boolean
  final_note?: string
}

export const surgeryService = {
  updateClinical: (caseId: string, data: ClinicalData, token: string) =>
    api.patch<unknown>(`/patients/${caseId}/clinical`, data, token),

  updateOutcomes: (caseId: string, data: OutcomeData, token: string) =>
    api.patch<unknown>(`/patients/${caseId}/outcomes`, data, token),
}
