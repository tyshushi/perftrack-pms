"""
Performance Cycles — full CRUD for HR Admin
"""
from uuid import UUID
from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import get_current_user, require_hr_admin
from app.models.user import PerformanceCycle, User, IncrementBand, BellCurveTarget, RatingScale, WeightRule

router = APIRouter()


VALID_APPROVAL_LEVELS = {"DM", "RM", "HOD"}


def normalise_approval_chain(value) -> list:
    """Coerce stored approval_chain (str/list/None) into a clean list."""
    import json as _json
    if value is None:
        return ["DM"]
    if isinstance(value, list):
        chain = value
    elif isinstance(value, str):
        s = value.strip()
        if s.startswith("["):
            try:
                chain = _json.loads(s)
            except Exception:
                chain = ["DM"]
        elif s == "DM_ONLY" or s == "":
            chain = ["DM"]
        else:
            chain = [p.strip() for p in s.split(",") if p.strip()]
    else:
        chain = ["DM"]
    chain = [str(x).upper() for x in chain if str(x).upper() in VALID_APPROVAL_LEVELS]
    if not chain or chain[0] != "DM":
        chain = ["DM"] + [c for c in chain if c != "DM"]
    seen = []
    for c in chain:
        if c not in seen:
            seen.append(c)
    return seen


def validate_approval_chain(chain: list) -> list:
    if not chain:
        raise HTTPException(400, "Approval chain cannot be empty")
    cleaned = []
    for level in chain:
        lv = str(level).upper()
        if lv not in VALID_APPROVAL_LEVELS:
            raise HTTPException(400, f"Invalid approval level: {level}")
        if lv not in cleaned:
            cleaned.append(lv)
    if cleaned[0] != "DM":
        raise HTTPException(400, "DM must always be the first level in the approval chain")
    return cleaned


class CycleCreate(BaseModel):
    name:               str
    year:               int
    kpi_setting_start:  date
    kpi_setting_end:    date
    self_eval_start:    date
    self_eval_end:      date
    mgr_eval_start:     date
    mgr_eval_end:       date
    mgr2_eval_start:    Optional[date] = None
    mgr2_eval_end:      Optional[date] = None
    hod_eval_start:     Optional[date] = None
    hod_eval_end:       Optional[date] = None
    calibration_start:  Optional[date] = None
    calibration_end:    Optional[date] = None
    rating_type:        Optional[str]  = "NUMERIC"
    rating_scale_max:   Optional[int]  = 5
    rating_levels:      Optional[list] = None
    approval_chain:     Optional[List[str]] = None


class IncrementBandIn(BaseModel):
    band_name:     str
    min_score:     float
    max_score:     float
    increment_pct: float
    description:   Optional[str] = None


class RatingScaleIn(BaseModel):
    score:       float
    label:       str
    description: Optional[str] = None
    color_hex:   Optional[str] = None


class WeightRuleIn(BaseModel):
    category:      str
    min_weight:    int
    max_weight:    int
    fixed_weight:  Optional[int] = None
    department_id: Optional[UUID] = None
    job_grade:     Optional[str] = None


@router.get("/")
async def list_cycles(
    db: AsyncSession = Depends(get_db),
    _:  User = Depends(get_current_user),
):
    result = await db.execute(select(PerformanceCycle).order_by(PerformanceCycle.year.desc()))
    cycles = result.scalars().all()
    return [
        {
            "id": str(c.id), "name": c.name, "year": c.year,
            "status": c.status,
            "kpi_setting_start": str(c.kpi_setting_start),
            "kpi_setting_end": str(c.kpi_setting_end),
            "self_eval_start": str(c.self_eval_start),
            "self_eval_end": str(c.self_eval_end),
            "rating_type":      c.rating_type or "NUMERIC",
            "rating_scale_max": c.rating_scale_max or 5,
            "rating_levels":    c.rating_levels,
            "approval_chain":   normalise_approval_chain(c.approval_chain),
        }
        for c in cycles
    ]


