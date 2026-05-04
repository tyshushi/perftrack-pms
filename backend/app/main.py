from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import json, os

from app.core.config import settings
from app.db.session import engine
from app.api.routes import (
    auth, users, departments, cycles, weight_rules,
    kpi_templates, kpis, evaluations, scorecards,
    increments, notifications, admin
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Performance Management System",
    description="Enterprise PMS for ~6,000 users with multi-level KPI approval, evaluation, and increment calculation.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=json.loads(settings.CORS_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(auth.router,          prefix="/api/v1/auth",          tags=["Auth"])
app.include_router(users.router,         prefix="/api/v1/users",         tags=["Users"])
app.include_router(departments.router,   prefix="/api/v1/departments",   tags=["Departments"])
app.include_router(cycles.router,        prefix="/api/v1/cycles",        tags=["Cycles"])
app.include_router(weight_rules.router,  prefix="/api/v1/weight-rules",  tags=["Weight Rules"])
app.include_router(kpi_templates.router, prefix="/api/v1/kpi-templates", tags=["KPI Templates"])
app.include_router(kpis.router,          prefix="/api/v1/kpis",          tags=["KPIs"])
app.include_router(evaluations.router,   prefix="/api/v1/evaluations",   tags=["Evaluations"])
app.include_router(scorecards.router,    prefix="/api/v1/scorecards",    tags=["Scorecards"])
app.include_router(increments.router,    prefix="/api/v1/increments",    tags=["Increments"])
app.include_router(notifications.router, prefix="/api/v1/notifications", tags=["Notifications"])
app.include_router(admin.router,         prefix="/api/v1/admin",         tags=["Admin"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "PMS API v1.0"}
