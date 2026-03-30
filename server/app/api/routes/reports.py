from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.api.deps import AuthenticatedContext, require_auth
from app.core.responses import success
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("")
async def get_report_data(
    date_from: date | None = None,
    date_to: date | None = None,
    ctx: AuthenticatedContext = Depends(require_auth),
):
    data = await report_service.get_report_data(ctx.conn, date_from=date_from, date_to=date_to)
    return success("리포트 데이터 조회가 완료되었습니다.", data.model_dump())


@router.get("/download")
async def download_report(
    date_from: date | None = None,
    date_to: date | None = None,
    ctx: AuthenticatedContext = Depends(require_auth),
):
    csv_bytes = await report_service.generate_report_csv(ctx.conn, date_from=date_from, date_to=date_to)
    filename = f"ksor_report_{date_from or 'all'}_{date_to or 'all'}.csv"
    return StreamingResponse(
        iter([csv_bytes]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/pdf")
async def download_report_pdf(
    date_from: date | None = None,
    date_to: date | None = None,
    ctx: AuthenticatedContext = Depends(require_auth),
):
    """Backwards-compatible alias for /download. Returns CSV despite the route name."""
    csv_bytes = await report_service.generate_report_csv(ctx.conn, date_from=date_from, date_to=date_to)
    filename = f"ksor_report_{date_from or 'all'}_{date_to or 'all'}.csv"
    return StreamingResponse(
        iter([csv_bytes]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
