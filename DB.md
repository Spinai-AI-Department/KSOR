# KSOR Database Structure

PostgreSQL · 7 schemas · 47 tables · RLS-enforced multi-tenancy (no FK constraints)

---

## Schemas Overview

| Schema | Tables | Purpose |
|--------|--------|---------|
| `patient` | 1 | Patient master |
| `vault` | 1 | Encrypted PII (SHA-256 hashed) |
| `clinical` | 8 | Case records & clinical data |
| `survey` | 5 | PROM survey flow |
| `messaging` | 4 | AlimTalk outbox & delivery |
| `auth` | 7 | Users, sessions, roles |
| `ref` | 6 | Reference/lookup data |
| `audit` | 3 | API request & change logs (partitioned) |
| `ops` | 6 | Export, backup, jobs, heartbeat |

---

## `patient` — Patient Master

| Table | PK | Description |
|-------|-----|-------------|
| **patient** | `patient_id` | Core patient record (patient_initial, sex, birth_year, hospital_code) |

## `vault` — Encrypted PII

| Table | PK | Description |
|-------|-----|-------------|
| **patient_identity** | `patient_id` | SHA-256 hashed phone/birth_ymd for survey verification. 1:1 with `patient.patient` |

## `clinical` — Case & Clinical Data

| Table | PK | Links to | Description |
|-------|-----|----------|-------------|
| **case_record** | `case_id` | `patient.patient_id`, `auth.user_id` (surgeon/coordinator) | One patient can have multiple cases. Core case info: visit_date, surgery_date, diagnosis_code, procedure_code, case_status, is_locked |
| **case_initial_form** | `case_id` | `case_record` (1:1) | Pre-op data: comorbidities (jsonb), diagnosis_detail, symptom_duration |
| **case_extended_form** | `case_id` | `case_record` (1:1) | Surgery details: approach_type, surgery_level, operation_minutes, blood_loss, hospital_stay, adverse_events (jsonb) |
| **case_outcome_form** | `case_id` | `case_record` (1:1) | Post-op outcomes: complication_yn, reoperation_yn, readmission_30d, surgeon_global_outcome |
| **case_followup_visit** | `followup_id` | `case_record`, `ref.timepoint` | Follow-up visit records per timepoint |
| **case_memo** | `memo_id` | `case_record` | Free-text notes per case |
| **case_lock_history** | `lock_event_id` | `case_record` | Audit trail for case lock/unlock |
| **registration_counter** | `hospital_code` | `ref.hospital` | Auto-increment registration numbers per hospital |

## `survey` — PROM Survey Flow

| Table | PK | Links to | Description |
|-------|-----|----------|-------------|
| **prom_request** | `request_id` | `case_record`, `patient` | Survey invitation sent to patient. Has `token_uuid` for URL, `token_status` (READY → OPENED → VERIFIED → SUBMITTED / EXPIRED) |
| **prom_submission** | `submission_id` | `prom_request`, `case_record` | Completed survey with computed scores (vas_back, vas_leg, odi_score, eq_vas, satisfaction) |
| **prom_answer** | composite | `prom_submission`, `case_record` | Individual question answers (question_code, answer_value) |
| **prom_draft** | composite | `prom_request`, `case_record` | Auto-saved draft answers before final submission |
| **verify_attempt** | `verify_attempt_id` | `prom_request` | Identity verification log (birth_ymd / phone_last4) |

## `messaging` — AlimTalk Outbox

| Table | PK | Links to | Description |
|-------|-----|----------|-------------|
| **message_outbox** | `message_id` | `case_record`, `patient`, `prom_request` | Transactional outbox for Kakao AlimTalk. Status: QUEUED → SENT → DELIVERED / FAILED |
| **message_attempt** | `attempt_id` | `message_outbox` | Delivery attempt log |
| **alimtalk_template** | `template_id` | `ref.timepoint` | Message templates per timepoint |
| **vendor_webhook_event** | `webhook_event_id` | `message_outbox` | Inbound delivery receipts |

## `auth` — Users & Sessions

