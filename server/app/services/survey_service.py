from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from psycopg import AsyncConnection

from app.core.encryption import crypto, mask_name
from app.core.exceptions import ConflictError, NotFoundError, UnauthorizedError, ValidationError
from app.core.security import AccessTokenClaims, jwt_manager
from app.db.queries import execute, executemany, fetch_all, fetch_one
from app.models.survey import (
    SurveyQuestion,
    SurveyQuestionOption,
    SurveyQuestionsResponse,
    SurveyStatusResponse,
    SurveySubmitResponse,
    SurveyVerifyRequest,
    SurveyVerifyResponse,
)


DEFAULT_ODI_OPTIONS = [
    {"value": i, "label": label}
    for i, label in enumerate(
        [
            "전혀 그렇지 않다",
            "조금 그렇다",
            "보통이다",
            "상당히 그렇다",
            "매우 그렇다",
            "항상 그렇다",
        ]
    )
]
DEFAULT_EQ5D_OPTIONS = [
    {"value": i, "label": f"{i}단계"} for i in range(1, 6)
]
FOLLOWUP_OPTIONS = [
    {"value": 5, "label": "매우 만족"},
    {"value": 4, "label": "만족"},
    {"value": 3, "label": "보통"},
    {"value": 2, "label": "불만족"},
    {"value": 1, "label": "매우 불만족"},
]


async def _fetch_request_by_token(conn: AsyncConnection, token_uuid: UUID) -> dict[str, Any]:
    row = await fetch_one(
        conn,
        """
        SELECT
            pr.request_id,
            pr.hospital_code,
            pr.case_id,
            pr.patient_id,
            pr.timepoint_code,
            pr.token_uuid,
            pr.token_status::text AS token_status,
            pr.requested_at,
            pr.expires_at,
            pr.opened_at,
            pr.verified_at,
            pr.submitted_at,
            h.hospital_name,
            ua.full_name AS doctor_name,
            p.patient_initial,
            cr.spinal_region::text AS spinal_region
        FROM survey.prom_request pr
        JOIN ref.hospital h ON h.hospital_code = pr.hospital_code
        JOIN clinical.case_record cr ON cr.case_id = pr.case_id
        JOIN patient.patient p ON p.patient_id = pr.patient_id
        LEFT JOIN auth.user_account ua ON ua.user_id = cr.surgeon_user_id
        WHERE pr.token_uuid = %s
        """,
        (str(token_uuid),),
    )
    if not row:
        raise NotFoundError(message="설문 링크를 찾을 수 없습니다.", error_code="SURVEY_NOT_FOUND")
    return row


async def get_status(conn: AsyncConnection, token_uuid: UUID) -> SurveyStatusResponse:
    row = await _fetch_request_by_token(conn, token_uuid)
    expired = row["expires_at"] <= datetime.now(tz=timezone.utc)
    if row["token_status"] in {"READY", "SENT"} and not expired:
        await execute(
            conn,
            "UPDATE survey.prom_request SET token_status = 'OPENED', opened_at = coalesce(opened_at, now()), updated_at = now() WHERE request_id = %s",
            (str(row["request_id"]),),
        )
        row["token_status"] = "OPENED"
        row["opened_at"] = row["opened_at"] or datetime.now(tz=timezone.utc)
    if expired and row["token_status"] not in {"SUBMITTED", "EXPIRED"}:
        await execute(
            conn,
            "UPDATE survey.prom_request SET token_status = 'EXPIRED', updated_at = now() WHERE request_id = %s",
            (str(row["request_id"]),),
        )
        row["token_status"] = "EXPIRED"
    return SurveyStatusResponse(
        request_id=row["request_id"],
        token_status=row["token_status"],
        expired=expired,
        opened_at=row["opened_at"],
        verified_at=row["verified_at"],
        submitted_at=row["submitted_at"],
        hospital_name=row["hospital_name"],
        doctor_name=row["doctor_name"],
        patient_name_masked=mask_name(row["patient_initial"]),
        timepoint_label=row["timepoint_code"],
    )


