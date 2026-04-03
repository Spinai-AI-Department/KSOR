from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.core.config import settings
from app.core.logging import configure_logging
from app.db.pool import db
from app.db.queries import execute, fetch_all, fetch_one

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 3600  # 1시간마다 체크


async def _set_system_context(conn) -> None:
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT app_private.set_context(%s, %s, %s, %s, %s, false)",
            (None, None, "SYSTEM", None, None),
        )


async def find_due_cases(conn) -> list[dict]:
    """오늘 발송해야 할 케이스+시점 목록 반환.

    조건:
    - surgery_date + day_offset_from_sx = 오늘
    - 의사가 해당 시점을 followup_timepoints에 선택했음
    - 해당 case+timepoint에 이미 유효한 prom_request 없음 (SUBMITTED/EXPIRED/REVOKED 제외)
    - 환자 연락처(phone_sha256) 존재
    """
    rows = await fetch_all(
        conn,
        """
        SELECT
            cr.case_id,
            cr.hospital_code,
            cr.patient_id,
            cr.surgeon_user_id,
            tp.timepoint_code
        FROM clinical.case_record cr
        JOIN clinical.case_initial_form cif ON cif.case_id = cr.case_id
        JOIN ref.timepoint tp
          ON tp.day_offset_from_sx IS NOT NULL
         AND cr.surgery_date + tp.day_offset_from_sx = CURRENT_DATE
        JOIN vault.patient_identity vi
          ON vi.patient_id = cr.patient_id
         AND vi.phone_sha256 IS NOT NULL
        WHERE cr.case_status IN ('ACTIVE', 'LOCKED')
          AND (
            cif.additional_attributes -> 'followup_timepoints' @> to_jsonb(tp.timepoint_code)
            OR cif.additional_attributes -> 'followup_timepoints' @> to_jsonb(
                CASE tp.timepoint_code
                    WHEN 'POSTOP_1M'  THEN 'POST_1M'
                    WHEN 'POSTOP_3M'  THEN 'POST_3M'
                    WHEN 'POSTOP_6M'  THEN 'POST_6M'
                    WHEN 'POSTOP_12M' THEN 'POST_1Y'
                    WHEN 'POSTOP_24M' THEN 'POST_24M'
                    ELSE tp.timepoint_code
                END
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM survey.prom_request pr
            WHERE pr.case_id = cr.case_id
              AND pr.timepoint_code = tp.timepoint_code
              AND pr.token_status NOT IN ('EXPIRED', 'REVOKED', 'FAILED')
          )
          AND tp.timepoint_code NOT LIKE '%PREOP%'
          AND tp.timepoint_code NOT LIKE '%PRE_OP%'
        """,
    )
    return rows or []


async def _send_one(conn, case_id: UUID, hospital_code: str, patient_id: UUID, surgeon_user_id: UUID, timepoint_code: str) -> None:
    expires_at = datetime.now(tz=timezone.utc) + timedelta(days=settings.prom_scheduler_expire_days)

    identity = await fetch_one(
        conn,
        "SELECT phone_sha256 FROM vault.patient_identity WHERE patient_id = %s",
        (str(patient_id),),
    )
    if not identity or not identity["phone_sha256"]:
        logger.warning("prom_scheduler_skip_no_phone", extra={"case_id": str(case_id), "timepoint": timepoint_code})
        return

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
        RETURNING request_id, token_uuid
        """,
        (
            hospital_code,
            str(case_id),
            str(patient_id),
            timepoint_code,
            str(surgeon_user_id),
            expires_at,
            "자동 발송",
            str(surgeon_user_id),
            str(surgeon_user_id),
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
            hospital_code,
            str(case_id),
            str(patient_id),
            str(request_row["request_id"]),
            settings.alimtalk_template_fallback_vendor_code,
            f"prom:{case_id}:{timepoint_code}",
            __import__("json").dumps(
                {
                    "survey_url": survey_url,
                    "timepoint_code": timepoint_code,
                    "request_id": str(request_row["request_id"]),
                    "hospital_code": hospital_code,
                },
                ensure_ascii=False,
            ),
            f"[KSOR] PROM 입력 요청: {survey_url}",
            identity["phone_sha256"],
            str(surgeon_user_id),
            str(surgeon_user_id),
        ),
    )

    await execute(
        conn,
        "UPDATE survey.prom_request SET latest_message_id = %s, updated_at = now() WHERE request_id = %s",
        (str(message_row["message_id"]), str(request_row["request_id"])),
    )

    logger.info(
        "prom_scheduler_sent",
        extra={"case_id": str(case_id), "timepoint": timepoint_code, "request_id": str(request_row["request_id"])},
    )


async def run_once() -> int:
    """오늘 due된 케이스에 PROM 발송. 발송 건수 반환."""
    sent = 0
    async with db.pool.connection() as conn:
        await _set_system_context(conn)
        rows = await find_due_cases(conn)

    for row in rows:
        try:
            async with db.pool.connection() as conn:
                await _set_system_context(conn)
                await _send_one(
                    conn,
                    case_id=row["case_id"],
                    hospital_code=row["hospital_code"],
                    patient_id=row["patient_id"],
                    surgeon_user_id=row["surgeon_user_id"],
                    timepoint_code=row["timepoint_code"],
                )
                await conn.commit()
            sent += 1
        except Exception:
            logger.exception(
                "prom_scheduler_send_failed",
                extra={"case_id": str(row.get("case_id")), "timepoint": row.get("timepoint_code")},
            )
    return sent


async def main() -> None:
    configure_logging()
    await db.open()
    logger.info("prom_scheduler_started")
    try:
        while True:
            logger.info("prom_scheduler_tick")
            sent = await run_once()
            if sent:
                logger.info("prom_scheduler_tick_done", extra={"sent": sent})
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(main())