| Table | PK | Links to | Description |
|-------|-----|----------|-------------|
| **user_account** | `user_id` | `ref.hospital`, `role_catalog` | Login credentials, role, hospital assignment |
| **auth_session** | `session_id` | `user_account` | JWT sessions with refresh tokens |
| **login_event** | `login_event_id` | `user_account` | Login attempt audit log |
| **password_reset_token** | `reset_token_id` | `user_account` | Password reset flow |
| **user_password_history** | `password_history_id` | `user_account` | Previous password hashes |
| **role_catalog** | `role_code` | — | ADMIN, PI, SUB_PI, CRC, READONLY |
| **hospital_ip_allowlist** | `allowlist_id` | `ref.hospital` | IP restrictions per hospital |

## `ref` — Reference / Lookup Data

| Table | PK | Description |
|-------|-----|-------------|
| **hospital** | `hospital_code` | Hospital master (H001, H002, ...) |
| **diagnosis_code** | `diagnosis_code` | ICD diagnosis codes |
| **procedure_code** | `procedure_code` | Surgery procedure codes |
| **timepoint** | `timepoint_code` | PRE_OP, POST_1M, POST_3M, POST_6M, POST_1Y |
| **prom_instrument** | `instrument_code` | VAS, ODI, NDI, EQ5D5L, FOLLOWUP |
| **prom_question_bank** | composite | Survey question definitions per instrument |

## `audit` — Logging (Partitioned by Year)

| Table | Description |
|-------|-------------|
| **api_request_log** | Every API request (partitioned: 2026, 2027, default) |
| **change_log** | Data change audit trail (partitioned: 2026, 2027, default) |
| **security_event** | Security-related events |

## `ops` — Operations

| Table | Description |
|-------|-------------|
| **data_export_request** | CSV/data export jobs |
| **export_download_log** | Download tracking |
| **backup_run_log** | DB backup history |
| **job_run_log** | Background job execution log |
| **idempotency_key** | Duplicate request prevention |
| **node_heartbeat** | Worker health monitoring |

---

## Entity Relationship Diagram

```
patient.patient (patient_id)
  ├── vault.patient_identity (1:1) — encrypted PII
  ├── clinical.case_record (1:N) — one patient, many cases
  │     ├── clinical.case_initial_form (1:1)
  │     ├── clinical.case_extended_form (1:1)
  │     ├── clinical.case_outcome_form (1:1)
  │     ├── clinical.case_followup_visit (1:N)
  │     ├── clinical.case_memo (1:N)
  │     ├── clinical.case_lock_history (1:N)
  │     ├── survey.prom_request (1:N) — per timepoint
  │     │     ├── survey.verify_attempt (1:N)
  │     │     ├── survey.prom_draft (1:1)
  │     │     └── survey.prom_submission (1:1)
  │     │           └── survey.prom_answer (1:N)
  │     └── messaging.message_outbox (1:N)
  │           └── messaging.message_attempt (1:N)
  └── (hospital_code) → ref.hospital

auth.user_account (user_id)
  ├── auth.auth_session (1:N)
  ├── auth.login_event (1:N)
  ├── auth.password_reset_token (1:N)
  ├── auth.user_password_history (1:N)
  └── (hospital_code) → ref.hospital
      (role_code) → auth.role_catalog
```

---

## Multi-Tenancy & Row-Level Security

All core tables include `hospital_code`. PostgreSQL RLS policies filter rows automatically based on session context variables set per request:

| Variable | Description |
|----------|-------------|
| `app.user_id` | Authenticated user's ID |
| `app.hospital_code` | User's hospital |
| `app.role` | User's role (ADMIN, PI, etc.) |

These are set by `server/app/middleware/request_context.py` on every authenticated request.

---

## Key Status Enums

**`case_status`** (clinical.case_record):
`DRAFT` → `IN_PROGRESS` → `COMPLETED` → `ARCHIVED`

**`token_status`** (survey.prom_request):
`READY` → `SENT` → `OPENED` → `VERIFIED` → `SUBMITTED` | `EXPIRED`

**`message_outbox.status`**:
`QUEUED` → `SENDING` → `SENT` → `DELIVERED` | `FAILED` | `DLQ`

**`role_code`** (auth.role_catalog):
`ADMIN`, `PI`, `SUB_PI`, `CRC`, `READONLY`

---

## Views

| View | Schema | Description |
|------|--------|-------------|
| **v_case_status** | `analytics` | Joins case_record + patient + all form tables + latest PROM request/submission. Used by patient list API. |

---

## Connection

```
Host:     localhost:5432
Database: ksor
User:     ksor_app
Password: ksor_dev_2024
```