async def verify(conn: AsyncConnection, token_uuid: UUID, payload: SurveyVerifyRequest) -> SurveyVerifyResponse:
    row = await _fetch_request_by_token(conn, token_uuid)
    if row["submitted_at"] is not None or row["token_status"] == "SUBMITTED":
        raise ConflictError(message="이미 제출된 설문입니다.", error_code="SURVEY_ALREADY_SUBMITTED")
    if row["expires_at"] <= datetime.now(tz=timezone.utc):
        await execute(conn, "UPDATE survey.prom_request SET token_status = 'EXPIRED', updated_at = now() WHERE request_id = %s", (str(row["request_id"]),))
        raise UnauthorizedError(message="만료된 설문입니다.", error_code="SURVEY_EXPIRED")

    identity = await fetch_one(
        conn,
        "SELECT phone_last4_sha256, birth_ymd_sha256 FROM vault.patient_identity WHERE patient_id = %s",
        (str(row["patient_id"]),),
    )
    if not identity:
        raise UnauthorizedError(message="본인 확인 정보를 찾을 수 없습니다.", error_code="SURVEY_VERIFY_NOT_AVAILABLE")

    success = False
    if payload.method_code == "phone_last4":
        normalized = crypto.normalize_phone(payload.value)
        success = bool(normalized and crypto.sha256_hex(normalized[-4:]) == identity["phone_last4_sha256"])
    elif payload.method_code == "birth_ymd":
        candidate = payload.value.replace("-", "")
        success = bool(crypto.sha256_hex(candidate) == identity["birth_ymd_sha256"])
    else:
        raise ValidationError("지원하지 않는 인증 방식입니다.", error_code="SURVEY_VERIFY_METHOD_INVALID")

    ctx_ip = __import__("app.core.context", fromlist=["get_request_context"]).get_request_context().normalized_ip() if __import__("app.core.context", fromlist=["get_request_context"]).get_request_context() else None
    await execute(
        conn,
        """
        INSERT INTO survey.verify_attempt (
            verify_attempt_id, hospital_code, request_id, method_code, success, reason_code,
            client_ip, forwarded_for, user_agent, attempted_at
        ) VALUES (
            gen_random_uuid(), %s, %s, %s, %s, %s,
            %s::inet, NULL, NULL, now()
        )
        """,
        (
            row["hospital_code"],
            str(row["request_id"]),
            payload.method_code,
            success,
            None if success else "VERIFY_MISMATCH",
            ctx_ip,
        ),
    )
    if not success:
        raise UnauthorizedError(message="본인 확인에 실패했습니다.", error_code="SURVEY_VERIFY_FAILED")

    await execute(
        conn,
        """
        UPDATE survey.prom_request
           SET token_status = 'VERIFIED',
               verified_at = coalesce(verified_at, now()),
               updated_at = now()
         WHERE request_id = %s
        """,
        (str(row["request_id"]),),
    )
    token, expires_at = jwt_manager.create_survey_token(
        request_id=row["request_id"],
        case_id=row["case_id"],
        hospital_code=row["hospital_code"],
    )
    return SurveyVerifyResponse(verified=True, survey_token=token, expires_at=expires_at)


async def _load_question_bank(conn: AsyncConnection, instruments: list[str]) -> list[dict[str, Any]]:
    return await fetch_all(
        conn,
        """
        SELECT instrument_code, question_code, display_order, question_text_ko,
               response_type, options_jsonb, min_score, max_score
        FROM ref.prom_question_bank
        WHERE instrument_code = ANY(%s)
          AND is_active = true
        ORDER BY display_order ASC
        """,
        (instruments,),
    )



