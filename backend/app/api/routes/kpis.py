from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from decimal import Decimal

from app.db.session import get_db
from app.core.security import get_current_user
from app.models.user import Kpi, User
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
    action:  str  # "approve" or "reject"

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
    self_score:   Optional[Decimal]
    mgr_score:    Optional[Decimal]
    mgr2_score:   Optional[Decimal]
    hod_score:    Optional[Decimal]
    final_score:  Optional[Decimal]
    self_comment: Optional[str]
    mgr_comment:  Optional[str]
    mgr2_comment: Optional[str]
    hod_comment:  Optional[str]

    class Config:
        from_attributes = True


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/", response_model=List[KpiOut])
async def list_kpis(
    cycle_id:   UUID,
    user_id:    Optional[UUID] = None,
    status:     Optional[str]  = None,
    db:         AsyncSession   = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """
    List KPIs. Staff see their own. Managers see their direct reports'.
    HR Admin sees all.
    """
    q = select(Kpi).where(Kpi.cycle_id == cycle_id)

    if current_user.role in ["HR_ADMIN", "SUPER_ADMIN"]:
        if user_id:
            q = q.where(Kpi.user_id == user_id)
    elif current_user.role in ["MANAGER", "MGR2", "HOD"]:
        # Can view their own or their reports'
        if user_id and user_id != current_user.id:
            q = q.where(Kpi.user_id == user_id)
        elif not user_id:
            q = q.where(Kpi.user_id == current_user.id)
    else:
        q = q.where(Kpi.user_id == current_user.id)

    if status:
        q = q.where(Kpi.status == status)

    result = await db.execute(q.order_by(Kpi.created_at))
    return result.scalars().all()


@router.post("/", response_model=KpiOut)
async def create_kpi(
    body:         KpiCreate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Staff creates an optional KPI, or HR/Manager cascades a fixed one."""
    kpi_type = KpiType.FIXED if current_user.role in ["HR_ADMIN","SUPER_ADMIN","MANAGER","MGR2","HOD"] and body.template_id else KpiType.OPTIONAL
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
        status      = KpiStatus.DRAFT,
    )
    db.add(kpi)
    await db.flush()
    await db.refresh(kpi)
    return kpi


@router.patch("/{kpi_id}", response_model=KpiOut)
async def update_kpi(
    kpi_id:       UUID,
    body:         KpiUpdate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Update a DRAFT KPI (owner only)."""
    result = await db.execute(select(Kpi).where(Kpi.id == kpi_id))
    kpi = result.scalar_one_or_none()
    if not kpi:
        raise HTTPException(404, "KPI not found")
    if kpi.user_id != current_user.id and current_user.role not in ["HR_ADMIN","SUPER_ADMIN"]:
        raise HTTPException(403, "Not authorised")
    if kpi.status != KpiStatus.DRAFT:
        raise HTTPException(400, "Only DRAFT KPIs can be edited")
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(kpi, field, val)
    await db.flush()
    await db.refresh(kpi)
    return kpi


@router.delete("/{kpi_id}", status_code=204)
async def delete_kpi(
    kpi_id:       UUID,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Delete a DRAFT KPI."""
    result = await db.execute(select(Kpi).where(Kpi.id == kpi_id))
    kpi = result.scalar_one_or_none()
    if not kpi:
        raise HTTPException(404)
    if kpi.user_id != current_user.id and current_user.role not in ["HR_ADMIN","SUPER_ADMIN"]:
        raise HTTPException(403)
    if kpi.status != KpiStatus.DRAFT:
        raise HTTPException(400, "Cannot delete a submitted KPI")
    await db.delete(kpi)


@router.post("/{kpi_id}/submit", response_model=KpiOut)
async def submit_kpi(
    kpi_id:       UUID,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Staff submits KPI for manager approval."""
    svc = KpiWorkflowService(db)
    return await svc.submit_kpi(kpi_id, current_user)


@router.post("/{kpi_id}/self-evaluate", response_model=KpiOut)
async def self_evaluate(
    kpi_id:       UUID,
    body:         KpiSelfEval,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Staff submits self-evaluation score."""
    svc = KpiWorkflowService(db)
    return await svc.self_evaluate(kpi_id, current_user, body.score, body.comment)


@router.post("/{kpi_id}/evaluate", response_model=KpiOut)
async def evaluate_kpi(
    kpi_id:       UUID,
    body:         KpiEvalAction,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Manager/MGR2/HOD approves or rejects a KPI with a score."""
    if body.action not in ("approve", "reject"):
        raise HTTPException(400, "action must be 'approve' or 'reject'")
    svc = KpiWorkflowService(db)
    return await svc.evaluate_kpi(kpi_id, current_user, body.score, body.comment, body.action)


@router.post("/{kpi_id}/lock", response_model=KpiOut)
async def lock_kpi(
    kpi_id:       UUID,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """HR Admin locks an approved KPI and computes final score."""
    svc = KpiWorkflowService(db)
    return await svc.lock_kpi(kpi_id, current_user)


@router.get("/{kpi_id}/audit", response_model=List[dict])
async def kpi_audit_log(
    kpi_id:       UUID,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Full audit trail for a KPI."""
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
