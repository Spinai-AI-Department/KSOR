from __future__ import annotations

import csv
import io
import json
from collections.abc import Iterable
from datetime import datetime, timezone
from typing import Any

from fastapi.responses import StreamingResponse
from psycopg import AsyncConnection

from app.core.exceptions import ForbiddenError, NotFoundError
from app.db.queries import execute, fetch_all, fetch_one
from app.models.export import GlobalExportApprovalRequest, GlobalExportRequestCreate


async def _site_export_rows(
    conn: AsyncConnection,
    *,
    start_date: str | None = None,
    end_date: str | None = None,
    procedure_code: str | None = None,
    diagnosis_code: str | None = None,
    timepoint_code: str | None = None,
    global_scope: bool = False,
) -> list[dict[str, Any]]:
    filters = ["1=1"]
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
    if timepoint_code:
        filters.append("ps.timepoint_code = %s")
        params.append(timepoint_code)
    where_sql = " AND ".join(filters)

    select_hospital = "cr.hospital_code AS hospital_code," if global_scope else "NULL::text AS hospital_code,"
    return await fetch_all(
        conn,
        f"""
        SELECT
            {select_hospital}
            cr.case_id,
            cr.registration_no,
            p.patient_initial,
            p.sex,
            p.birth_year,
            cr.visit_date,
            cr.surgery_date,
            cr.diagnosis_code,
            cr.procedure_code,
            ps.timepoint_code,
            ps.vas_back,
            ps.vas_leg,
            ps.odi_score,
            ps.ndi_score,
            ps.eq5d_index,
            ps.eq_vas,
            ps.satisfaction,
            ps.global_impression,
            ps.returned_to_work,
            ps.submitted_at
        FROM clinical.case_record cr
        JOIN patient.patient p ON p.patient_id = cr.patient_id
        LEFT JOIN survey.prom_submission ps ON ps.case_id = cr.case_id AND ps.is_valid
        WHERE {where_sql}
        ORDER BY cr.visit_date DESC, cr.case_id DESC, ps.submitted_at DESC NULLS LAST
        """,
        params,
    )



def _csv_response(rows: list[dict[str, Any]], filename: str) -> StreamingResponse:
    def iter_bytes() -> Iterable[bytes]:
        if not rows:
            header = b"case_id,registration_no\n"
            yield header
            return
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        yield buf.getvalue().encode("utf-8-sig")
        buf.seek(0)
        buf.truncate(0)
        for row in rows:
            writer.writerow(row)
            yield buf.getvalue().encode("utf-8")
            buf.seek(0)
            buf.truncate(0)

    return StreamingResponse(
        iter_bytes(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def export_site_csv(conn: AsyncConnection, filters: dict[str, Any]) -> StreamingResponse:
    rows = await _site_export_rows(conn, **filters, global_scope=False)
    filename = f"ksor_site_export_{datetime.now(tz=timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return _csv_response(rows, filename)


async def create_global_export_request(conn: AsyncConnection, requester_user_id, requester_hospital_code: str | None, payload: GlobalExportRequestCreate) -> dict[str, Any]:
    row = await fetch_one(
        conn,
        """
        INSERT INTO ops.data_export_request (
            export_request_id, requester_user_id, requester_hospital_code, export_scope,
            approval_status, reason, filter_jsonb, deidentify_mode,
            created_at, created_by, updated_at, updated_by
        ) VALUES (
            gen_random_uuid(), %s, %s, 'GLOBAL',
            'REQUESTED', %s, %s::jsonb, 'STRICT',
            now(), %s, now(), %s
        )
        RETURNING export_request_id, requester_user_id, requester_hospital_code, export_scope::text AS export_scope,
                  approval_status::text AS approval_status, reason, created_at
        """,
        (
            str(requester_user_id),
            requester_hospital_code,
            payload.reason,
            json.dumps(payload.filter_jsonb, ensure_ascii=False),
            str(requester_user_id),
            str(requester_user_id),
        ),
    )
    return row


async def list_global_export_requests(conn: AsyncConnection) -> list[dict[str, Any]]:
    return await fetch_all(
        conn,
        """
        SELECT export_request_id, requester_user_id, requester_hospital_code,
               export_scope::text AS export_scope, approval_status::text AS approval_status,
               reason, created_at, reviewed_at, review_comment
        FROM ops.data_export_request
        ORDER BY created_at DESC
        """,
    )


async def approve_global_export_request(conn: AsyncConnection, export_request_id, reviewer_user_id, payload: GlobalExportApprovalRequest) -> dict[str, Any]:
    status = "APPROVED" if payload.approved else "REJECTED"
    row = await fetch_one(
        conn,
        """
        UPDATE ops.data_export_request
           SET approval_status = %s::ops.approval_status,
               reviewed_by = %s,
               reviewed_at = now(),
               approved_until = %s,
               review_comment = %s,
               updated_at = now(),
               updated_by = %s
         WHERE export_request_id = %s
     RETURNING export_request_id, requester_user_id, requester_hospital_code,
               export_scope::text AS export_scope, approval_status::text AS approval_status,
               reason, created_at, reviewed_at, review_comment
        """,
        (
            status,
            str(reviewer_user_id),
            payload.approved_until,
            payload.review_comment,
            str(reviewer_user_id),
            str(export_request_id),
        ),
    )
    if not row:
        raise NotFoundError(message="반출 요청을 찾을 수 없습니다.", error_code="EXPORT_REQUEST_NOT_FOUND")
    return row


async def download_global_export(conn: AsyncConnection, export_request_id, downloader_user_id) -> StreamingResponse:
    row = await fetch_one(
        conn,
        """
        SELECT export_request_id, approval_status::text AS approval_status, filter_jsonb, approved_until
        FROM ops.data_export_request
        WHERE export_request_id = %s
        """,
        (str(export_request_id),),
    )
    if not row:
        raise NotFoundError(message="반출 요청을 찾을 수 없습니다.", error_code="EXPORT_REQUEST_NOT_FOUND")
    if row["approval_status"] != "APPROVED":
        raise ForbiddenError(message="승인된 반출 요청만 다운로드할 수 있습니다.")
    filters = dict(row["filter_jsonb"] or {})
    rows = await _site_export_rows(conn, **filters, global_scope=True)
    await execute(
        conn,
        """
        INSERT INTO ops.export_download_log (
            export_download_id, export_request_id, downloaded_by, client_ip, user_agent, success, downloaded_at
        ) VALUES (
            gen_random_uuid(), %s, %s, NULL, NULL, true, now()
        )
        """,
        (str(export_request_id), str(downloader_user_id)),
    )
    await execute(
        conn,
        """
        UPDATE ops.data_export_request
           SET download_count = download_count + 1,
               last_downloaded_at = now(),
               approval_status = 'DOWNLOADED',
               updated_at = now()
         WHERE export_request_id = %s
        """,
        (str(export_request_id),),
    )
    filename = f"ksor_global_export_{datetime.now(tz=timezone.utc).strftime('%Y%m%d_%H%M%S')}.csv"
    return _csv_response(rows, filename)
