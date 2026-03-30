from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends

from app.api.deps import AuthenticatedContext, require_auth
from app.core.responses import success
from app.services import dashboard_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def summary(
    start_date: date | None = None,
    end_date: date | None = None,
    procedure_code: str | None = None,
    diagnosis_code: str | None = None,
    ctx: AuthenticatedContext = Depends(require_auth),
):
    data = await dashboard_service.get_summary(ctx.conn, start_date=start_date, end_date=end_date, procedure_code=procedure_code, diagnosis_code=diagnosis_code)
    return success("요약 데이터 조회가 완료되었습니다.", data)


@router.get("/my-surgeries")
async def my_surgeries(
    start_date: date | None = None,
    end_date: date | None = None,
    procedure_code: str | None = None,
    diagnosis_code: str | None = None,
    ctx: AuthenticatedContext = Depends(require_auth),
):
    data = await dashboard_service.get_surgeries(ctx.conn, start_date=start_date, end_date=end_date, procedure_code=procedure_code, diagnosis_code=diagnosis_code)
    return success("수술 통계 데이터 조회가 완료되었습니다.", data.model_dump())


@router.get("/outcomes")
async def outcomes(
    start_date: date | None = None,
    end_date: date | None = None,
    procedure_code: str | None = None,
    diagnosis_code: str | None = None,
    ctx: AuthenticatedContext = Depends(require_auth),
):
    data = await dashboard_service.get_outcomes(ctx.conn, start_date=start_date, end_date=end_date, procedure_code=procedure_code, diagnosis_code=diagnosis_code)
    return success("임상 결과 트렌드 조회가 완료되었습니다.", data.model_dump())


@router.get("/benchmark")
async def benchmark(
    start_date: date | None = None,
    end_date: date | None = None,
    procedure_code: str | None = None,
    diagnosis_code: str | None = None,
    ctx: AuthenticatedContext = Depends(require_auth),
):
    data = await dashboard_service.get_benchmark(ctx.conn, start_date=start_date, end_date=end_date, procedure_code=procedure_code, diagnosis_code=diagnosis_code)
    return success("벤치마킹 데이터 조회가 완료되었습니다.", data.model_dump())
