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
from app.core.security import get_current_user, require_permission, require_hr_admin
from app.models.user import PerformanceCycle, User, Department, IncrementBand, BellCurveTarget, RatingScale, WeightRule, Kpi, KpiTemplate, Group

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
    name:                   Optional[str]       = None
    year:                   Optional[int]       = None
    status:                 Optional[str]       = None
    kpi_setting_start:      Optional[date]      = None
    kpi_setting_end:        Optional[date]      = None
    self_eval_start:        Optional[date]      = None
    self_eval_end:          Optional[date]      = None
    mgr_eval_start:         Optional[date]      = None
    mgr_eval_end:           Optional[date]      = None
    approval_chain:         Optional[List[str]] = None
    rating_type:            Optional[str]       = None
    rating_scale_max:       Optional[int]       = None
    rating_levels:          Optional[list]      = None
    reminder_frequency:     Optional[str]       = None
    reminder_days_of_week:  Optional[List[int]] = None


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
            "kpi_count":             kpi_count or 0,
            "employee_count":        employee_count or 0,
            "reminder_frequency":    c.reminder_frequency or "NONE",
            "reminder_days_of_week": c.reminder_days_of_week or [],
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

    # Validate reminder_frequency
    VALID_FREQUENCIES = {"NONE", "DAILY", "TWICE_WEEKLY", "WEEKLY"}
    if "reminder_frequency" in data:
        freq = data["reminder_frequency"]
        if freq not in VALID_FREQUENCIES:
            raise HTTPException(400, f"Invalid reminder_frequency. Must be one of: {', '.join(sorted(VALID_FREQUENCIES))}")
        days = data.get("reminder_days_of_week", [])
        if freq == "TWICE_WEEKLY":
            if len(days) != 2:
                raise HTTPException(400, "TWICE_WEEKLY requires exactly 2 days_of_week (0=Mon to 6=Sun)")
        elif freq == "WEEKLY":
            if len(days) != 1:
                raise HTTPException(400, "WEEKLY requires exactly 1 day_of_week (0=Mon to 6=Sun)")

    prev_status = cycle.status

    for key, val in data.items():
        setattr(cycle, key, val)

    await db.flush()
    await db.refresh(cycle)

    # Send cycle activation email to all active users if status changed to ACTIVE
    if data.get("status") == "ACTIVE" and prev_status != "ACTIVE":
        from app.services.email_service import notify_cycle_activated
        users_result = await db.execute(select(User).where(User.is_active == True))
        active_users = users_result.scalars().all()
        cycle_dict = {
            'id': cycle.id,
            'name': cycle.name,
            'kpi_setting_start': str(cycle.kpi_setting_start) if cycle.kpi_setting_start else None,
            'kpi_setting_end': str(cycle.kpi_setting_end) if cycle.kpi_setting_end else None,
        }
        for user in active_users:
            if not user.email:
                continue
            try:
                await notify_cycle_activated(db, {
                    'id': user.id,
                    'full_name': user.full_name,
                    'email': user.email,
                }, cycle_dict)
            except Exception as e:
                print(f"Cycle activation email failed for {user.email}: {e}")

    return {
        "id":                   str(cycle.id),
        "name":                 cycle.name,
        "year":                 cycle.year,
        "status":               cycle.status,
        "kpi_setting_start":    str(cycle.kpi_setting_start),
        "kpi_setting_end":      str(cycle.kpi_setting_end),
        "self_eval_start":      str(cycle.self_eval_start),
        "self_eval_end":        str(cycle.self_eval_end),
        "mgr_eval_start":       str(cycle.mgr_eval_start) if cycle.mgr_eval_start else None,
        "mgr_eval_end":         str(cycle.mgr_eval_end)   if cycle.mgr_eval_end   else None,
        "rating_type":          cycle.rating_type or "NUMERIC",
        "rating_scale_max":     cycle.rating_scale_max or 5,
        "rating_levels":        cycle.rating_levels,
        "approval_chain":       normalise_approval_chain(cycle.approval_chain),
        "reminder_frequency":   cycle.reminder_frequency or "NONE",
        "reminder_days_of_week": cycle.reminder_days_of_week or [],
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


@router.get("/{cycle_id}/report")
async def get_cycle_report(
    cycle_id: UUID,
    db:       AsyncSession = Depends(get_db),
    _:        User         = Depends(require_hr_admin),
):
    result = await db.execute(select(PerformanceCycle).where(PerformanceCycle.id == cycle_id))
    cycle = result.scalar_one_or_none()
    if not cycle:
        raise HTTPException(404, "Cycle not found")

    # Load all active users
    users_result = await db.execute(select(User).where(User.is_active == True))
    all_users = users_result.scalars().all()
    user_map = {u.id: u for u in all_users}

    # Load all departments
    depts_result = await db.execute(select(Department))
    dept_map = {d.id: d.name for d in depts_result.scalars().all()}

    # Load all KPIs for this cycle
    kpis_result = await db.execute(select(Kpi).where(Kpi.cycle_id == cycle_id))
    all_kpis = kpis_result.scalars().all()

    # Group KPIs by user_id
    from collections import defaultdict
    kpis_by_user: dict = defaultdict(list)
    for kpi in all_kpis:
        kpis_by_user[kpi.user_id].append(kpi)

    STATUS_ORDER = [
        "DRAFT", "PENDING_DM", "SELF_EVALUATED", "PENDING_RM",
        "PENDING_HOD", "MGR_EVALUATED", "LOCKED", "REJECTED",
    ]

    def derive_scorecard_status(kpis: list) -> str:
        if not kpis:
            return "NO_SCORECARD"
        statuses = [k.status for k in kpis]
        if "REJECTED" in statuses:
            return "REJECTED"
        # Return the minimum (earliest-stage) status
        def order(s):
            try:
                return STATUS_ORDER.index(s)
            except ValueError:
                return -1
        return min(statuses, key=order)

    DIMENSION_KEYS = {
        "Financials":          "fin_weight",
        "Customer":            "cust_weight",
        "Internal Process":    "ip_weight",
        "Learning & Growth":   "lg_weight",
        "Leadership & Culture":"lc_weight",
    }

    rows = []
    for user in all_users:
        kpis = kpis_by_user.get(user.id, [])

        scorecard_status = derive_scorecard_status(kpis)
        is_late = any(k.is_late for k in kpis)
        kpi_count = len(kpis)

        self_rating = None
        if any(k.self_rating is not None for k in kpis):
            self_rating = sum(
                (float(k.weight) / 100.0) * float(k.self_rating)
                for k in kpis if k.self_rating is not None
            )

        mgr_rating = None
        if any(k.mgr_score is not None for k in kpis):
            mgr_rating = sum(
                (float(k.weight) / 100.0) * float(k.mgr_score)
                for k in kpis if k.mgr_score is not None
            )

        dim_weights: dict = {v: 0 for v in DIMENSION_KEYS.values()}
        for k in kpis:
            key = DIMENSION_KEYS.get(k.kpi_dimension)
            if key:
                dim_weights[key] = dim_weights[key] + k.weight

        rows.append({
            "employee_id":        user.employee_id,
            "full_name":          user.full_name,
            "email":              user.email,
            "position_title":     user.position_title,
            "job_grade":          user.job_grade,
            "category":           user.category,
            "employee_type":      user.employee_type,
            "department_id":      str(user.department_id) if user.department_id else None,
            "department_name":    dept_map.get(user.department_id, ""),
            "division":           user.division,
            "section":            user.section,
            "country":            user.country,
            "work_location":      user.work_location,
            "hire_date":          str(user.hire_date) if user.hire_date else None,
            "gender":             user.gender,
            "direct_manager":     user_map[user.direct_manager_id].full_name if user.direct_manager_id and user.direct_manager_id in user_map else None,
            "reviewing_manager":  user_map[user.reviewing_manager_id].full_name if user.reviewing_manager_id and user.reviewing_manager_id in user_map else None,
            "hod":                user_map[user.hod_id].full_name if user.hod_id and user.hod_id in user_map else None,
            "scorecard_status":   scorecard_status,
            "is_late":            is_late,
            "kpi_count":          kpi_count,
            "self_rating":        round(self_rating, 4) if self_rating is not None else None,
            "mgr_rating":         round(mgr_rating, 4) if mgr_rating is not None else None,
            "fin_weight":         dim_weights["fin_weight"],
            "cust_weight":        dim_weights["cust_weight"],
            "ip_weight":          dim_weights["ip_weight"],
            "lg_weight":          dim_weights["lg_weight"],
            "lc_weight":          dim_weights["lc_weight"],
        })

    return rows


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
