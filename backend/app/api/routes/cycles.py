"""
Performance Cycles — full CRUD for HR Admin
"""
from uuid import UUID
from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete as sql_delete, update as sql_update
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import get_current_user, require_permission
from app.models.user import PerformanceCycle, User, IncrementBand, BellCurveTarget, RatingScale, WeightRule, Kpi, KpiTemplate, Group

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


class CycleUpdate(BaseModel):
    name:               Optional[str]       = None
    year:               Optional[int]       = None
    status:             Optional[str]       = None
    kpi_setting_start:  Optional[date]      = None
    kpi_setting_end:    Optional[date]      = None
    self_eval_start:    Optional[date]      = None
    self_eval_end:      Optional[date]      = None
    mgr_eval_start:     Optional[date]      = None
    mgr_eval_end:       Optional[date]      = None
    approval_chain:     Optional[List[str]] = None
    rating_type:        Optional[str]       = None
    rating_scale_max:   Optional[int]       = None
    rating_levels:      Optional[list]      = None


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
    kpi_count_sq = (
        select(func.count())
        .where(Kpi.cycle_id == PerformanceCycle.id)
        .correlate(PerformanceCycle)
        .scalar_subquery()
    )
    employee_count_sq = (
        select(func.count(Kpi.user_id.distinct()))
        .where(Kpi.cycle_id == PerformanceCycle.id)
        .correlate(PerformanceCycle)
        .scalar_subquery()
    )
    result = await db.execute(
        select(PerformanceCycle, kpi_count_sq.label("kpi_count"), employee_count_sq.label("employee_count"))
        .order_by(PerformanceCycle.year.desc())
    )
    rows = result.all()
    return [
        {
            "id": str(c.id), "name": c.name, "year": c.year,
            "status": c.status,
            "kpi_setting_start": str(c.kpi_setting_start),
            "kpi_setting_end":   str(c.kpi_setting_end),
            "self_eval_start":   str(c.self_eval_start),
            "self_eval_end":     str(c.self_eval_end),
            "mgr_eval_start":    str(c.mgr_eval_start) if c.mgr_eval_start else None,
            "mgr_eval_end":      str(c.mgr_eval_end)   if c.mgr_eval_end   else None,
            "rating_type":       c.rating_type or "NUMERIC",
            "rating_scale_max":  c.rating_scale_max or 5,
            "rating_levels":     c.rating_levels,
            "approval_chain":    normalise_approval_chain(c.approval_chain),
            "kpi_count":         kpi_count or 0,
            "employee_count":    employee_count or 0,
        }
        for c, kpi_count, employee_count in rows
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
    current_user: User = Depends(require_permission("manage_cycles")),
):
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


@router.patch("/{cycle_id}")
async def update_cycle(
    cycle_id: UUID,
    body:     CycleUpdate,
    db:       AsyncSession = Depends(get_db),
    _:        User         = Depends(require_permission("manage_cycles")),
):
    result = await db.execute(select(PerformanceCycle).where(PerformanceCycle.id == cycle_id))
    cycle = result.scalar_one_or_none()
    if not cycle:
        raise HTTPException(404, "Cycle not found")

    data = body.model_dump(exclude_none=True)

    if "status" in data:
        valid_statuses = {"DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"}
        if data["status"] not in valid_statuses:
            raise HTTPException(400, f"Invalid status. Must be one of: {', '.join(sorted(valid_statuses))}")

    if "approval_chain" in data:
        data["approval_chain"] = validate_approval_chain(data["approval_chain"])

    for key, val in data.items():
        setattr(cycle, key, val)

    await db.flush()
    await db.refresh(cycle)
    return {
        "id":                str(cycle.id),
        "name":              cycle.name,
        "year":              cycle.year,
        "status":            cycle.status,
        "kpi_setting_start": str(cycle.kpi_setting_start),
        "kpi_setting_end":   str(cycle.kpi_setting_end),
        "self_eval_start":   str(cycle.self_eval_start),
        "self_eval_end":     str(cycle.self_eval_end),
        "mgr_eval_start":    str(cycle.mgr_eval_start) if cycle.mgr_eval_start else None,
        "mgr_eval_end":      str(cycle.mgr_eval_end)   if cycle.mgr_eval_end   else None,
        "rating_type":       cycle.rating_type or "NUMERIC",
        "rating_scale_max":  cycle.rating_scale_max or 5,
        "rating_levels":     cycle.rating_levels,
        "approval_chain":    normalise_approval_chain(cycle.approval_chain),
    }