def _fallback_questions(region: str, include_followup: bool) -> list[SurveyQuestion]:
    questions: list[SurveyQuestion] = [
        SurveyQuestion(step=1, category="VAS", instrument_code="VAS", question_code="vas_back", title="현재 허리/목 통증은 어느 정도입니까?", ui_type="SLIDER", min_val=0, max_val=10),
        SurveyQuestion(step=2, category="VAS", instrument_code="VAS", question_code="vas_leg", title="현재 다리/팔 방사통은 어느 정도입니까?", ui_type="SLIDER", min_val=0, max_val=10),
    ]
    instrument = "NDI" if region == "CERVICAL" else "ODI"
    for idx in range(1, 11):
        questions.append(
            SurveyQuestion(
                step=len(questions) + 1,
                category=instrument,
                instrument_code=instrument,
                question_code=f"{instrument.lower()}_q{idx}",
                title=f"{instrument} 문항 {idx}",
                ui_type="BUTTON",
                options=[SurveyQuestionOption(**item) for item in DEFAULT_ODI_OPTIONS],
            )
        )
    for idx in range(1, 6):
        questions.append(
            SurveyQuestion(
                step=len(questions) + 1,
                category="EQ5D5L",
                instrument_code="EQ5D5L",
                question_code=f"eq5d_q{idx}",
                title=f"EQ-5D-5L 문항 {idx}",
                ui_type="BUTTON",
                options=[SurveyQuestionOption(**item) for item in DEFAULT_EQ5D_OPTIONS],
            )
        )
    questions.append(SurveyQuestion(step=len(questions) + 1, category="EQ5D5L", instrument_code="EQ5D5L", question_code="eq_vas", title="오늘 건강 상태를 0~100으로 표시해 주세요.", ui_type="SLIDER", min_val=0, max_val=100))
    if include_followup:
        for code, title in [
            ("fu_satisfaction", "수술 결과에 얼마나 만족하십니까?"),
            ("fu_global", "전체적으로 증상이 얼마나 좋아졌습니까?"),
            ("fu_return_work", "일상 또는 업무에 복귀하셨습니까?"),
        ]:
            questions.append(
                SurveyQuestion(
                    step=len(questions) + 1,
                    category="FOLLOWUP",
                    instrument_code="FOLLOWUP",
                    question_code=code,
                    title=title,
                    ui_type="BUTTON",
                    options=[SurveyQuestionOption(**item) for item in FOLLOWUP_OPTIONS],
                )
            )
    return questions


async def get_questions(conn: AsyncConnection, claims: AccessTokenClaims) -> SurveyQuestionsResponse:
    if claims.request_id is None or claims.case_id is None:
        raise UnauthorizedError(message="설문 토큰이 올바르지 않습니다.", error_code="SURVEY_TOKEN_INVALID")
    row = await fetch_one(
        conn,
        """
        SELECT pr.request_id, pr.hospital_code, pr.case_id, pr.patient_id, pr.timepoint_code,
               pr.token_status::text AS token_status, pr.expires_at, pr.verified_at,
               p.patient_initial, ua.full_name AS doctor_name, cr.spinal_region::text AS spinal_region
        FROM survey.prom_request pr
        JOIN clinical.case_record cr ON cr.case_id = pr.case_id
        JOIN patient.patient p ON p.patient_id = pr.patient_id
        LEFT JOIN auth.user_account ua ON ua.user_id = cr.surgeon_user_id
        WHERE pr.request_id = %s
        """,
        (str(claims.request_id),),
    )
    if not row:
        raise NotFoundError(message="설문 요청을 찾을 수 없습니다.", error_code="SURVEY_REQUEST_NOT_FOUND")
    if row["verified_at"] is None:
        raise UnauthorizedError(message="설문 본인 인증이 필요합니다.", error_code="SURVEY_NOT_VERIFIED")
    if row["expires_at"] <= datetime.now(tz=timezone.utc):
        raise UnauthorizedError(message="설문 링크가 만료되었습니다.", error_code="SURVEY_EXPIRED")
    include_followup = row["timepoint_code"] not in {"PREOP", "PRE_OP"}
    instrument = "NDI" if row["spinal_region"] == "CERVICAL" else "ODI"
    bank_rows = await _load_question_bank(conn, ["VAS", instrument, "EQ5D5L", "FOLLOWUP"] if include_followup else ["VAS", instrument, "EQ5D5L"])
    if bank_rows:
        questions: list[SurveyQuestion] = []
        step = 1
        for item in bank_rows:
            questions.append(
                SurveyQuestion(
                    step=step,
                    category=item["instrument_code"],
                    instrument_code=item["instrument_code"],
                    question_code=item["question_code"],
                    title=item["question_text_ko"] or item["question_code"],
                    ui_type="SLIDER" if item["response_type"] in {"SLIDER", "NUMERIC"} else "BUTTON",
                    min_val=int(item["min_score"]) if item["min_score"] is not None else None,
                    max_val=int(item["max_score"]) if item["max_score"] is not None else None,
                    options=[SurveyQuestionOption(**opt) for opt in (item["options_jsonb"] or [])] if item["options_jsonb"] else None,
                )
            )
            step += 1
    else:
        questions = _fallback_questions(row["spinal_region"], include_followup)
    return SurveyQuestionsResponse(
        patient_name=mask_name(row["patient_initial"]),
        doctor_name=row["doctor_name"],
        timepoint_label=row["timepoint_code"],
        total_questions=len(questions),
        questions=questions,
    )


