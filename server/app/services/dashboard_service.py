from __future__ import annotations

from datetime import date
from typing import Any

from psycopg import AsyncConnection

from app.db.queries import fetch_all, fetch_one, fetch_val
from app.models.dashboard import BenchmarkResponse, OutcomeSummary, OutcomesResponse, OverallImprovementRate, SurgeriesResponse


async def get_summary(
    conn: AsyncConnection,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    procedure_code: str | None = None,
    diagnosis_code: str | None = None,
) -> dict[str, Any]:
    filters = ["1=1"]
    params: list[Any] = []
    if start_date:
        filters.append("visit_date >= %s")
        params.append(start_date)
    if end_date:
        filters.append("visit_date <= %s")
        params.append(end_date)
    if procedure_code:
        filters.append("procedure_code = %s")
        params.append(procedure_code)
    if diagnosis_code:
        filters.append("diagnosis_code = %s")
        params.append(diagnosis_code)
    where_sql = " AND ".join(filters)

    total_surgeries = int(
        await fetch_val(
            conn,
            f"SELECT count(*) FROM clinical.case_record WHERE surgery_date IS NOT NULL AND {where_sql}",
            params,
            default=0,
        )
    )
    monthly_surgeries = int(
        await fetch_val(
            conn,
            f"""
            SELECT count(*)
            FROM clinical.case_record
            WHERE surgery_date >= date_trunc('month', now())::date
              AND surgery_date < (date_trunc('month', now()) + interval '1 month')::date
              AND {where_sql}
            """,
            params,
            default=0,
        )
    )
    prom_pending_cases = int(
        await fetch_val(
            conn,
            """
            SELECT count(*)
            FROM survey.prom_request
            WHERE token_status IN ('READY', 'SENT', 'OPENED', 'VERIFIED')
            """,
            (),
            default=0,
        )
    )
    return {
        "total_surgeries": total_surgeries,
        "monthly_surgeries": monthly_surgeries,
        "prom_pending_cases": prom_pending_cases,
    }


async def get_surgeries(
    conn: AsyncConnection,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    procedure_code: str | None = None,
    diagnosis_code: str | None = None,
) -> SurgeriesResponse:
    filters = ["1=1"]
    params: list[Any] = []
    if start_date:
        filters.append("coalesce(surgery_date, visit_date) >= %s")
        params.append(start_date)
    if end_date:
        filters.append("coalesce(surgery_date, visit_date) <= %s")
        params.append(end_date)
    if procedure_code:
        filters.append("procedure_code = %s")
        params.append(procedure_code)
    if diagnosis_code:
        filters.append("diagnosis_code = %s")
        params.append(diagnosis_code)
    where_sql = " AND ".join(filters)

    monthly = await fetch_all(
        conn,
        f"""
        SELECT to_char(date_trunc('month', coalesce(surgery_date, visit_date)), 'YYYY-MM') AS month,
               count(*)::int AS count
        FROM clinical.case_record
        WHERE {where_sql}
        GROUP BY 1
        ORDER BY 1
        """,
        params,
    )
    procedure_rows = await fetch_all(
        conn,
        f"""
        SELECT coalesce(procedure_code, 'UNKNOWN') AS label,
               count(*)::int AS count,
               round((count(*) * 100.0 / nullif(sum(count(*)) over(), 0))::numeric, 1)::float AS percentage
        FROM clinical.case_record
        WHERE {where_sql}
        GROUP BY 1
        ORDER BY count DESC
        """,
        params,
    )
    diagnosis_rows = await fetch_all(
        conn,
        f"""
        SELECT coalesce(diagnosis_code, 'UNKNOWN') AS label,
               count(*)::int AS count,
               round((count(*) * 100.0 / nullif(sum(count(*)) over(), 0))::numeric, 1)::float AS percentage
        FROM clinical.case_record
        WHERE {where_sql}
        GROUP BY 1
        ORDER BY count DESC
        """,
        params,
    )
    return SurgeriesResponse(
        monthly_trends=monthly,
        procedure_ratio=procedure_rows,
        diagnosis_ratio=diagnosis_rows,
    )