@router.patch("/{cycle_id}/status")
async def advance_cycle_status(
    cycle_id: UUID,
    status:   str,
    db:       AsyncSession = Depends(get_db),
    _:        User         = Depends(require_permission("manage_cycles")),
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
    _:        User         = Depends(require_permission("manage_cycles")),
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
    _:        User         = Depends(require_permission("manage_cycles")),
):
    existing = await db.execute(select(RatingScale).where(RatingScale.cycle_id == cycle_id))
    for s in existing.scalars().all():
        await db.delete(s)
    for s in scales:
        db.add(RatingScale(cycle_id=cycle_id, **s.model_dump()))
    await db.flush()
    return {"created": len(scales)}


@router.get("/{cycle_id}/phase-status")
async def get_phase_status(
    cycle_id: UUID,
    db:       AsyncSession = Depends(get_db),
    _:        User         = Depends(get_current_user),
):
    result = await db.execute(select(PerformanceCycle).where(PerformanceCycle.id == cycle_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Cycle not found")

    today = date.today()

    def phase_info(start, end):
        if start and today < start:
            return {
                "start": str(start), "end": str(end) if end else None,
                "is_open": False, "is_late": False,
                "message": f"This window is not yet open. Opens on {start.strftime('%d/%m/%Y')}",
            }
        is_late = bool(end and today > end)
        if is_late:
            msg = f"Window closed on {end.strftime('%d/%m/%Y')}. This will be tagged as Late Submission."
        elif end:
            msg = f"Open until {end.strftime('%d/%m/%Y')}"
        else:
            msg = "No end date set"
        return {
            "start": str(start) if start else None,
            "end":   str(end)   if end   else None,
            "is_open": not is_late,
            "is_late": is_late,
            "message": msg,
        }

    return {
        "cycle_id":   str(c.id),
        "cycle_name": c.name,
        "status":     c.status,
        "kpi_setting": phase_info(c.kpi_setting_start, c.kpi_setting_end),
        "self_eval":   phase_info(c.self_eval_start,   c.self_eval_end),
        "mgr_eval":    phase_info(c.mgr_eval_start,    c.mgr_eval_end),
    }


@router.delete("/{cycle_id}")
async def delete_cycle(
    cycle_id: UUID,
    db:       AsyncSession = Depends(get_db),
    _:        User         = Depends(require_permission("manage_cycles")),
):
    result = await db.execute(select(PerformanceCycle).where(PerformanceCycle.id == cycle_id))
    cycle = result.scalar_one_or_none()
    if not cycle:
        raise HTTPException(404, "Cycle not found")

    kpi_count = await db.execute(
        select(func.count()).select_from(Kpi).where(Kpi.cycle_id == cycle_id)
    )
    count = kpi_count.scalar()
    if count and count > 0:
        raise HTTPException(400, "Cannot delete cycle with existing KPIs. Delete all scorecards first.")

    await db.execute(sql_delete(WeightRule).where(WeightRule.cycle_id == cycle_id))
    await db.execute(sql_delete(KpiTemplate).where(KpiTemplate.cycle_id == cycle_id))
    await db.execute(sql_update(Group).where(Group.cycle_id == cycle_id).values(cycle_id=None))
    await db.flush()

    await db.delete(cycle)
    await db.flush()
    return {"message": "Cycle deleted"}


@router.post("/{cycle_id}/weight-rules")
async def set_weight_rules(
    cycle_id:     UUID,
    rules:        List[WeightRuleIn],
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(require_permission("manage_weight_rules")),
):
    existing = await db.execute(select(WeightRule).where(WeightRule.cycle_id == cycle_id))
    for r in existing.scalars().all():
        await db.delete(r)
    for r in rules:
        db.add(WeightRule(cycle_id=cycle_id, created_by=current_user.id, **r.model_dump()))
    await db.flush()
    return {"created": len(rules)}
