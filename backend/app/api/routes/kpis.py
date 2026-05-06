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
    cycle_id:    UUID
    name:        str
    description: Optional[str] = None
    category:    str
    weight:      int
    target:      str
    measurement: Optional[str] = None
    template_id: Optional[UUID] = None


class KpiUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    category:    Optional[str] = None
    weight:      Optional[int] = None
    target:      Optional[str] = None
    measurement: Optional[str] = None


class KpiSelfEval(BaseModel):
    score:   Decimal
    comment: str


class KpiEvalAction(BaseModel):
    score:   Decimal
    comment: str
    action:  str


class CascadeKpiRequest(BaseModel):
    cycle_id:     UUID
    name:         str
    description:  Optional[str] = None
    category:     str
    weight:       int
    target:       str
    measurement:  Optional[str] = None
    employee_ids: List[UUID]
    kpi_dimension: str  # replaces category



class WeightAdjustRequest(BaseModel):
    weight: int


class KpiOut(BaseModel):
    id:           UUID
    cycle_id:     UUID
    user_id:      UUID
    name:         str
    category:     str
    kpi_type:     str
    weight:       int
    target:       str
    status:       str
    self_score:   Optional[Decimal] = None
    mgr_score:    Optional[Decimal] = None
    mgr2_score:   Optional[Decimal] = None
    hod_score:    Optional[Decimal] = None
    final_score:  Optional[Decimal] = None
    self_comment: Optional[str] = None
    mgr_comment:  Optional[str] = None
    mgr2_comment: Optional[str] = None
    hod_comment:  Optional[str] = None
    description:  Optional[str] = None
    measurement:  Optional[str] = None

    class Config:
        from_attributes = True


# ── Static routes first ────────────────────────────────────────────────────

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
    kpis = result.scalars().all()
    return [
        {
            "id":           str(k.id),
            "cycle_id":     str(k.cycle_id),
            "user_id":      str(k.user_id),
            "name":         k.name,
            "description":  k.description,
            "category":     k.category,
            "kpi_type":     k.kpi_type,
            "weight":       k.weight,
            "target":       k.target,
            "measurement":  k.measurement,
            "status":       k.status,
            "self_score":   k.self_score,
            "mgr_score":    k.mgr_score,
            "mgr2_score":   k.mgr2_score,
            "hod_score":    k.hod_score,
            "final_score":  k.final_score,
            "self_comment": k.self_comment,
            "mgr_comment":  k.mgr_comment,
            "mgr2_comment": k.mgr2_comment,
            "hod_comment":  k.hod_comment,
            "cascaded_by":  str(k.cascaded_by) if k.cascaded_by else None,
        }
        for k in kpis
    ]


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
        cycle_id    = body.cycle_id,
        user_id     = current_user.id,
        template_id = body.template_id,
        name        = body.name,
        description = body.description,
        category    = body.category,
        kpi_type    = kpi_type,
        weight      = body.weight,
        target      = body.target,
        measurement = body.measurement,
        status      = "DRAFT",
    )
    db.add(kpi)
    await db.flush()
    await db.refresh(kpi)
    return {
        "id":          str(kpi.id),
        "cycle_id":    str(kpi.cycle_id),
        "user_id":     str(kpi.user_id),
        "name":        kpi.name,
        "description": kpi.description,
        "category":    kpi.category,
        "kpi_type":    kpi.kpi_type,
        "weight":      kpi.weight,
        "target":      kpi.target,
        "measurement": kpi.measurement,
        "status":      kpi.status,
        "self_score":  None, "mgr_score": None, "mgr2_score": None,
        "hod_score":   None, "final_score": None,
        "self_comment": None, "mgr_comment": None,
        "mgr2_comment": None, "hod_comment": None,
        "cascaded_by": None,
    }


