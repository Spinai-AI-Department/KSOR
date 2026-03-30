from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

from app.core.config import settings
from app.core.encryption import crypto
from app.core.exceptions import ConflictError, ForbiddenError, NotFoundError, ValidationError
from app.db.queries import execute, fetch_all, fetch_one, fetch_val
from app.models.common import PaginationMeta
from app.models.patient import (
    ClinicalUpdateRequest,
    LockRequest,
    MemoResponse,
    MemoUpdateRequest,
    OutcomeUpdateRequest,
    PatientCreateRequest,
    PatientCreateResponse,
    PatientListItem,
    PatientListResponse,
    PromSendRequest,
)
from app.services.sql_utils import build_insert_clause, build_set_clause


def _normalize_case_path_param(case_id_or_patient_id: str | UUID) -> str:
    return str(case_id_or_patient_id)


async def list_cases(
    conn: AsyncConnection,
    *,
    page: int = 1,
    size: int = 20,
    keyword: str | None = None,
    procedure_code: str | None = None,
    diagnosis_code: str | None = None,
    status_filter: str | None = None,
) -> PatientListResponse:
    filters = ["1=1"]
    params: list[Any] = []
    if keyword:
        filters.append("(registration_no ILIKE %s OR patient_initial ILIKE %s)")
        pattern = f"%{keyword}%"
        params.extend([pattern, pattern])
    if procedure_code:
        filters.append("procedure_code = %s")
        params.append(procedure_code)
    if diagnosis_code:
        filters.append("diagnosis_code = %s")
        params.append(diagnosis_code)
    if status_filter:
        filters.append("(initial_db_status = %s OR extended_db_status = %s OR outcome_db_status = %s)")
        params.extend([status_filter, status_filter, status_filter])

    where_sql = " AND ".join(filters)
    total = int(
        await fetch_val(
            conn,
            f"SELECT count(*) FROM analytics.v_case_status WHERE {where_sql}",
            params,
            default=0,
        )
    )
    offset = max(page - 1, 0) * size
    rows = await fetch_all(
        conn,
        f"""
        SELECT
            vcs.case_id,
            vcs.patient_id,
            vcs.registration_no,
            vcs.patient_initial,
            vcs.sex,
            vcs.birth_year,
            vcs.visit_date,
            vcs.surgery_date,
            vcs.diagnosis_code,
            vcs.procedure_code,
            vcs.is_locked,
            vcs.initial_db_status,
            vcs.extended_db_status,
            vcs.outcome_db_status,
            vcs.latest_prom_sent_at,
            vcs.latest_prom_status,
            EXISTS (
                SELECT 1 FROM clinical.case_memo cm WHERE cm.case_id = vcs.case_id
            ) AS has_memo
        FROM analytics.v_case_status vcs
        WHERE {where_sql}
        ORDER BY vcs.visit_date DESC, vcs.case_id DESC
        LIMIT %s OFFSET %s
        """,
        [*params, size, offset],
    )
    items: list[PatientListItem] = []
    no = total - offset
    for row in rows:
        age = None
        if row["birth_year"]:
            base_year = row["visit_date"].year if row["visit_date"] else datetime.now().year
            age = max(base_year - int(row["birth_year"]), 0)
        gender_age = f"{row['sex']} / {age if age is not None else '-'}"
        items.append(
            PatientListItem(
                patient_id=row["patient_id"],
                case_id=row["case_id"],
                no=no,
                registration_no=row["registration_no"],
                patient_initial=row["patient_initial"],
                gender_age=gender_age,
                visit_date=row["visit_date"],
                surgery_date=row["surgery_date"],
                diagnosis_code=row["diagnosis_code"],
                procedure_code=row["procedure_code"],
                is_locked=row["is_locked"],
                has_memo=row["has_memo"],
                db_status={
                    "initial_db": row["initial_db_status"],
                    "extended_db": row["extended_db_status"],
                    "outcome_db": row["outcome_db_status"],
                },
                prom_alimtalk={
                    "last_sent_at": row["latest_prom_sent_at"],
                    "prom_status": row["latest_prom_status"] or "WAITING",
                },
            )
        )
        no -= 1
    total_pages = max((total + size - 1) // size, 1)
    return PatientListResponse(
        pagination=PaginationMeta(
            current_page=page,
            total_pages=total_pages,
            total_elements=total,
            page_size=size,
        ),
        patients=items,
    )


async def create_patient_case(conn: AsyncConnection, actor_user_id: UUID, payload: PatientCreateRequest) -> PatientCreateResponse:
    patient_row = await fetch_one(
        conn,
        """
        INSERT INTO patient.patient (
            patient_id, hospital_code, patient_initial, sex, birth_year, is_active, created_at, created_by, updated_at, updated_by
        ) VALUES (
            gen_random_uuid(), app_private.current_app_hospital_code(), %s, %s::patient.sex_type, %s, true, now(), %s, now(), %s
        )
        RETURNING patient_id, hospital_code
        """,
        (payload.patient_initial, payload.sex, payload.birth_year, str(actor_user_id), str(actor_user_id)),
    )
    patient_id = patient_row["patient_id"]
    hospital_code = patient_row["hospital_code"]

    await execute(
        conn,
        """
        INSERT INTO vault.patient_identity (
            patient_id, hospital_code, local_mrn_enc, local_mrn_sha256,
            phone_enc, phone_sha256, phone_last4_sha256,
            birth_date_enc, birth_ymd_sha256,
            created_at, created_by, updated_at, updated_by
        ) VALUES (
            %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s,
            now(), %s, now(), %s
        )
        """,
        (
            str(patient_id),
            hospital_code,
            crypto.encrypt_text(payload.local_mrn),
            crypto.sha256_hex((payload.local_mrn or "").strip()) if payload.local_mrn else None,
            crypto.encrypt_text(crypto.normalize_phone(payload.phone)),
            crypto.phone_hash(payload.phone),
            crypto.phone_last4_hash(payload.phone),
            crypto.encrypt_text(payload.birth_date.isoformat() if payload.birth_date else None),
            crypto.birth_ymd_hash(payload.birth_date.isoformat() if payload.birth_date else None),
            str(actor_user_id),
            str(actor_user_id),
        ),
    )

    case_row = await fetch_one(
        conn,
        """
        INSERT INTO clinical.case_record (
            case_id, hospital_code, patient_id, registration_no,
            consent_date, visit_date, surgery_date, diagnosis_code, procedure_code, spinal_region,
            surgeon_user_id, coordinator_user_id, case_status, is_locked, enrollment_source,
            created_at, created_by, updated_at, updated_by
        ) VALUES (
            gen_random_uuid(), %s, %s, clinical.next_registration_no(%s, %s),
            %s, %s, %s, %s, %s, %s::clinical.spinal_region,
            %s, %s, 'DRAFT', false, 'WEB',
            now(), %s, now(), %s
        )
        RETURNING case_id, registration_no
        """,
        (
            hospital_code,
            str(patient_id),
            hospital_code,
            payload.visit_date,
            payload.consent_date,
            payload.visit_date,
            payload.surgery_date,
            payload.diagnosis_code,
            payload.procedure_code,
            payload.spinal_region,
            str(payload.surgeon_user_id) if payload.surgeon_user_id else None,
            str(payload.coordinator_user_id) if payload.coordinator_user_id else None,
            str(actor_user_id),
            str(actor_user_id),
        ),
    )
    return PatientCreateResponse(
        patient_id=patient_id,
        case_id=case_row["case_id"],
        registration_no=case_row["registration_no"],
    )


async def _ensure_case_exists(conn: AsyncConnection, case_id: str) -> dict[str, Any]:
    row = await fetch_one(
        conn,
        "SELECT case_id, hospital_code, patient_id, is_locked FROM clinical.case_record WHERE case_id = %s",
        (case_id,),
    )
    if not row:
        raise NotFoundError(message="해당 환자/케이스를 찾을 수 없습니다.", error_code="PATIENT_NOT_FOUND")
    return row


async def update_clinical(conn: AsyncConnection, case_id: UUID, payload: ClinicalUpdateRequest) -> dict[str, Any]:
    case_row = await _ensure_case_exists(conn, str(case_id))
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise ValidationError("수정할 값이 없습니다.")

    case_updates: dict[str, Any] = {}
    initial_updates: dict[str, Any] = {
        "case_id": str(case_id),
        "hospital_code": case_row["hospital_code"],
        "patient_id": str(case_row["patient_id"]),
    }
    extended_updates: dict[str, Any] = {
        "case_id": str(case_id),
        "hospital_code": case_row["hospital_code"],
        "patient_id": str(case_row["patient_id"]),
    }

    mapping_case = {"diagnosis_code", "procedure_code", "spinal_region", "surgery_date"}
    mapping_initial = {"comorbidities", "diagnosis_detail", "symptom_duration_weeks", "baseline_neuro_deficit_yn", "preop_medication_jsonb", "preop_image_findings"}
    mapping_extended = {"surgery_level", "approach_type", "laterality", "operation_minutes", "estimated_blood_loss_ml", "anesthesia_type", "implant_used_yn", "discharge_date", "hospital_stay_days", "adverse_events_jsonb", "intraop_note"}

    for key, value in data.items():
        if key in mapping_case:
            case_updates[key] = value
        elif key in mapping_initial:
            initial_updates[key] = value
        elif key in mapping_extended:
            extended_updates[key] = value

    if case_updates:
        set_sql, values = build_set_clause(case_updates)
        await execute(
            conn,
            f"UPDATE clinical.case_record SET {set_sql}, updated_at = now() WHERE case_id = %s",
            [*values, str(case_id)],
        )

    if len(initial_updates) > 3:
        insert_cols, insert_placeholders, insert_values = build_insert_clause(initial_updates)
        update_payload = {k: v for k, v in initial_updates.items() if k not in {"case_id", "hospital_code", "patient_id"}}
        update_sql, _ = build_set_clause(update_payload)
        await execute(
            conn,
            f"""
            INSERT INTO clinical.case_initial_form ({insert_cols}, created_at, updated_at)
            VALUES ({insert_placeholders}, now(), now())
            ON CONFLICT (case_id)
            DO UPDATE SET {update_sql}, updated_at = now()
            """,
            [*insert_values, *list(update_payload.values())],
        )

    if len(extended_updates) > 3:
        insert_cols, insert_placeholders, insert_values = build_insert_clause(extended_updates)
        update_payload = {k: v for k, v in extended_updates.items() if k not in {"case_id", "hospital_code", "patient_id"}}
        update_sql, _ = build_set_clause(update_payload)
        await execute(
            conn,
            f"""
            INSERT INTO clinical.case_extended_form ({insert_cols}, created_at, updated_at)
            VALUES ({insert_placeholders}, now(), now())
            ON CONFLICT (case_id)
            DO UPDATE SET {update_sql}, updated_at = now()
            """,
            [*insert_values, *list(update_payload.values())],
        )

    return {
        "case_id": case_id,
        "updated_fields": list(data.keys()),
        "current_step": "TAB_2",
    }


async def update_outcome(conn: AsyncConnection, case_id: UUID, payload: OutcomeUpdateRequest) -> dict[str, Any]:
    case_row = await _ensure_case_exists(conn, str(case_id))
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise ValidationError("수정할 값이 없습니다.")

    row_payload = {
        "case_id": str(case_id),
        "hospital_code": case_row["hospital_code"],
        "patient_id": str(case_row["patient_id"]),
        **data,
    }
    insert_cols, insert_placeholders, insert_values = build_insert_clause(row_payload)
    update_payload = {k: v for k, v in row_payload.items() if k not in {"case_id", "hospital_code", "patient_id"}}
    update_sql, _ = build_set_clause(update_payload)
    await execute(
        conn,
        f"""
        INSERT INTO clinical.case_outcome_form ({insert_cols}, created_at, updated_at)
        VALUES ({insert_placeholders}, now(), now())
        ON CONFLICT (case_id)
        DO UPDATE SET {update_sql}, updated_at = now()
        """,
        [*insert_values, *list(update_payload.values())],
    )
    return {
        "case_id": case_id,
        "db_status": {"outcome_db": "COMPLETED"},
        "current_step": "TAB_3",
    }


async def get_latest_memo(conn: AsyncConnection, case_id: UUID) -> MemoResponse:
    row = await fetch_one(
        conn,
        """
        SELECT memo_id, visibility::text AS visibility, memo_text, created_at, created_by
        FROM clinical.case_memo
        WHERE case_id = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (str(case_id),),
    )
    if not row:
        raise NotFoundError(message="메모가 없습니다.", error_code="MEMO_NOT_FOUND")
    return MemoResponse(**row)


async def put_memo(conn: AsyncConnection, case_id: UUID, actor_user_id: UUID, payload: MemoUpdateRequest) -> MemoResponse:
    case_row = await _ensure_case_exists(conn, str(case_id))
    row = await fetch_one(
        conn,
        """
        INSERT INTO clinical.case_memo (
            memo_id, hospital_code, case_id, patient_id, visibility, memo_text,
            created_at, created_by, updated_at, updated_by
        ) VALUES (
            gen_random_uuid(), %s, %s, %s, %s::clinical.memo_visibility, %s,
            now(), %s, now(), %s
        )
        RETURNING memo_id, visibility::text AS visibility, memo_text, created_at, created_by
        """,
        (
            case_row["hospital_code"],
            str(case_id),
            str(case_row["patient_id"]),
            payload.visibility,
            payload.memo_text,
            str(actor_user_id),
            str(actor_user_id),
        ),
    )
    return MemoResponse(**row)


async def set_lock(conn: AsyncConnection, case_id: UUID, actor_user_id: UUID, actor_role: str, payload: LockRequest) -> dict[str, Any]:
    case_row = await _ensure_case_exists(conn, str(case_id))
    if case_row["is_locked"] and not payload.is_locked and actor_role not in {"ADMIN", "STEERING", "PI"}:
        raise ForbiddenError(message="데이터 잠금을 해제할 권한이 없습니다. (책임연구자 전용 기능)")
    row = await fetch_one(
        conn,
        """
        UPDATE clinical.case_record
           SET is_locked = %s,
               lock_reason = %s,
               locked_by = CASE WHEN %s THEN %s ELSE NULL END,
               updated_at = now(),
               updated_by = %s
         WHERE case_id = %s
     RETURNING case_id, is_locked
        """,
        (
            payload.is_locked,
            payload.reason,
            payload.is_locked,
            str(actor_user_id),
            str(actor_user_id),
            str(case_id),
        ),
    )
    return row


async def send_prom_request(conn: AsyncConnection, case_id: UUID, actor_user_id: UUID, payload: PromSendRequest) -> dict[str, Any]:
    case_row = await _ensure_case_exists(conn, str(case_id))
    identity = await fetch_one(
        conn,
        "SELECT phone_sha256, phone_last4_sha256 FROM vault.patient_identity WHERE patient_id = %s",
        (str(case_row["patient_id"]),),
    )
    if not identity or not identity["phone_sha256"]:
        raise ValidationError("환자 연락처가 없어 알림톡을 발송할 수 없습니다.", error_code="PATIENT_PHONE_MISSING")

    request_row = await fetch_one(
        conn,
        """
        INSERT INTO survey.prom_request (
            request_id, hospital_code, case_id, patient_id, timepoint_code, token_uuid,
            token_status, source_channel, requested_by, requested_at, expires_at,
            remarks, created_at, created_by, updated_at, updated_by
        ) VALUES (
            gen_random_uuid(), %s, %s, %s, %s, gen_random_uuid(),
            'READY', 'KAKAO_ALIMTALK', %s, now(), %s,
            %s, now(), %s, now(), %s
        )
        RETURNING request_id, token_uuid, timepoint_code
        """,
        (
            case_row["hospital_code"],
            str(case_id),
            str(case_row["patient_id"]),
            payload.timepoint_code,
            str(actor_user_id),
            datetime.now(tz=timezone.utc) + timedelta(days=payload.expires_in_days or settings.default_prom_request_expire_days),
            payload.remarks,
            str(actor_user_id),
            str(actor_user_id),
        ),
    )

    survey_url = f"{settings.survey_base_url.rstrip('/')}/{request_row['token_uuid']}"
    message_row = await fetch_one(
        conn,
        """
        INSERT INTO messaging.message_outbox (
            message_id, hospital_code, case_id, patient_id, request_id, channel,
            vendor_code, template_id, dedupe_key, payload_jsonb, message_body_snapshot,
            recipient_phone_sha256, status, priority, queued_at, next_attempt_at,
            attempt_count, max_attempts, created_at, created_by, updated_at, updated_by
        ) VALUES (
            gen_random_uuid(), %s, %s, %s, %s, 'KAKAO_ALIMTALK',
            %s, NULL, %s, %s::jsonb, %s,
            %s, 'QUEUED', 100, now(), now(),
            0, 5, now(), %s, now(), %s
        )
        RETURNING message_id
        """,
        (
            case_row["hospital_code"],
            str(case_id),
            str(case_row["patient_id"]),
            str(request_row["request_id"]),
            settings.alimtalk_template_fallback_vendor_code,
            f"prom:{case_id}:{payload.timepoint_code}",
            __import__("json").dumps(
                {
                    "survey_url": survey_url,
                    "timepoint_code": payload.timepoint_code,
                    "request_id": str(request_row["request_id"]),
                    "hospital_code": case_row["hospital_code"],
                },
                ensure_ascii=False,
            ),
            f"[KSOR] PROM 입력 요청: {survey_url}",
            identity["phone_sha256"],
            str(actor_user_id),
            str(actor_user_id),
        ),
    )
    await execute(
        conn,
        "UPDATE survey.prom_request SET latest_message_id = %s, updated_at = now() WHERE request_id = %s",
        (str(message_row["message_id"]), str(request_row["request_id"])),
    )
    return {
        "patient_id": case_row["patient_id"],
        "case_id": case_id,
        "request_id": request_row["request_id"],
        "timepoint": request_row["timepoint_code"],
        "tracking_status": "SENT_PENDING",
        "survey_url": survey_url if settings.app_env != "production" else None,
    }
