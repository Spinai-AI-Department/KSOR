import { api } from './client'

export interface SurveyStatus {
  request_id: string
  token_status: string
  expired: boolean
  opened_at: string | null
  verified_at: string | null
  submitted_at: string | null
  hospital_name: string | null
  doctor_name: string | null
  patient_name_masked: string | null
  timepoint_label: string | null
}

export interface SurveyVerifyRequest {
  method_code: 'birth_ymd' | 'phone_last4'
  value: string
}

export interface SurveyVerifyResponse {
  verified: boolean
  survey_token: string
  expires_at: string
}

export interface SurveyQuestion {
  step: number
  category: string
  instrument_code: string
  question_code: string
  title: string
  ui_type: string
  options: { value: number | string; label: string }[] | null
  min_val: number | null
  max_val: number | null
}

export interface SurveyQuestionsResponse {
  patient_name: string | null
  doctor_name: string | null
  timepoint_label: string | null
  total_questions: number
  questions: SurveyQuestion[]
}

export interface SurveySubmitResponse {
  is_completed: boolean
  sync_status: string
  submitted_at: string
}

export const surveyService = {
  /** Get survey status (no auth required) */
  getStatus: (tokenUuid: string) =>
    api.get<SurveyStatus>(`/survey/${tokenUuid}/status`),

  /** Verify patient identity */
  verify: (tokenUuid: string, data: SurveyVerifyRequest) =>
    api.post<SurveyVerifyResponse>(`/survey/${tokenUuid}/verify`, data),

  /** Fetch survey questions (requires survey token) */
  getQuestions: (tokenUuid: string, surveyToken: string) =>
    api.get<SurveyQuestionsResponse>(`/survey/${tokenUuid}/questions`, surveyToken),

  /** Save draft answer */
  saveDraft: (tokenUuid: string, data: { question_id: string; answer_value: unknown }, surveyToken: string) =>
    api.patch<void>(`/survey/${tokenUuid}/save`, data, surveyToken),

  /** Submit all answers */
  submit: (tokenUuid: string, answers: Record<string, unknown>, surveyToken: string) =>
    api.post<SurveySubmitResponse>(`/survey/${tokenUuid}/submit`, { answers }, surveyToken),
}
