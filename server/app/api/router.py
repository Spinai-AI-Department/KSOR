from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import admin, auth, dashboard, export, health, patients, reports, survey, webhooks

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(admin.router)
api_router.include_router(patients.router)
api_router.include_router(dashboard.router)
api_router.include_router(survey.router)
api_router.include_router(export.router)
api_router.include_router(reports.router)
api_router.include_router(webhooks.router)
