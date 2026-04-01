from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
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


def _serialize_row(row: dict[str, Any] | None) -> dict[str, Any] | None:
    """Convert UUID, date, datetime, Decimal values to JSON-safe types."""
    if row is None:
        return None
    from decimal import Decimal
    result = {}
    for k, v in row.items():
        if isinstance(v, UUID):
            result[k] = str(v)
        elif isinstance(v, datetime):
            result[k] = v.isoformat()
        elif isinstance(v, date):
            result[k] = v.isoformat()
        elif isinstance(v, Decimal):
            result[k] = float(v)
        else:
            result[k] = v
    return result


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
    filters = ["case_status != 'ARCHIVED'"]
    params: list[Any] = []
    if keyword:
        filters.append("(registration_id ILIKE %s OR patient_initial ILIKE %s OR patient_id::text ILIKE %s)")
        pattern = f"%{keyword}%"
        params.extend([pattern, pattern, pattern])
    if procedure_code:
        filters.append("procedure_code = %s")
        params.append(procedure_code)
    if diagnosis_code:
        filters.append("diagnosis_code = %s")
        params.append(diagnosis_code)
    if status_filter:
        # Timepoint codes (PRE_OP, POST_1M, ...) filter by PROM request existence
        timepoint_codes = {"PRE_OP", "POST_1M", "POST_3M", "POST_6M", "POST_1Y",
                           "PREOP", "POSTOP_1M", "POSTOP_3M", "POSTOP_6M", "POSTOP_12M", "POSTOP_24M"}
        if status_filter in timepoint_codes:
            filters.append(
                "case_id IN (SELECT pr.case_id FROM survey.prom_request pr "
                "WHERE pr.timepoint_code = %s)"
            )
            params.append(status_filter)
        else:
            # DB status values (WAITING, IN_PROGRESS, COMPLETED)
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
            vcs.registration_id,
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

    # Fetch per-timepoint PROM status for all cases in this page
    case_ids = [row["case_id"] for row in rows] if rows else []
    prom_by_case: dict[Any, dict[str, str]] = {}
    fu_tp_by_case: dict[Any, list[str]] = {}
    if case_ids:
        prom_rows = await fetch_all(
            conn,
            """
            SELECT
                pr.case_id,
                pr.timepoint_code,
                pr.token_status::text AS token_status
            FROM survey.prom_request pr
            WHERE pr.case_id = ANY(%s)
            """,
            (case_ids,),
        )
        for pr in (prom_rows or []):
            cid = pr["case_id"]
            tp = pr["timepoint_code"]
            status = pr["token_status"]
            prom_by_case.setdefault(cid, {})[tp] = status

        # Fetch followup_timepoints from additional_attributes
        fu_rows = await fetch_all(
            conn,
            """
            SELECT case_id, additional_attributes->'followup_timepoints' AS fu_tp
            FROM clinical.case_initial_form
            WHERE case_id = ANY(%s)
              AND additional_attributes ? 'followup_timepoints'
            """,
            (case_ids,),
        )
        # Map legacy display labels to codes
        _label_to_code = {
            "Pre-op": "PRE_OP", "1개월 (1m)": "POST_1M", "3개월 (3m)": "POST_3M",
            "6개월 (6m)": "POST_6M", "1년 (1yr)": "POST_1Y",
        }
        for fr in (fu_rows or []):
            tp_list = fr["fu_tp"]
            if isinstance(tp_list, list):
                fu_tp_by_case[fr["case_id"]] = list(dict.fromkeys(
                    _label_to_code.get(tp, tp) for tp in tp_list
                ))

    items: list[PatientListItem] = []
    no = total - offset
    for row in rows:
        age = None
        if row["birth_year"]:
            base_year = row["visit_date"].year if row["visit_date"] else datetime.now().year
            age = max(base_year - int(row["birth_year"]), 0)
        gender_age = f"{row['sex']} / {age if age is not None else '-'}"

        # Build per-timepoint follow-up status
        case_prom = prom_by_case.get(row["case_id"], {})
        selected_timepoints = fu_tp_by_case.get(row["case_id"], [])
        followup_status: dict[str, str] = {}
        for tp_code in ("PRE_OP", "POST_1M", "POST_3M", "POST_6M", "POST_1Y"):
            token_status = case_prom.get(tp_code)
            if token_status is None:
                # If this timepoint was selected in surgery-entry, mark as PENDING
                if tp_code in selected_timepoints:
                    followup_status[tp_code] = "PENDING"
                else:
                    followup_status[tp_code] = "NOT_REQUESTED"
            elif token_status in ("COMPLETED", "SUBMITTED"):
                followup_status[tp_code] = "COMPLETED"
            elif token_status in ("READY", "SENT", "OPENED", "VERIFIED"):
                followup_status[tp_code] = "PENDING"
            elif token_status == "EXPIRED":
                followup_status[tp_code] = "OVERDUE"
            else:
                followup_status[tp_code] = token_status

        items.append(
            PatientListItem(
                patient_id=str(row["patient_id"]),
                case_id=row["case_id"],
                no=no,
                registration_id=row["registration_id"],
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
                    "followup_status": followup_status,
                    "followup_timepoints": selected_timepoints,
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
    import logging
    _log = logging.getLogger(__name__)

    hospital_code = await fetch_val(
        conn,
        "SELECT app_private.current_app_hospital_code()",
    )
    if not hospital_code:
        raise ValidationError("병원 코드가 설정되지 않았습니다. 관리자에게 문의하세요.", error_code="HOSPITAL_CODE_MISSING")

    _log.info(
        "create_patient_case: hospital_code=%r (len=%d), patient_initial=%r (len=%d), sex=%r",
        hospital_code, len(str(hospital_code)),
        payload.patient_initial, len(payload.patient_initial),
        payload.sex,
    )

    patient_row = await fetch_one(
        conn,
        """
        INSERT INTO patient.patient (
            hospital_code, patient_initial, sex, birth_year, is_active, created_at, created_by, updated_at, updated_by
        ) VALUES (
            %s, %s, %s::patient.sex_type, %s, true, now(), %s, now(), %s
        )
        RETURNING patient_id, hospital_code
        """,
        (hospital_code, payload.patient_initial, payload.sex, payload.birth_year, str(actor_user_id), str(actor_user_id)),
    )
    if not patient_row:
        raise ValidationError("환자 등록에 실패했습니다. 권한을 확인해주세요.", error_code="PATIENT_INSERT_FAILED")
    patient_id = patient_row["patient_id"]
    hospital_code = patient_row["hospital_code"]

    _log.info("create_patient_case: patient created, inserting identity...")

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
            crypto.birth_ymd_hash(payload.birth_date.isoformat() if payload.birth_date else None)
            or (crypto.sha256_hex(str(payload.birth_year)) if payload.birth_year else None),
            str(actor_user_id),
            str(actor_user_id),
        ),
    )

    _log.info("create_patient_case: identity created, inserting case_record...")

    case_row = await fetch_one(
        conn,
        """
        INSERT INTO clinical.case_record (
            case_id, hospital_code, patient_id, registration_id,
            consent_date, visit_date, surgery_date, diagnosis_code, procedure_code, spinal_region,
            surgeon_user_id, coordinator_user_id, case_status, is_locked, enrollment_source,
            created_at, created_by, updated_at, updated_by
        ) VALUES (
            gen_random_uuid(), %s, %s, clinical.next_registration_id(%s, %s),
            %s, %s, %s, %s, %s, %s::clinical.spinal_region,
            %s, %s, 'DRAFT', false, 'WEB',
            now(), %s, now(), %s
        )
        RETURNING case_id, registration_id
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
    if not case_row:
        raise ValidationError("케이스 등록에 실패했습니다.", error_code="CASE_INSERT_FAILED")

    _log.info("create_patient_case: case_record created successfully")

    return PatientCreateResponse(
        patient_id=str(patient_id),
        case_id=case_row["case_id"],
        registration_id=case_row["registration_id"],
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


async def get_case_detail(conn: AsyncConnection, case_id: UUID) -> dict[str, Any]:
    """Get full patient/case detail including clinical, outcomes, and memos."""
    case_row = await _ensure_case_exists(conn, str(case_id))

    # Base case + patient info
    detail = await fetch_one(
        conn,
        """
        SELECT
            cr.case_id,
            cr.hospital_code,
            cr.patient_id,
            cr.registration_id,
            p.patient_initial,
            p.sex::text AS sex,
            p.birth_year,
            cr.consent_date,
            cr.visit_date,
            cr.surgery_date,
            cr.diagnosis_code,
            cr.procedure_code,
            cr.spinal_region::text AS spinal_region,
            cr.case_status::text AS case_status,
            cr.is_locked,
            cr.enrollment_source,
            cr.created_at,
            cr.updated_at
        FROM clinical.case_record cr
        JOIN patient.patient p ON p.patient_id = cr.patient_id AND p.hospital_code = cr.hospital_code
        WHERE cr.case_id = %s
        """,
        (str(case_id),),
    )

    # Initial form
    initial = await fetch_one(
        conn,
        """
        SELECT comorbidities, diagnosis_detail,
               symptom_duration_weeks::float AS symptom_duration_weeks,
               baseline_neuro_deficit_yn, preop_medication_jsonb, preop_image_findings,
               additional_attributes
        FROM clinical.case_initial_form
        WHERE case_id = %s
        """,
        (str(case_id),),
    )

    # Extended form
    extended = await fetch_one(
        conn,
        """
        SELECT surgery_level, approach_type, laterality, operation_minutes,
               estimated_blood_loss_ml, anesthesia_type, implant_used_yn,
               discharge_date, hospital_stay_days::float AS hospital_stay_days,
               adverse_events_jsonb, intraop_note
        FROM clinical.case_extended_form
        WHERE case_id = %s
        """,
        (str(case_id),),
    )

    # Outcome form
    outcome = await fetch_one(
        conn,
        """
        SELECT complication_yn, complication_detail, readmission_30d_yn,
               reoperation_yn, surgeon_global_outcome, return_to_work_yn,
               final_note, outcome_completed_at
        FROM clinical.case_outcome_form
        WHERE case_id = %s
        """,
        (str(case_id),),
    )

    # Latest memo
    memo = await fetch_one(
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

    # PROM requests
    prom_requests = await fetch_all(
        conn,
        """
        SELECT request_id, timepoint_code, token_status::text AS token_status,
               requested_at, submitted_at, expires_at
        FROM survey.prom_request
        WHERE case_id = %s
        ORDER BY requested_at DESC
        """,
        (str(case_id),),
    )

    return {
        **_serialize_row(detail),
        "initial_form": _serialize_row(initial),
        "extended_form": _serialize_row(extended),
        "outcome_form": _serialize_row(outcome),
        "latest_memo": _serialize_row(memo),
        "prom_requests": [_serialize_row(r) for r in (prom_requests or [])],
    }


async def delete_case(conn: AsyncConnection, case_id: UUID, actor_user_id: UUID) -> dict[str, Any]:
    """Soft-delete a case by setting case_status to ARCHIVED."""
    case_row = await _ensure_case_exists(conn, str(case_id))
    if case_row["is_locked"]:
        raise ForbiddenError(message="잠긴 케이스는 삭제할 수 없습니다.", error_code="CASE_LOCKED")

    await execute(
        conn,
        """
        UPDATE clinical.case_record
           SET case_status = 'ARCHIVED'::clinical.case_status,
               updated_at = now(),
               updated_by = %s
         WHERE case_id = %s
        """,
        (str(actor_user_id), str(case_id)),
    )
    return {"case_id": case_id, "status": "ARCHIVED"}


async def update_clinical(conn: AsyncConnection, case_id: UUID, payload: ClinicalUpdateRequest) -> dict[str, Any]:
    case_row = await _ensure_case_exists(conn, str(case_id))
    if case_row["is_locked"]:
        raise ForbiddenError(message="잠긴 케이스는 수정할 수 없습니다.", error_code="CASE_LOCKED")
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
    # Fields stored in additional_attributes jsonb on case_initial_form
    mapping_additional = {
        "surgeon_name", "asa_class", "diagnosis_level", "myelopathy_yn",
        "num_levels", "surgeon_experience_years", "antibiotic_prophylaxis_yn",
        "cci_score", "endo_technique", "endo_device", "scope_angle",
        "viz_quality", "conversion_yn", "reoperation_reason", "followup_timepoints",
    }

    additional_attrs: dict[str, Any] = {}
    for key, value in data.items():
        if key in mapping_case:
            case_updates[key] = value
        elif key in mapping_initial:
            initial_updates[key] = value
        elif key in mapping_extended:
            extended_updates[key] = value
        elif key in mapping_additional:
            additional_attrs[key] = value

    if additional_attrs:
        import json as _json
        additional_json = _json.dumps(additional_attrs, ensure_ascii=False)
        # Merge into existing additional_attributes; handled separately in the UPSERT below
        initial_updates["additional_attributes"] = additional_json

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
        # For additional_attributes, merge with existing rather than replace
        if "additional_attributes" in update_payload:
            non_aa = {k: v for k, v in update_payload.items() if k != "additional_attributes"}
            parts = []
            merge_values: list[Any] = []
            if non_aa:
                set_sql_part, set_vals_part = build_set_clause(non_aa)
                parts.append(set_sql_part)
                merge_values.extend(set_vals_part)
            parts.append("additional_attributes = COALESCE(clinical.case_initial_form.additional_attributes, '{}'::jsonb) || %s::jsonb")
            merge_values.append(update_payload["additional_attributes"])
            update_sql = ", ".join(parts)
            update_values = merge_values
        else:
            update_sql, update_values = build_set_clause(update_payload)
        await execute(
            conn,
            f"""
            INSERT INTO clinical.case_initial_form ({insert_cols}, created_at, updated_at)
            VALUES ({insert_placeholders}, now(), now())
            ON CONFLICT (case_id)
            DO UPDATE SET {update_sql}, updated_at = now()
            """,
            [*insert_values, *update_values],
        )

    if len(extended_updates) > 3:
        insert_cols, insert_placeholders, insert_values = build_insert_clause(extended_updates)
        update_payload = {k: v for k, v in extended_updates.items() if k not in {"case_id", "hospital_code", "patient_id"}}
        update_sql, update_values = build_set_clause(update_payload)
        await execute(
            conn,
            f"""
            INSERT INTO clinical.case_extended_form ({insert_cols}, created_at, updated_at)
            VALUES ({insert_placeholders}, now(), now())
            ON CONFLICT (case_id)
            DO UPDATE SET {update_sql}, updated_at = now()
            """,
            [*insert_values, *update_values],
        )

    return {
        "case_id": case_id,
        "updated_fields": list(data.keys()),
        "current_step": "TAB_2",
    }


async def update_outcome(conn: AsyncConnection, case_id: UUID, payload: OutcomeUpdateRequest) -> dict[str, Any]:
    case_row = await _ensure_case_exists(conn, str(case_id))
    if case_row["is_locked"]:
        raise ForbiddenError(message="잠긴 케이스는 수정할 수 없습니다.", error_code="CASE_LOCKED")
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise ValidationError("수정할 값이 없습니다.")

    # Separate DB columns from extended complication fields
    db_columns = {
        "complication_yn", "complication_detail", "readmission_30d_yn",
        "reoperation_yn", "surgeon_global_outcome", "return_to_work_yn",
        "final_note", "outcome_completed_at",
    }
    extended_keys = {
        "complications", "complication_severity", "complication_date",
        "conversion_yn", "conversion_reason", "reoperation_date",
    }

    db_data: dict[str, Any] = {}
    ext_data: dict[str, Any] = {}
    for k, v in data.items():
        if k in db_columns:
            db_data[k] = v
        elif k in extended_keys:
            ext_data[k] = v.isoformat() if isinstance(v, date) else v

    # Auto-set complication_yn from complications list
    if "complications" in ext_data and "complication_yn" not in db_data:
        db_data["complication_yn"] = len(ext_data.get("complications", [])) > 0

    # Merge extended data into complication_detail as JSON
    if ext_data:
        import json as _json
        # Load existing complication_detail if present
        existing = await fetch_one(
            conn,
            "SELECT complication_detail, final_note FROM clinical.case_outcome_form WHERE case_id = %s",
            (str(case_id),),
        )
        existing_ext: dict[str, Any] = {}
        if existing and existing.get("complication_detail"):
            try:
                existing_ext = _json.loads(existing["complication_detail"])
            except (ValueError, TypeError):
                existing_ext = {"text": existing["complication_detail"]}
        existing_ext.update(ext_data)
        db_data["complication_detail"] = _json.dumps(existing_ext, ensure_ascii=False)

    row_payload = {
        "case_id": str(case_id),
        "hospital_code": case_row["hospital_code"],
        "patient_id": str(case_row["patient_id"]),
        **db_data,
    }
    insert_cols, insert_placeholders, insert_values = build_insert_clause(row_payload)
    update_payload = {k: v for k, v in row_payload.items() if k not in {"case_id", "hospital_code", "patient_id"}}
    update_sql, update_values = build_set_clause(update_payload)
    await execute(
        conn,
        f"""
        INSERT INTO clinical.case_outcome_form ({insert_cols}, created_at, updated_at)
        VALUES ({insert_placeholders}, now(), now())
        ON CONFLICT (case_id)
        DO UPDATE SET {update_sql}, updated_at = now()
        """,
        [*insert_values, *update_values],
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
               locked_by = CASE WHEN %s THEN %s::uuid ELSE NULL END,
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
