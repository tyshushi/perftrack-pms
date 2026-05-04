"""Scorecards route"""
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.core.security import get_current_user, require_hr_admin
from app.models.user import Scorecard, User
from app.services.kpi_workflow import KpiWorkflowService
from app.services.bell_curve import BellCurveService

router = APIRouter()


@router.get("/")
async def list_scorecards(
    cycle_id:      UUID,
    department_id: Optional[UUID] = None,
    db:            AsyncSession   = Depends(get_db),
    current_user:  User           = Depends(get_current_user),
):
    q = select(Scorecard, User).join(User, User.id == Scorecard.user_id)\
        .where(Scorecard.cycle_id == cycle_id)
    if department_id:
        q = q.where(User.department_id == department_id)
    if current_user.role.value == "STAFF":
        q = q.where(Scorecard.user_id == current_user.id)
    result = await db.execute(q.order_by(Scorecard.final_score.desc().nulls_last()))
    rows = result.all()
    return [
        {
            "id": str(sc.id), "user_id": str(sc.user_id),
            "full_name": u.full_name, "employee_id": u.employee_id,
            "self_total": float(sc.self_total) if sc.self_total else None,
            "mgr_total": float(sc.mgr_total) if sc.mgr_total else None,
            "final_score": float(sc.final_score) if sc.final_score else None,
            "performance_band": sc.performance_band,
            "band_rank": sc.band_rank,
            "percentile": float(sc.percentile) if sc.percentile else None,
            "increment_pct": float(sc.increment_pct) if sc.increment_pct else None,
            "increment_status": sc.increment_status.value if sc.increment_status else None,
            "eval_status": sc.eval_status.value,
            "is_locked": sc.is_locked,
        }
        for sc, u in rows
    ]


@router.post("/recalculate")
async def recalculate_scorecard(
    cycle_id: UUID,
    user_id:  Optional[UUID] = None,
    db:       AsyncSession   = Depends(get_db),
    current_user: User       = Depends(get_current_user),
):
    target = user_id or current_user.id
    svc = KpiWorkflowService(db)
    sc = await svc.recalculate_scorecard(cycle_id, target)
    sc = await svc.apply_increment(sc, cycle_id)
    return {"final_score": float(sc.final_score) if sc.final_score else None,
            "increment_pct": float(sc.increment_pct) if sc.increment_pct else None}


@router.post("/bell-curve")
async def run_bell_curve(
    cycle_id: UUID,
    db:       AsyncSession = Depends(get_db),
    _:        User         = Depends(require_hr_admin),
):
    svc = BellCurveService(db)
    return await svc.run_for_cycle(cycle_id)