@router.post("/cascade")
async def cascade_kpi(
    body:         CascadeKpiRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """HR Admin or any manager cascades a KPI to specific employees."""
    if current_user.role not in [
        "HR_ADMIN", "SUPER_ADMIN", "MANAGER", "MGR2", "HOD"
    ]:
        raise HTTPException(403, "Not authorised to cascade KPIs")

    # Check weight rule for this category
    wr = await db.execute(
        select(WeightRule).where(
            WeightRule.cycle_id == body.cycle_id,
            WeightRule.category == body.category,
        )
    )
    rule = wr.scalars().first()

    if rule:
        if rule.min_weight and body.weight < rule.min_weight:
            raise HTTPException(400,
                f"Weight {body.weight}% is below minimum "
                f"{rule.min_weight}% for {body.category}")
        if rule.max_weight and body.weight > rule.max_weight:
            raise HTTPException(400,
                f"Weight {body.weight}% exceeds maximum "
                f"{rule.max_weight}% for {body.category}")

    created = []
    skipped = []

    for emp_id in body.employee_ids:
        existing = await db.execute(
            select(Kpi).where(
                Kpi.cycle_id == body.cycle_id,
                Kpi.user_id  == emp_id,
                Kpi.name     == body.name,
                Kpi.kpi_type == "FIXED",
            )
        )
        if existing.scalar_one_or_none():
            skipped.append(str(emp_id))
            continue

        kpi = Kpi(
            cycle_id     = body.cycle_id,
            user_id      = emp_id,
            name         = body.name,
            description  = body.description,
            category     = body.category,
            kpi_type     = "FIXED",
            weight       = body.weight,
            target       = body.target,
            measurement  = body.measurement,
            status       = "APPROVED",
            cascaded_by  = current_user.id,
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
    )
    rules = result.scalars().all()
    return [
        {
            "id":            str(r.id),
            "cycle_id":      str(r.cycle_id),
            "category":      r.category,
            "min_weight":    r.min_weight,
            "max_weight":    r.max_weight,
            "fixed_weight":  r.fixed_weight,
            "department_id": str(r.department_id) if r.department_id else None,
            "job_grade":     r.job_grade,
        }
        for r in rules
    ]


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
        db.add(WeightRule(
            cycle_id      = cycle_id,
            category      = r["category"],
            min_weight    = r.get("min_weight", 0),
            max_weight    = r.get("max_weight", 100),
            fixed_weight  = r.get("fixed_weight"),
            department_id = r.get("department_id"),
            job_grade     = r.get("job_grade"),
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
        raise HTTPException(400, "Use /weight endpoint to adjust cascaded KPI weight")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(kpi, field, val)
    await db.flush()
    await db.refresh(kpi)
    return {
        "id": str(kpi.id), "cycle_id": str(kpi.cycle_id),
        "user_id": str(kpi.user_id), "name": kpi.name,
        "description": kpi.description, "category": kpi.category,
        "kpi_type": kpi.kpi_type, "weight": kpi.weight,
        "target": kpi.target, "measurement": kpi.measurement,
        "status": kpi.status,
        "self_score": kpi.self_score, "mgr_score": kpi.mgr_score,
        "mgr2_score": kpi.mgr2_score, "hod_score": kpi.hod_score,
        "final_score": kpi.final_score,
        "self_comment": kpi.self_comment, "mgr_comment": kpi.mgr_comment,
        "mgr2_comment": kpi.mgr2_comment, "hod_comment": kpi.hod_comment,
        "cascaded_by": str(kpi.cascaded_by) if kpi.cascaded_by else None,
    }


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
    return await svc.self_evaluate(kpi_id, current_user, body.score, body.comment)


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
    """Staff adjusts weight on a cascaded KPI — triggers re-approval."""
    result = await db.execute(select(Kpi).where(Kpi.id == kpi_id))
    kpi = result.scalar_one_or_none()
    if not kpi:
        raise HTTPException(404, "KPI not found")
    if str(kpi.user_id) != str(current_user.id):
        raise HTTPException(403, "Not your KPI")
    if kpi.kpi_type != "FIXED":
        raise HTTPException(400, "Use PATCH /kpis/{id} to edit optional KPIs")
    if kpi.status == "LOCKED":
        raise HTTPException(400, "KPI is locked")

    wr = await db.execute(
        select(WeightRule).where(
            WeightRule.cycle_id == kpi.cycle_id,
            WeightRule.category == kpi.category,
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
    return {
        "id": str(kpi.id), "cycle_id": str(kpi.cycle_id),
        "user_id": str(kpi.user_id), "name": kpi.name,
        "description": kpi.description, "category": kpi.category,
        "kpi_type": kpi.kpi_type, "weight": kpi.weight,
        "target": kpi.target, "measurement": kpi.measurement,
        "status": kpi.status,
        "self_score": kpi.self_score, "mgr_score": kpi.mgr_score,
        "mgr2_score": kpi.mgr2_score, "hod_score": kpi.hod_score,
        "final_score": kpi.final_score,
        "self_comment": kpi.self_comment, "mgr_comment": kpi.mgr_comment,
        "mgr2_comment": kpi.mgr2_comment, "hod_comment": kpi.hod_comment,
        "cascaded_by": str(kpi.cascaded_by) if kpi.cascaded_by else None,
    }


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
    logs = result.scalars().all()
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
        for l in logs
    ]
