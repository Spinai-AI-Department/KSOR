# API Services

All services live in `src/api/` and communicate with the backend over HTTP.
The backend wraps every response in an envelope: `{ status, message, data }`.
The `client.ts` automatically unwraps `data`.

## Setup

Set the backend URL in `.env.local`:

```
VITE_API_BASE_URL=http://localhost:8000
```

Defaults to `http://localhost:8000` if unset. All paths are prefixed with `/api`.

---

## client.ts

Base fetch wrapper used by all services. Attaches `Content-Type` and `Authorization` headers, unwraps the `data` field from the response envelope, and throws on non-2xx responses with the backend's `message` field.

```ts
api.get<T>(path, token?)
api.post<T>(path, body, token?)
api.put<T>(path, body, token?)
api.patch<T>(path, body, token?)
api.delete<T>(path, token?)
api.rawFetch(path, init?)  // For blob downloads (e.g., PDF)
```

---

## auth.ts — `/api/auth`

| Method | Endpoint | Request | Response (in `data`) |
|---|---|---|---|
| `login(data)` | `POST /auth/login` | `{ login_id, password }` | `{ access_token, refresh_token, token_type, expires_in, require_password_change, session_id, user_info }` |
| `getMe(token)` | `GET /auth/me` | — | `{ user_id, login_id, name, hospital_code, role, email, phone, is_first_login, last_login_at }` |
| `updateProfile(data, token)` | `PUT /auth/me/info` | `{ email?, phone? }` | `void` |
| `changePassword(data, token)` | `PUT /auth/password` | `{ current_password, new_password, new_password_confirm }` | `void` |
| `refresh(refreshToken)` | `POST /auth/refresh` | `{ refresh_token }` | `{ access_token, refresh_token }` |
| `logout(token)` | `POST /auth/logout` | `{}` | `void` |

**`user_info`** shape:
```ts
{ user_id: string, name: string, hospital_code: string | null, role: string }
```

---

## patients.ts — `/api/patients`

| Method | Endpoint | Request | Response (in `data`) |
|---|---|---|---|
| `list(params, token)` | `GET /patients?keyword=&page=&size=` | Query params | `{ pagination, patients[] }` |
| `create(data, token)` | `POST /patients` | `CreatePatientRequest` | `{ patient_id, case_id, registration_no, current_step }` |
| `updateClinical(caseId, data, token)` | `PATCH /patients/:caseId/clinical` | `ClinicalData` | — |
| `updateOutcomes(caseId, data, token)` | `PATCH /patients/:caseId/outcomes` | `OutcomeData` | — |
| `sendAlimtalk(caseId, data, token)` | `POST /patients/:caseId/prom-alimtalk` | `{ timepoint_code, expires_in_days?, remarks? }` | — |
| `getMemo(caseId, token)` | `GET /patients/:caseId/memo` | — | `{ memo_id, visibility, memo_text, created_at }` |
| `putMemo(caseId, data, token)` | `PUT /patients/:caseId/memo` | `{ visibility, memo_text }` | — |
| `setLock(caseId, data, token)` | `PATCH /patients/:caseId/lock` | `{ is_locked, reason? }` | — |

**List params:** `keyword`, `procedure_code`, `diagnosis_code`, `status_filter`, `page`, `size`

**`CreatePatientRequest`:**
```ts
{
  patient_initial: string
  sex: 'M' | 'F' | 'OTHER' | 'UNKNOWN'
  birth_year?: number
  visit_date: string        // YYYY-MM-DD
  phone?: string
  local_mrn?: string
  diagnosis_code?: string
  procedure_code?: string
  spinal_region?: string
  surgery_date?: string
}
```

**Patient list item shape (backend):**
```ts
{
  patient_id, case_id, no, registration_no, patient_initial,
  gender_age, visit_date, surgery_date, diagnosis_code,
  procedure_code, is_locked, has_memo, db_status, prom_alimtalk
}
```

---

## surgery.ts — `/api/patients/:caseId`

Surgery data is managed through clinical/outcome updates on patient cases.

| Method | Endpoint | Request | Response |
|---|---|---|---|
| `updateClinical(caseId, data, token)` | `PATCH /patients/:caseId/clinical` | `ClinicalData` | — |
| `updateOutcomes(caseId, data, token)` | `PATCH /patients/:caseId/outcomes` | `OutcomeData` | — |

**`ClinicalData` fields:** `diagnosis_code`, `diagnosis_detail`, `procedure_code`, `spinal_region`, `surgery_date`, `symptom_duration_weeks`, `baseline_neuro_deficit_yn`, `surgery_level`, `approach_type`, `laterality`, `operation_minutes`, `estimated_blood_loss_ml`, `anesthesia_type`, `implant_used_yn`, `discharge_date`, `hospital_stay_days`, `intraop_note`, `comorbidities[]`

**`OutcomeData` fields:** `complication_yn`, `complication_detail`, `readmission_30d_yn`, `reoperation_yn`, `surgeon_global_outcome`, `return_to_work_yn`, `final_note`

---

## dashboard.ts — `/api/dashboard`

Aggregates three backend endpoints into one `getData()` call:

| Backend Endpoint | Description |
|---|---|
| `GET /dashboard/summary` | `{ total_surgeries, monthly_surgeries, prom_pending_cases }` |
| `GET /dashboard/my-surgeries` | `{ monthly_trends[], procedure_ratio[], diagnosis_ratio[] }` |
| `GET /dashboard/outcomes` | `{ prom_trends[], outcome_summary }` |

**Merged `DashboardData` shape:**
```ts
{
  stats: { total_surgeries, monthly_surgeries, prom_pending_cases, avg_op_time_min, complications_count },
  vas_odi_trend: [{ timepoint, vas_back, vas_leg, odi }],
  surgery_type_distribution: [{ label, count, percentage }]
}
```

---

## reports.ts — `/api/reports`

| Method | Endpoint | Description |
|---|---|---|
| `getData(params, token)` | `GET /reports?date_from=&date_to=` | Summary stats + monthly trend + outcomes by surgery type |
| `downloadPdf(params, token)` | `GET /reports/pdf?date_from=&date_to=` | Returns a `Blob` for browser download |

**Params:** `date_from` and `date_to` in `YYYY-MM-DD` format.

---

## survey.ts — `/api/survey`

Public-facing survey flow for patients (no auth token for status/verify).

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `getStatus(tokenUuid)` | `GET /survey/:tokenUuid/status` | None | Survey request status |
| `verify(tokenUuid, data)` | `POST /survey/:tokenUuid/verify` | None | Verify patient identity |
| `getQuestions(tokenUuid, surveyToken)` | `GET /survey/:tokenUuid/questions` | Survey JWT | Fetch questions |
| `saveDraft(tokenUuid, data, surveyToken)` | `PATCH /survey/:tokenUuid/save` | Survey JWT | Save a single draft answer |
| `submit(tokenUuid, answers, surveyToken)` | `POST /survey/:tokenUuid/submit` | Survey JWT | Submit all answers |

**Verify request:** `{ method_code: 'birth_ymd' | 'phone_last4', value: string }`
**Verify response:** `{ verified, survey_token, expires_at }`
**Submit response:** `{ is_completed, sync_status, submitted_at }`