async def save_draft(conn: AsyncConnection, claims: AccessTokenClaims, question_id: str, answer_value: Any) -> None:
    if claims.request_id is None or claims.case_id is None:
        raise UnauthorizedError(message="설문 토큰이 올바르지 않습니다.", error_code="SURVEY_TOKEN_INVALID")
    request_row = await fetch_one(conn, "SELECT hospital_code, case_id, patient_id FROM survey.prom_request WHERE request_id = %s", (str(claims.request_id),))
    if not request_row:
        raise NotFoundError(message="설문 요청을 찾을 수 없습니다.", error_code="SURVEY_REQUEST_NOT_FOUND")

    existing = await fetch_one(conn, "SELECT answer_payload FROM survey.prom_draft WHERE request_id = %s", (str(claims.request_id),))
    answer_payload = dict(existing["answer_payload"]) if existing and existing["answer_payload"] else {}
    answer_payload[question_id] = answer_value
    payload_json = json.dumps(answer_payload, ensure_ascii=False)
    await execute(
        conn,
        """
        INSERT INTO survey.prom_draft (
            request_id, hospital_code, case_id, patient_id, answer_payload,
            last_saved_at, save_count, created_at, updated_at
        ) VALUES (
            %s, %s, %s, %s, %s::jsonb,
            now(), 1, now(), now()
        )
        ON CONFLICT (request_id)
        DO UPDATE SET answer_payload = %s::jsonb, updated_at = now()
        """,
        (
            str(claims.request_id),
            request_row["hospital_code"],
            str(request_row["case_id"]),
            str(request_row["patient_id"]),
            payload_json,
            payload_json,
        ),
    )



def _to_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        return int(value.strip())
    return None



def _detect_instrument(question_code: str) -> str:
    q = question_code.lower()
    if q.startswith("vas_"):
        return "VAS"
    if q.startswith("odi_"):
        return "ODI"
    if q.startswith("ndi_"):
        return "NDI"
    if q.startswith("eq5d_") or q.startswith("eq_"):
        return "EQ5D5L"
    if q.startswith("fu_") or q.startswith("sat_") or q in ("global_impression", "satisfaction", "returned_to_work"):
        return "FOLLOWUP"
    # Fallback — treat anything else as FOLLOWUP to avoid FK violation
    return "FOLLOWUP"



def _compute_scores(answers: dict[str, Any]) -> dict[str, Any]:
    odi_values = [_to_int(v) for k, v in answers.items() if k.startswith("odi_q")]
    ndi_values = [_to_int(v) for k, v in answers.items() if k.startswith("ndi_q")]
    odi_values = [v for v in odi_values if v is not None]
    ndi_values = [v for v in ndi_values if v is not None]

    eq5d_answers = [_to_int(v) for k, v in answers.items() if k.startswith("eq5d_q")]
    eq5d_answers = [v for v in eq5d_answers if v is not None]

    returned_to_work = answers.get("fu_return_work")
    returned_bool = None
    if isinstance(returned_to_work, bool):
        returned_bool = returned_to_work
    elif _to_int(returned_to_work) is not None:
        returned_bool = _to_int(returned_to_work) == 1

    return {
        "vas_back": _to_int(answers.get("vas_back")),
        "vas_leg": _to_int(answers.get("vas_leg")),
        "odi_score": sum(odi_values) * 2 if len(odi_values) == 10 else None,
        "ndi_score": sum(ndi_values) * 2 if len(ndi_values) == 10 else None,
        "eq5d_index": None,
        "eq_vas": _to_int(answers.get("eq_vas")),
        "satisfaction": _to_int(answers.get("fu_satisfaction")),
        "global_impression": _to_int(answers.get("fu_global")),
        "returned_to_work": returned_bool,
        "instrument_bundle": sorted({_detect_instrument(k) for k in answers if _detect_instrument(k) != 'UNKNOWN'}),
    }


