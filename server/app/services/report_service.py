from __future__ import annotations

import csv
import io
from datetime import date
from typing import Any

from psycopg import AsyncConnection

from app.db.queries import fetch_all, fetch_one, fetch_val
from app.models.report import (
    MonthlyTrendItem,
    ReportResponse,
    ReportSummary,
    SurgeryOutcome,
)


def _build_date_filters(
    date_from: date | None,
    date_to: date | None,
    date_column: str = "cr.surgery_date",
) -> tuple[str, list[Any]]:
    filters = ["1=1"]
    params: list[Any] = []
    if date_from:
        filters.append(f"{date_column} >= %s")
        params.append(date_from)
    if date_to:
        filters.append(f"{date_column} <= %s")
        params.append(date_to)
    return " AND ".join(filters), params


async def get_report_data(
    conn: AsyncConnection,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> ReportResponse:
    where_sql, params = _build_date_filters(date_from, date_to)

    # --- summary ---
    total_surgeries = int(
        await fetch_val(
            conn,
            f"""
            SELECT count(*)
            FROM clinical.case_record cr
            WHERE cr.surgery_date IS NOT NULL
              AND {where_sql}
            """,
            params,
            default=0,
        )
    )

    summary_row = await fetch_one(
        conn,
        f"""
        SELECT
            round(
                (avg(CASE WHEN cof.complication_yn IS TRUE THEN 1 ELSE 0 END) * 100)::numeric, 1
            )::float AS complication_rate,
            round(avg(cef.hospital_stay_days)::numeric, 1)::float AS avg_hospital_days
        FROM clinical.case_record cr
        LEFT JOIN clinical.case_extended_form cef ON cef.case_id = cr.case_id
        LEFT JOIN clinical.case_outcome_form cof ON cof.case_id = cr.case_id
        WHERE cr.surgery_date IS NOT NULL
          AND {where_sql}
        """,
        params,
    )
    complication_rate = (summary_row or {}).get("complication_rate") or 0.0
    avg_hospital_days = (summary_row or {}).get("avg_hospital_days") or 0.0
    success_rate = round(100.0 - complication_rate, 1) if total_surgeries > 0 else 0.0

    summary = ReportSummary(
        total_surgeries=total_surgeries,
        success_rate=success_rate,
        complication_rate=complication_rate,
        avg_hospital_days=avg_hospital_days,
    )

    # --- monthly_trend ---
    monthly_rows = await fetch_all(
        conn,
        f"""
        SELECT
            to_char(date_trunc('month', cr.surgery_date), 'YYYY-MM') AS month,
            count(*)::int AS surgeries,
            coalesce(sum(CASE WHEN cof.complication_yn IS TRUE THEN 1 ELSE 0 END), 0)::int AS complications
        FROM clinical.case_record cr
        LEFT JOIN clinical.case_outcome_form cof ON cof.case_id = cr.case_id
        WHERE cr.surgery_date IS NOT NULL
          AND {where_sql}
        GROUP BY 1
        ORDER BY 1
        """,
        params,
    )
    monthly_trend = [MonthlyTrendItem(**row) for row in (monthly_rows or [])]

    # --- surgery_outcomes by approach_type ---
    outcome_rows = await fetch_all(
        conn,
        f"""
        SELECT
            coalesce(cef.approach_type, 'UNKNOWN') AS type,
            round(
                (1.0 - avg(CASE WHEN cof.complication_yn IS TRUE THEN 1 ELSE 0 END)) * 100, 1
            )::float AS success,
            round(
                avg(CASE WHEN cof.surgeon_global_outcome >= 4 THEN 1 ELSE 0 END) * 100, 1
            )::float AS improved
        FROM clinical.case_record cr
        LEFT JOIN clinical.case_extended_form cef ON cef.case_id = cr.case_id
        LEFT JOIN clinical.case_outcome_form cof ON cof.case_id = cr.case_id
        WHERE cr.surgery_date IS NOT NULL
          AND {where_sql}
        GROUP BY 1
        ORDER BY 1
        """,
        params,
    )
    surgery_outcomes = [SurgeryOutcome(**row) for row in (outcome_rows or [])]

    return ReportResponse(
        summary=summary,
        monthly_trend=monthly_trend,
        surgery_outcomes=surgery_outcomes,
    )


async def generate_report_csv(
    conn: AsyncConnection,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> bytes:
    report = await get_report_data(conn, date_from=date_from, date_to=date_to)

    # Fetch per-patient detail rows
    where_sql, params = _build_date_filters(date_from, date_to)
    detail_rows = await fetch_all(
        conn,
        f"""
        SELECT
            cr.registration_id AS "환자ID",
            cr.surgery_date AS "수술일",
            cr.diagnosis_code AS "진단코드",
            cr.procedure_code AS "수술코드",
            cef.approach_type AS "접근법",
            cef.surgery_level AS "수술레벨",
            cef.operation_minutes AS "수술시간(분)",
            cef.estimated_blood_loss_ml AS "출혈량(ml)",
            cef.hospital_stay_days AS "재원일수",
            cof.complication_yn AS "합병증여부",
            cof.complication_detail AS "합병증상세",
            cof.reoperation_yn AS "재수술여부",
            cof.surgeon_global_outcome AS "술자평가"
        FROM clinical.case_record cr
        LEFT JOIN clinical.case_extended_form cef ON cef.case_id = cr.case_id
        LEFT JOIN clinical.case_outcome_form cof ON cof.case_id = cr.case_id
        WHERE cr.surgery_date IS NOT NULL
          AND {where_sql}
        ORDER BY cr.surgery_date DESC, cr.registration_id
        """,
        params,
    )

    buf = io.StringIO()
    writer = csv.writer(buf)

    # Summary section
    writer.writerow(["=== 리포트 요약 ==="])
    writer.writerow(["총 수술 건수", "성공률(%)", "합병증률(%)", "평균 재원일수"])
    s = report.summary
    writer.writerow([s.total_surgeries, s.success_rate, s.complication_rate, s.avg_hospital_days])
    writer.writerow([])

    # Monthly trend section
    writer.writerow(["=== 월별 추이 ==="])
    writer.writerow(["월", "수술 건수", "합병증 건수"])
    for item in report.monthly_trend:
        writer.writerow([item.month, item.surgeries, item.complications])
    writer.writerow([])

    # Surgery outcomes section
    writer.writerow(["=== 수술 유형별 성과 ==="])
    writer.writerow(["수술 유형", "성공률(%)", "호전률(%)"])
    for item in report.surgery_outcomes:
        writer.writerow([item.type, item.success, item.improved])
    writer.writerow([])

    # Per-patient detail section
    writer.writerow(["=== 환자별 상세 데이터 ==="])
    if detail_rows:
        headers = list(detail_rows[0].keys())
        writer.writerow(headers)
        for row in detail_rows:
            writer.writerow([row[h] for h in headers])
    else:
        writer.writerow(["환자ID", "수술일", "진단코드", "수술코드", "접근법", "합병증여부"])
        writer.writerow(["데이터 없음"])

    return buf.getvalue().encode("utf-8-sig")
