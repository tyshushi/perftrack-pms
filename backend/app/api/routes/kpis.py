from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from decimal import Decimal

from app.db.session import get_db
from app.core.security import get_current_user, require_hr_admin
from app.models.user import Kpi, User, WeightRule
from app.services.kpi_workflow import KpiWorkflowService

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────

class KpiCreate(BaseModel):
    cycle_id:      UUID
    name:          str
    description:   Optional[str] = None
    kpi_dimension: str
    weight:        int
    target:        str
    measurement:   Optional[str] = None
    template_id:   Optional[UUID] = None


class KpiUpdate(BaseModel):
    name:          Optional[str] = None
    description:   Optional[str] = None
    kpi_dimension: Optional[str] = None
    weight:        Optional[int] = None
    target:        Optional[str] = None
    measurement:   Optional[str] = None


class KpiSelfEval(BaseModel):
    score:   Decimal
    comment: str


class KpiEvalAction(BaseModel):
    score:   Decimal
    comment: str
    action:  str


class CascadeKpiRequest(BaseModel):
    cycle_id:      UUID
    name:          str
    description:   Optional[str] = None
    kpi_dimension: str
    weight:        int
    target:        str
    measurement:   Optional[str] = None
    employee_ids:  List[UUID]


class WeightAdjustRequest(BaseModel):
    weight: int


# ── Helper ─────────────────────────────────────────────────────────────────

def kpi_to_dict(k: Kpi) -> dict:
    return {
        "id":            str(k.id),
        "cycle_id":      str(k.cycle_id),
        "user_id":       str(k.user_id),
        "name":          k.name,
        "description":   k.description,
        "kpi_dimension": k.kpi_dimension,
        "kpi_type":      k.kpi_type,
        "weight":        k.weight,
        "target":        k.target,
        "measurement":   k.measurement,
        "status":        k.status,
        "self_score":    k.self_score,
        "mgr_score":     k.mgr_score,
        "mgr2_score":    k.mgr2_score,
        "hod_score":     k.hod_score,
        "final_score":   k.final_score,
        "self_comment":  k.self_comment,
        "mgr_comment":   k.mgr_comment,
        "mgr2_comment":  k.mgr2_comment,
        "hod_comment":   k.hod_comment,
        "cascaded_by":   str(k.cascaded_by) if k.cascaded_by else None,
    }

def rule_to_dict(r: WeightRule) -> dict:
    return {
        "id":            str(r.id),
        "cycle_id":      str(r.cycle_id),
        "label":         r.label or "Everyone",
        "group_id":      str(r.group_id)      if r.group_id      else None,
        "hierarchy":     r.hierarchy,
        "user_category": r.user_category,
        "department_id": str(r.department_id) if r.department_id else None,
        "job_grade":     r.job_grade,
        "priority":      r.priority or 0,
        "dimensions": {
            "Financials":           {"min": r.fin_min  or 0, "max": r.fin_max  or 100},
            "Customer":             {"min": r.cust_min or 0, "max": r.cust_max or 100},
            "Internal Process":     {"min": r.ip_min   or 0, "max": r.ip_max   or 100},
            "Learning & Growth":    {"min": r.lg_min   or 0, "max": r.lg_max   or 100},
            "Leadership & Culture": {"min": r.lc_min   or 0, "max": r.lc_max   or 100},
        },
    }

# ── Static routes ──────────────────────────────────────────────────────────

@router.get("/")
async def list_kpis(
    cycle_id:     UUID,
    user_id:      Optional[UUID] = None,
    status:       Optional[str]  = None,
    db:           AsyncSession   = Depends(get_db),
    current_user: User           = Depends(get_current_user),
):
    q = select(Kpi).where(Kpi.cycle_id == cycle_id)

    if current_user.role in ["HR_ADMIN", "SUPER_ADMIN"]:
        if user_id:
            q = q.where(Kpi.user_id == user_id)
    elif current_user.role in ["MANAGER", "MGR2", "HOD"]:
        if user_id and str(user_id) != str(current_user.id):
            q = q.where(Kpi.user_id == user_id)
        elif not user_id:
            q = q.where(Kpi.user_id == current_user.id)
    else:
        q = q.where(Kpi.user_id == current_user.id)

    if status:
        q = q.where(Kpi.status == status)

    result = await db.execute(q.order_by(Kpi.created_at))
    return [kpi_to_dict(k) for k in result.scalars().all()]