async def submit(conn: AsyncConnection, claims: AccessTokenClaims, answers: dict[str, Any]) -> SurveySubmitResponse:
    if claims.request_id is None or claims.case_id is None:
        raise UnauthorizedError(message="설문 토큰이 올바르지 않습니다.", error_code="SURVEY_TOKEN_INVALID")
    request_row = await fetch_one(
        conn,
        """
        SELECT request_id, hospital_code, case_id, patient_id, timepoint_code, token_status::text AS token_status,
               expires_at, submitted_at
        FROM survey.prom_request
        WHERE request_id = %s
        """,
        (str(claims.request_id),),
    )
    if not request_row:
        raise NotFoundError(message="설문 요청을 찾을 수 없습니다.", error_code="SURVEY_REQUEST_NOT_FOUND")
    if request_row["submitted_at"] is not None or request_row["token_status"] == "SUBMITTED":
        raise ConflictError(message="이미 제출된 설문입니다.", error_code="SURVEY_ALREADY_SUBMITTED")
    if request_row["expires_at"] <= datetime.now(tz=timezone.utc):
        raise UnauthorizedError(message="설문 링크가 만료되었습니다.", error_code="SURVEY_EXPIRED")

    scores = _compute_scores(answers)
    now = datetime.now(tz=timezone.utc)
    payload_json = json.dumps(answers, ensure_ascii=False)
    bundle_json = json.dumps(scores["instrument_bundle"], ensure_ascii=False)

    submission_row = await fetch_one(
        conn,
        """
        INSERT INTO survey.prom_submission (
            submission_id, hospital_code, case_id, patient_id, request_id, timepoint_code,
            instrument_bundle, answer_payload,
            vas_back, vas_leg, odi_score, ndi_score, eq5d_index, eq_vas,
            satisfaction, global_impression, returned_to_work,
            scoring_version, is_valid, submitted_at, submit_ip, user_agent,
            created_at, updated_at
        ) VALUES (
            gen_random_uuid(), %s, %s, %s, %s, %s,
            %s::jsonb, %s::jsonb,
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s,
            'v1', true, %s, %s::inet, %s,
            now(), now()
        )
        RETURNING submission_id, submitted_at
        """,
        (
            request_row["hospital_code"],
            str(request_row["case_id"]),
            str(request_row["patient_id"]),
            str(request_row["request_id"]),
            request_row["timepoint_code"],
            bundle_json,
            payload_json,
            scores["vas_back"],
            scores["vas_leg"],
            scores["odi_score"],
            scores["ndi_score"],
            scores["eq5d_index"],
            scores["eq_vas"],
            scores["satisfaction"],
            scores["global_impression"],
            scores["returned_to_work"],
            now,
            __import__("app.core.context", fromlist=["get_request_context"]).get_request_context().normalized_ip() if __import__("app.core.context", fromlist=["get_request_context"]).get_request_context() else None,
            __import__("app.core.context", fromlist=["get_request_context"]).get_request_context().user_agent if __import__("app.core.context", fromlist=["get_request_context"]).get_request_context() else None,
        ),
    )

    answer_rows = []
    step = 1
    for question_code, answer in answers.items():
        answer_rows.append(
            (
                str(submission_row["submission_id"]),
                request_row["hospital_code"],
                str(request_row["case_id"]),
                str(request_row["patient_id"]),
                _detect_instrument(question_code),
                question_code,
                step,
                _to_int(answer),
                answer if isinstance(answer, str) else None,
                json.dumps(answer, ensure_ascii=False) if isinstance(answer, (dict, list)) else None,
            )
        )
        step += 1

    await executemany(
        conn,
        """
        INSERT INTO survey.prom_answer (
            submission_id, hospital_code, case_id, patient_id, instrument_code, question_code,
            display_order, answer_value_numeric, answer_value_text, answer_value_jsonb,
            answered_at, created_at, updated_at
        ) VALUES (
            %s, %s, %s, %s, %s, %s,
            %s, %s, %s, %s::jsonb,
            now(), now(), now()
        )
        """,
        answer_rows,
    )
    return SurveySubmitResponse(is_completed=True, submitted_at=submission_row["submitted_at"])