async def get_outcomes(
    conn: AsyncConnection,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    procedure_code: str | None = None,
    diagnosis_code: str | None = None,
) -> OutcomesResponse:
    filters = ["ps.is_valid"]
    params: list[Any] = []
    if start_date:
        filters.append("cr.visit_date >= %s")
        params.append(start_date)
    if end_date:
        filters.append("cr.visit_date <= %s")
        params.append(end_date)
    if procedure_code:
        filters.append("cr.procedure_code = %s")
        params.append(procedure_code)
    if diagnosis_code:
        filters.append("cr.diagnosis_code = %s")
        params.append(diagnosis_code)
    where_sql = " AND ".join(filters)

    rows = await fetch_all(
        conn,
        f"""
        SELECT
            ps.timepoint_code AS timepoint,
            round(avg(ps.vas_back)::numeric, 1)::float AS vas_back,
            round(avg(ps.vas_leg)::numeric, 1)::float AS vas_leg,
            round(avg(ps.odi_score)::numeric, 1)::float AS odi,
            round(avg(ps.ndi_score)::numeric, 1)::float AS ndi
        FROM survey.prom_submission ps
        JOIN clinical.case_record cr ON cr.case_id = ps.case_id
        WHERE {where_sql}
        GROUP BY ps.timepoint_code
        ORDER BY min(ps.submitted_at)
        """,
        params,
    )
    summary_row = await fetch_one(
        conn,
        f"""
        SELECT
            round(avg(cef.hospital_stay_days)::numeric, 1)::float AS average_los_days,
            round((avg(case when cof.complication_yn is true then 1 else 0 end) * 100)::numeric, 1)::float AS complication_rate
        FROM clinical.case_record cr
        LEFT JOIN clinical.case_extended_form cef ON cef.case_id = cr.case_id
        LEFT JOIN clinical.case_outcome_form cof ON cof.case_id = cr.case_id
        WHERE {where_sql.replace('ps.is_valid', '1=1')}
        """,
        params,
    )
    return OutcomesResponse(
        prom_trends=rows,
        outcome_summary=OutcomeSummary(**(summary_row or {})),
    )


async def get_benchmark(
    conn: AsyncConnection,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    procedure_code: str | None = None,
    diagnosis_code: str | None = None,
) -> BenchmarkResponse:
    filters = ["ps.is_valid"]
    params: list[Any] = []
    if start_date:
        filters.append("cr.visit_date >= %s")
        params.append(start_date)
    if end_date:
        filters.append("cr.visit_date <= %s")
        params.append(end_date)
    if procedure_code:
        filters.append("cr.procedure_code = %s")
        params.append(procedure_code)
    if diagnosis_code:
        filters.append("cr.diagnosis_code = %s")
        params.append(diagnosis_code)
    where_sql = " AND ".join(filters)

    my_rows = await fetch_all(
        conn,
        f"""
        SELECT ps.timepoint_code AS timepoint,
               round(avg(ps.odi_score)::numeric, 1)::float AS my_hospital
        FROM survey.prom_submission ps
        JOIN clinical.case_record cr ON cr.case_id = ps.case_id
        WHERE {where_sql}
        GROUP BY ps.timepoint_code
        ORDER BY ps.timepoint_code
        """,
        params,
    )
    global_rows = await fetch_all(
        conn,
        "SELECT timepoint_code AS timepoint, avg_odi_score AS ksor_average FROM analytics.mv_global_prom_benchmark ORDER BY timepoint_code",
    )
    merged: dict[str, dict[str, Any]] = {}
    for row in global_rows:
        merged.setdefault(row["timepoint"], {}).update(row)
    for row in my_rows:
        merged.setdefault(row["timepoint"], {}).update(row)
    ordered = [
        {
            "timepoint": key,
            "my_hospital": merged[key].get("my_hospital"),
            "ksor_average": merged[key].get("ksor_average"),
        }
        for key in sorted(merged.keys())
    ]

    overall = await fetch_one(
        conn,
        f"""
        SELECT round(avg(ps.odi_score)::numeric, 1)::float AS my_hospital
        FROM survey.prom_submission ps
        JOIN clinical.case_record cr ON cr.case_id = ps.case_id
        WHERE {where_sql}
        """,
        params,
    )
    global_overall = await fetch_one(
        conn,
        "SELECT round(avg(avg_odi_score)::numeric, 1)::float AS ksor_average FROM analytics.mv_global_prom_benchmark",
    )
    return BenchmarkResponse(
        odi_improvement_trend=ordered,
        overall_improvement_rate=OverallImprovementRate(
            indicator="ODI 평균",
            my_hospital=(overall or {}).get("my_hospital"),
            ksor_average=(global_overall or {}).get("ksor_average"),
        ),
    )
