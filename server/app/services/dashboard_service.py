from __future__ import annotations

from datetime import date
from typing import Any

from psycopg import AsyncConnection

from app.db.queries import fetch_all, fetch_one, fetch_val
from app.models.dashboard import (
    ApproachComparisonItem,
    BenchmarkResponse,
    OutcomeSummary,
    OutcomesResponse,
    OverallImprovementRate,
    PatientOutcomePoint,
    RecentFollowupItem,
    SatisfactionScoreItem,
    StatisticsResponse,
    StatisticsSummary,
    SurgeriesResponse,
)


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
    avg_op_time_raw = await fetch_val(
        conn,
        "SELECT round(avg(operation_minutes)::numeric, 1)::float FROM clinical.case_extended_form",
        (),
        default=None,
    )
    avg_op_time_min: float | None = float(avg_op_time_raw) if avg_op_time_raw is not None else None
    complications_count = int(
        await fetch_val(
            conn,
            "SELECT count(*) FROM clinical.case_outcome_form WHERE complication_yn = true",
            (),
            default=0,
        )
    )
    return {
        "total_surgeries": total_surgeries,
        "monthly_surgeries": monthly_surgeries,
        "prom_pending_cases": prom_pending_cases,
        "avg_op_time_min": avg_op_time_min,
        "complications_count": complications_count,
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


async def get_statistics(
    conn: AsyncConnection,
    *,
    start_date: date | None = None,
    end_date: date | None = None,
    procedure_code: str | None = None,
    diagnosis_code: str | None = None,
) -> StatisticsResponse:
    filters = ["cr.surgery_date IS NOT NULL"]
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

    # 1) Approach comparison
    approach_rows = await fetch_all(
        conn,
        f"""
        SELECT
            coalesce(cef.approach_type, 'UNKNOWN') AS approach_type,
            round(avg(cef.operation_minutes)::numeric, 1)::float AS avg_op_time_minutes,
            round(avg(cef.estimated_blood_loss_ml)::numeric, 1)::float AS avg_blood_loss_ml,
            round(avg(cef.hospital_stay_days)::numeric, 1)::float AS avg_hospital_days,
            round((avg(CASE WHEN cof.complication_yn IS TRUE THEN 1 ELSE 0 END) * 100)::numeric, 1)::float AS complication_rate,
            count(*)::int AS case_count
        FROM clinical.case_record cr
        LEFT JOIN clinical.case_extended_form cef ON cef.case_id = cr.case_id
        LEFT JOIN clinical.case_outcome_form cof ON cof.case_id = cr.case_id
        WHERE {where_sql}
        GROUP BY coalesce(cef.approach_type, 'UNKNOWN')
        ORDER BY case_count DESC
        """,
        params,
    )
    approach_comparison = [ApproachComparisonItem(**row) for row in (approach_rows or [])]

    # 2) Satisfaction scores (surgeon_global_outcome distribution)
    satisfaction_rows = await fetch_all(
        conn,
        f"""
        SELECT
            cof.surgeon_global_outcome AS score,
            count(*)::int AS count,
            round((count(*) * 100.0 / nullif(sum(count(*)) over(), 0))::numeric, 1)::float AS percentage
        FROM clinical.case_record cr
        JOIN clinical.case_outcome_form cof ON cof.case_id = cr.case_id
        WHERE {where_sql}
          AND cof.surgeon_global_outcome IS NOT NULL
        GROUP BY cof.surgeon_global_outcome
        ORDER BY cof.surgeon_global_outcome
        """,
        params,
    )
    satisfaction_scores = [SatisfactionScoreItem(**row) for row in (satisfaction_rows or [])]

    # 3) Patient outcomes scatter data (preop vs postop ODI)
    outcome_rows = await fetch_all(
        conn,
        f"""
        WITH preop AS (
            SELECT ps.case_id, ps.odi_score AS preop_odi
            FROM survey.prom_submission ps
            WHERE ps.is_valid AND ps.timepoint_code IN ('PRE_OP', 'PREOP')
        ),
        postop AS (
            SELECT DISTINCT ON (ps.case_id)
                ps.case_id, ps.odi_score AS postop_odi
            FROM survey.prom_submission ps
            WHERE ps.is_valid AND ps.timepoint_code NOT IN ('PRE_OP', 'PREOP')
            ORDER BY ps.case_id, ps.submitted_at DESC
        )
        SELECT
            cr.case_id::text,
            cr.registration_no,
            pre.preop_odi::float,
            post.postop_odi::float,
            round((coalesce(pre.preop_odi, 0) - coalesce(post.postop_odi, 0))::numeric, 1)::float AS improvement,
            CASE WHEN p.birth_year IS NOT NULL
                 THEN extract(year FROM now())::int - p.birth_year
                 ELSE NULL END AS age,
            cef.approach_type,
            cof.surgeon_global_outcome AS satisfaction_score
        FROM clinical.case_record cr
        JOIN preop pre ON pre.case_id = cr.case_id
        JOIN postop post ON post.case_id = cr.case_id
        LEFT JOIN patient.patient p ON p.patient_id = cr.patient_id
        LEFT JOIN clinical.case_extended_form cef ON cef.case_id = cr.case_id
        LEFT JOIN clinical.case_outcome_form cof ON cof.case_id = cr.case_id
        WHERE {where_sql}
        ORDER BY improvement DESC
        LIMIT 200
        """,
        params,
    )
    patient_outcomes = [PatientOutcomePoint(**row) for row in (outcome_rows or [])]

    # 4) Summary metrics
    # VAS improvement: average percentage improvement from preop to latest postop
    vas_improvement_row = await fetch_one(
        conn,
        f"""
        WITH preop AS (
            SELECT ps.case_id, avg(ps.vas_back) AS preop_vas
            FROM survey.prom_submission ps
            WHERE ps.is_valid AND ps.timepoint_code IN ('PRE_OP', 'PREOP')
            GROUP BY ps.case_id
        ),
        postop AS (
            SELECT DISTINCT ON (ps.case_id)
                ps.case_id, ps.vas_back AS postop_vas
            FROM survey.prom_submission ps
            WHERE ps.is_valid AND ps.timepoint_code NOT IN ('PRE_OP', 'PREOP')
            ORDER BY ps.case_id, ps.submitted_at DESC
        )
        SELECT
            round((avg(CASE WHEN pre.preop_vas > 0 THEN ((pre.preop_vas - post.postop_vas) / pre.preop_vas) * 100 END))::numeric, 1)::float AS avg_vas_improvement
        FROM clinical.case_record cr
        JOIN preop pre ON pre.case_id = cr.case_id
        JOIN postop post ON post.case_id = cr.case_id
        WHERE {where_sql}
        """,
        params,
    )
    # ODI improvement: average percentage improvement from preop to latest postop
    odi_improvement_row = await fetch_one(
        conn,
        f"""
        WITH preop AS (
            SELECT ps.case_id, avg(ps.odi_score) AS preop_odi
            FROM survey.prom_submission ps
            WHERE ps.is_valid AND ps.timepoint_code IN ('PRE_OP', 'PREOP')
            GROUP BY ps.case_id
        ),
        postop AS (
            SELECT DISTINCT ON (ps.case_id)
                ps.case_id, ps.odi_score AS postop_odi
            FROM survey.prom_submission ps
            WHERE ps.is_valid AND ps.timepoint_code NOT IN ('PRE_OP', 'PREOP')
            ORDER BY ps.case_id, ps.submitted_at DESC
        )
        SELECT
            round((avg(CASE WHEN pre.preop_odi > 0 THEN ((pre.preop_odi - post.postop_odi) / pre.preop_odi) * 100 END))::numeric, 1)::float AS avg_odi_improvement
        FROM clinical.case_record cr
        JOIN preop pre ON pre.case_id = cr.case_id
        JOIN postop post ON post.case_id = cr.case_id
        WHERE {where_sql}
        """,
        params,
    )
    # Satisfaction rate: percentage of patients with surgeon_global_outcome >= 4
    satisfaction_row = await fetch_one(
        conn,
        f"""
        SELECT
            round((avg(CASE WHEN cof.surgeon_global_outcome >= 4 THEN 1 ELSE 0 END) * 100)::numeric, 1)::float AS satisfaction_rate,
            count(*)::int AS total_cases
        FROM clinical.case_record cr
        JOIN clinical.case_outcome_form cof ON cof.case_id = cr.case_id
        WHERE {where_sql}
          AND cof.surgeon_global_outcome IS NOT NULL
        """,
        params,
    )
    # Reoperation rate
    reoperation_row = await fetch_one(
        conn,
        f"""
        SELECT
            round((avg(CASE WHEN cof.reoperation_yn IS TRUE THEN 1 ELSE 0 END) * 100)::numeric, 1)::float AS reoperation_rate
        FROM clinical.case_record cr
        JOIN clinical.case_outcome_form cof ON cof.case_id = cr.case_id
        WHERE {where_sql}
        """,
        params,
    )

    summary = StatisticsSummary(
        avg_vas_improvement=(vas_improvement_row or {}).get("avg_vas_improvement"),
        avg_odi_improvement=(odi_improvement_row or {}).get("avg_odi_improvement"),
        satisfaction_rate=(satisfaction_row or {}).get("satisfaction_rate"),
        reoperation_rate=(reoperation_row or {}).get("reoperation_rate"),
        total_cases=(satisfaction_row or {}).get("total_cases", 0),
    )

    return StatisticsResponse(
        summary=summary,
        approach_comparison=approach_comparison,
        satisfaction_scores=satisfaction_scores,
        patient_outcomes=patient_outcomes,
    )


async def get_recent_followups(
    conn: AsyncConnection,
    *,
    limit: int = 20,
) -> list[RecentFollowupItem]:
    rows = await fetch_all(
        conn,
        """
        SELECT
            cr.patient_id::text AS patient_id,
            cr.case_id::text AS case_id,
            cr.registration_no,
            p.patient_initial,
            pr.timepoint_code AS timepoint,
            pr.token_status::text AS status,
            to_char(coalesce(pr.submitted_at, pr.requested_at), 'YYYY-MM-DD') AS date
        FROM survey.prom_request pr
        JOIN clinical.case_record cr ON cr.case_id = pr.case_id
        JOIN patient.patient p ON p.patient_id = cr.patient_id AND p.hospital_code = cr.hospital_code
        ORDER BY coalesce(pr.submitted_at, pr.requested_at) DESC
        LIMIT %s
        """,
        (limit,),
    )
    return [RecentFollowupItem(**row) for row in (rows or [])]