@router.post("/")
async def create_kpi(
    body:         KpiCreate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    kpi_type = (
        "FIXED" if current_user.role in
        ["HR_ADMIN", "SUPER_ADMIN", "MANAGER", "MGR2", "HOD"]
        and body.template_id else "OPTIONAL"
    )
    kpi = Kpi(
        cycle_id      = body.cycle_id,
        user_id       = current_user.id,
        template_id   = body.template_id,
        name          = body.name,
        description   = body.description,
        kpi_dimension = body.kpi_dimension,
        kpi_type      = kpi_type,
        weight        = body.weight,
        target        = body.target,
        measurement   = body.measurement,
        status        = "DRAFT",
    )
    db.add(kpi)
    await db.flush()
    await db.refresh(kpi)
    return kpi_to_dict(kpi)


@router.post("/cascade")
async def cascade_kpi(
    body:         CascadeKpiRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    if current_user.role not in [
        "HR_ADMIN", "SUPER_ADMIN", "MANAGER", "MGR2", "HOD"
    ]:
        raise HTTPException(403, "Not authorised to cascade KPIs")

    # Check weight rule
    wr = await db.execute(
        select(WeightRule).where(
            WeightRule.cycle_id == body.cycle_id,
            WeightRule.category == body.kpi_dimension,
        )
    )
    rule = wr.scalars().first()
    if rule:
        if rule.min_weight and body.weight < rule.min_weight:
            raise HTTPException(400,
                f"Weight {body.weight}% is below minimum "
                f"{rule.min_weight}% for {body.kpi_dimension}")
        if rule.max_weight and body.weight > rule.max_weight:
            raise HTTPException(400,
                f"Weight {body.weight}% exceeds maximum "
                f"{rule.max_weight}% for {body.kpi_dimension}")

    created = []
    skipped = []

    for emp_id in body.employee_ids:
        existing = await db.execute(
            select(Kpi).where(
                Kpi.cycle_id      == body.cycle_id,
                Kpi.user_id       == emp_id,
                Kpi.name          == body.name,
                Kpi.kpi_type      == "FIXED",
            )
        )
        if existing.scalar_one_or_none():
            skipped.append(str(emp_id))
            continue

        kpi = Kpi(
            cycle_id      = body.cycle_id,
            user_id       = emp_id,
            name          = body.name,
            description   = body.description,
            kpi_dimension = body.kpi_dimension,
            kpi_type      = "FIXED",
            weight        = body.weight,
            target        = body.target,
            measurement   = body.measurement,
            status        = "APPROVED",
            cascaded_by   = current_user.id,
        )
        db.add(kpi)
        created.append(str(emp_id))

    await db.flush()
    return {
        "created": len(created),
        "skipped": len(skipped),
        "message": (
            f"Cascaded to {len(created)} employee(s)."
            + (f" {len(skipped)} already existed." if skipped else "")
        ),
    }


@router.get("/weight-rules/{cycle_id}")
async def get_weight_rules(
    cycle_id:     UUID,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    result = await db.execute(
        select(WeightRule).where(WeightRule.cycle_id == cycle_id)
        .order_by(WeightRule.priority.desc())
    )
    return [rule_to_dict(r) for r in result.scalars().all()]


@router.post("/weight-rules/{cycle_id}")
async def set_weight_rules(
    cycle_id: UUID,
    body:     List[dict],
    db:       AsyncSession = Depends(get_db),
    _:        User         = Depends(require_hr_admin),
):
    existing = await db.execute(
        select(WeightRule).where(WeightRule.cycle_id == cycle_id)
    )
    for rule in existing.scalars().all():
        await db.delete(rule)

    for r in body:
        dims = r.get("dimensions", {})
        db.add(WeightRule(
            cycle_id      = cycle_id,
            category      = r.get("label", "General"),  # satisfy NOT NULL constraint
            label         = r.get("label", "Everyone"),
            group_id      = r.get("group_id"),
            hierarchy     = r.get("hierarchy"),
            user_category = r.get("user_category"),
            department_id = r.get("department_id"),
            job_grade     = r.get("job_grade"),
            priority      = r.get("priority", 0),
            fin_min  = dims.get("Financials",           {}).get("min", 0),
            fin_max  = dims.get("Financials",           {}).get("max", 100),
            cust_min = dims.get("Customer",             {}).get("min", 0),
            cust_max = dims.get("Customer",             {}).get("max", 100),
            ip_min   = dims.get("Internal Process",     {}).get("min", 0),
            ip_max   = dims.get("Internal Process",     {}).get("max", 100),
            lg_min   = dims.get("Learning & Growth",    {}).get("min", 0),
            lg_max   = dims.get("Learning & Growth",    {}).get("max", 100),
            lc_min   = dims.get("Leadership & Culture", {}).get("min", 0),
            lc_max   = dims.get("Leadership & Culture", {}).get("max", 100),
        ))

    await db.flush()
    return {"message": f"Saved {len(body)} weight rule(s)"}


# ── Parameterised routes ───────────────────────────────────────────────────

@router.patch("/{kpi_id}")
async def update_kpi(
    kpi_id:       UUID,
    body:         KpiUpdate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    result = await db.execute(select(Kpi).where(Kpi.id == kpi_id))
    kpi = result.scalar_one_or_none()
    if not kpi:
        raise HTTPException(404, "KPI not found")
    if str(kpi.user_id) != str(current_user.id) and \
            current_user.role not in ["HR_ADMIN", "SUPER_ADMIN"]:
        raise HTTPException(403, "Not authorised")
    if kpi.status not in ["DRAFT", "REJECTED"]:
        raise HTTPException(400, "Only DRAFT or REJECTED KPIs can be edited")
    if kpi.kpi_type == "FIXED":
        raise HTTPException(400,
            "Use /weight endpoint to adjust cascaded KPI weight")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(kpi, field, val)
    await db.flush()
    await db.refresh(kpi)
    return kpi_to_dict(kpi)


@router.delete("/{kpi_id}", status_code=204)
async def delete_kpi(
    kpi_id:       UUID,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    result = await db.execute(select(Kpi).where(Kpi.id == kpi_id))
    kpi = result.scalar_one_or_none()
    if not kpi:
        raise HTTPException(404)
    if str(kpi.user_id) != str(current_user.id) and \
            current_user.role not in ["HR_ADMIN", "SUPER_ADMIN"]:
        raise HTTPException(403)
    if kpi.status != "DRAFT":
        raise HTTPException(400, "Cannot delete a submitted KPI")
    if kpi.kpi_type == "FIXED":
        raise HTTPException(400, "Cannot delete a cascaded KPI")
    await db.delete(kpi)


@router.post("/{kpi_id}/submit")
async def submit_kpi(
    kpi_id:       UUID,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    svc = KpiWorkflowService(db)
    return await svc.submit_kpi(kpi_id, current_user)


@router.post("/{kpi_id}/self-evaluate")
async def self_evaluate(
    kpi_id:       UUID,
    body:         KpiSelfEval,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    svc = KpiWorkflowService(db)
    return await svc.self_evaluate(
        kpi_id, current_user, body.score, body.comment
    )


@router.post("/{kpi_id}/evaluate")
async def evaluate_kpi(
    kpi_id:       UUID,
    body:         KpiEvalAction,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    if body.action not in ("approve", "reject"):
        raise HTTPException(400, "action must be 'approve' or 'reject'")
    svc = KpiWorkflowService(db)
    return await svc.evaluate_kpi(
        kpi_id, current_user, body.score, body.comment, body.action
    )


@router.post("/{kpi_id}/lock")
async def lock_kpi(
    kpi_id:       UUID,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    svc = KpiWorkflowService(db)
    return await svc.lock_kpi(kpi_id, current_user)


@router.patch("/{kpi_id}/weight")
async def adjust_weight(
    kpi_id:       UUID,
    body:         WeightAdjustRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    result = await db.execute(select(Kpi).where(Kpi.id == kpi_id))
    kpi = result.scalar_one_or_none()
    if not kpi:
        raise HTTPException(404, "KPI not found")
    if str(kpi.user_id) != str(current_user.id):
        raise HTTPException(403, "Not your KPI")
    if kpi.kpi_type != "FIXED":
        raise HTTPException(400,
            "Use PATCH /kpis/{id} to edit optional KPIs")
    if kpi.status == "LOCKED":
        raise HTTPException(400, "KPI is locked")

    wr = await db.execute(
        select(WeightRule).where(
            WeightRule.cycle_id == kpi.cycle_id,
            WeightRule.category == kpi.kpi_dimension,
        )
    )
    rule = wr.scalars().first()
    if rule:
        if rule.min_weight and body.weight < rule.min_weight:
            raise HTTPException(400,
                f"Weight {body.weight}% is below minimum {rule.min_weight}%")
        if rule.max_weight and body.weight > rule.max_weight:
            raise HTTPException(400,
                f"Weight {body.weight}% exceeds maximum {rule.max_weight}%")

    kpi.weight = body.weight
    kpi.status = "PENDING_DM"
    await db.flush()
    await db.refresh(kpi)
    return kpi_to_dict(kpi)


@router.get("/{kpi_id}/audit")
async def kpi_audit_log(
    kpi_id:       UUID,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    from app.models.user import KpiAuditLog
    result = await db.execute(
        select(KpiAuditLog).where(KpiAuditLog.kpi_id == kpi_id)
        .order_by(KpiAuditLog.created_at)
    )
    return [
        {
            "id":          str(l.id),
            "actor_id":    str(l.actor_id),
            "from_status": l.from_status,
            "to_status":   l.to_status,
            "comment":     l.comment,
            "score_given": l.score_given,
            "created_at":  l.created_at.isoformat(),
        }
        for l in result.scalars().all()
    ]