@router.get("/{cycle_id}")
async def get_cycle(
    cycle_id: UUID,
    db: AsyncSession = Depends(get_db),
    _:  User = Depends(get_current_user),
):
    result = await db.execute(select(PerformanceCycle).where(PerformanceCycle.id == cycle_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Cycle not found")
    return {
        "id": str(c.id), "name": c.name, "year": c.year,
        "status": c.status,
        "kpi_setting_start": str(c.kpi_setting_start),
        "kpi_setting_end": str(c.kpi_setting_end),
        "self_eval_start": str(c.self_eval_start),
        "self_eval_end": str(c.self_eval_end),
        "rating_type":      c.rating_type or "NUMERIC",
        "rating_scale_max": c.rating_scale_max or 5,
        "rating_levels":    c.rating_levels,
        "approval_chain":   normalise_approval_chain(c.approval_chain),
    }


@router.post("/")
async def create_cycle(
    body: CycleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in ["HR_ADMIN", "SUPER_ADMIN"]:
        raise HTTPException(403, "HR Admin only")
    data = body.model_dump()
    chain = validate_approval_chain(data.get("approval_chain") or ["DM"])
    data["approval_chain"] = chain
    cycle = PerformanceCycle(**data, created_by=current_user.id)
    db.add(cycle)
    await db.flush()
    await db.refresh(cycle)
    return {
        "id": str(cycle.id),
        "name": cycle.name,
        "status": cycle.status,
        "approval_chain": normalise_approval_chain(cycle.approval_chain),
    }


@router.patch("/{cycle_id}/status")
async def advance_cycle_status(
    cycle_id: UUID,
    status:   str,
    db:       AsyncSession = Depends(get_db),
    _:        User         = Depends(require_hr_admin),
):
    result = await db.execute(select(PerformanceCycle).where(PerformanceCycle.id == cycle_id))
    cycle = result.scalar_one_or_none()
    if not cycle:
        raise HTTPException(404)
    cycle.status = status
    await db.flush()
    return {"status": cycle.status}


@router.post("/{cycle_id}/increment-bands")
async def set_increment_bands(
    cycle_id: UUID,
    bands:    List[IncrementBandIn],
    db:       AsyncSession = Depends(get_db),
    _:        User         = Depends(require_hr_admin),
):
    # Replace existing bands
    existing = await db.execute(select(IncrementBand).where(IncrementBand.cycle_id == cycle_id))
    for b in existing.scalars().all():
        await db.delete(b)
    for b in bands:
        db.add(IncrementBand(cycle_id=cycle_id, **b.model_dump()))
    await db.flush()
    return {"created": len(bands)}


@router.get("/{cycle_id}/increment-bands")
async def get_increment_bands(
    cycle_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await db.execute(select(IncrementBand).where(IncrementBand.cycle_id == cycle_id))
    bands = result.scalars().all()
    return [{"id": str(b.id), "band_name": b.band_name, "min_score": float(b.min_score),
             "max_score": float(b.max_score), "increment_pct": float(b.increment_pct)} for b in bands]


@router.post("/{cycle_id}/rating-scales")
async def set_rating_scales(
    cycle_id: UUID,
    scales:   List[RatingScaleIn],
    db:       AsyncSession = Depends(get_db),
    _:        User         = Depends(require_hr_admin),
):
    existing = await db.execute(select(RatingScale).where(RatingScale.cycle_id == cycle_id))
    for s in existing.scalars().all():
        await db.delete(s)
    for s in scales:
        db.add(RatingScale(cycle_id=cycle_id, **s.model_dump()))
    await db.flush()
    return {"created": len(scales)}


@router.post("/{cycle_id}/weight-rules")
async def set_weight_rules(
    cycle_id:     UUID,
    rules:        List[WeightRuleIn],
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(require_hr_admin),
):
    existing = await db.execute(select(WeightRule).where(WeightRule.cycle_id == cycle_id))
    for r in existing.scalars().all():
        await db.delete(r)
    for r in rules:
        db.add(WeightRule(cycle_id=cycle_id, created_by=current_user.id, **r.model_dump()))
    await db.flush()
    return {"created": len(rules)}
