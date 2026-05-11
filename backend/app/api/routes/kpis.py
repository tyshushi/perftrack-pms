from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from decimal import Decimal

from app.db.session import get_db
from app.core.security import get_current_user, require_hr_admin
from app.models.user import Kpi, User, WeightRule, PerformanceCycle
from app.services.kpi_workflow import KpiWorkflowService
from app.api.routes.cycles import normalise_approval_chain

router = APIRouter()


PENDING_STATUS_FOR_LEVEL = {
    "DM":  "PENDING_DM",
    "RM":  "PENDING_RM",
    "HOD": "PENDING_HOD",
}
LEVEL_FOR_PENDING_STATUS = {v: k for k, v in PENDING_STATUS_FOR_LEVEL.items()}


def next_pending_status(chain: list, current_status: str) -> Optional[str]:
    """Given the cycle approval chain and the current PENDING_* status,
    return the next PENDING_* status, or None if this is the final step."""
    current_level = LEVEL_FOR_PENDING_STATUS.get(current_status)
    if current_level is None or current_level not in chain:
        return None
    idx = chain.index(current_level)
    if idx + 1 >= len(chain):
        return None
    return PENDING_STATUS_FOR_LEVEL[chain[idx + 1]]


async def get_cycle_chain(db: AsyncSession, cycle_id: UUID) -> list:
    res = await db.execute(select(PerformanceCycle).where(PerformanceCycle.id == cycle_id))
    cycle = res.scalar_one_or_none()
    if not cycle:
        raise HTTPException(404, "Cycle not found")
    return normalise_approval_chain(cycle.approval_chain)


# ── Schemas ────────────────────────────────────────────────────────────────

class KpiCreate(BaseModel):
    cycle_id:      UUID
    name:          str
    description:   Optional[str] = None
    kpi_dimension: str
    weight:        int
    target:        str = ''
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
    target:        str = ''
    measurement:   Optional[str] = None
    employee_ids:  List[UUID]    = []
    group_id:      Optional[UUID] = None
    hierarchy:     Optional[str]  = None
    user_category: Optional[str]  = None
    department_id: Optional[UUID] = None
    job_grade:     Optional[str]  = None
    restrict_to_reports: bool     = False
    rating_targets: Optional[list] = None


class WeightAdjustRequest(BaseModel):
    weight: int


class ScorecardSubmitRequest(BaseModel):
    cycle_id: UUID


class ScorecardReviewRequest(BaseModel):
    cycle_id:    UUID
    employee_id: UUID
    action:      str   # "approve" | "reject"
    comment:     str = ""


class SelfEvaluationItem(BaseModel):
    kpi_id:             UUID
    actual_achievement: str
    self_rating:        float
    self_remarks:       Optional[str] = ""


class SelfEvaluateAllRequest(BaseModel):
    cycle_id:    UUID
    evaluations: List[SelfEvaluationItem]


class RatingTargetsRequest(BaseModel):
    rating_targets: list


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
        "rating_targets":     k.rating_targets,
        "actual_achievement": k.actual_achievement,
        "self_rating":        float(k.self_rating) if k.self_rating is not None else None,
        "self_remarks":       k.self_remarks,
    }

def rule_to_dict(r: WeightRule, creator_role: Optional[str] = None) -> dict:
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
        "created_by":    str(r.created_by) if r.created_by else None,
        "creator_role":  creator_role,
        "dimensions": {
            "Financials":           {"min": r.fin_min  or 0, "max": r.fin_max  or 100},
            "Customer":             {"min": r.cust_min or 0, "max": r.cust_max or 100},
            "Internal Process":     {"min": r.ip_min   or 0, "max": r.ip_max   or 100},
            "Learning & Growth":    {"min": r.lg_min   or 0, "max": r.lg_max   or 100},
            "Leadership & Culture": {"min": r.lc_min   or 0, "max": r.lc_max   or 100},
        },
    }


# ── Rule resolution ────────────────────────────────────────────────────────

# Tiebreaker order within same role-priority: more specific targets first.
# Group > Hierarchy > Category > Department > Grade > Everyone
_TARGET_SPECIFICITY = {
    "group":     6,
    "hierarchy": 5,
    "category":  4,
    "department":3,
    "grade":     2,
    "everyone":  1,
}


def _rule_target_type(rule: WeightRule) -> str:
    if rule.group_id:      return "group"
    if rule.hierarchy:     return "hierarchy"
    if rule.user_category: return "category"
    if rule.department_id: return "department"
    if rule.job_grade:     return "grade"
    return "everyone"


async def _creator_role_priority(
    creator: Optional[User],
    db: AsyncSession,
) -> int:
    """Return role-based priority for a rule's creator.
    1 = HR Admin / Super Admin (highest)
    2 = HOD (creator is referenced as another employee's hod_id)
    3 = Manager (creator has direct reports)
    99 = no recognised authority (treated as lowest)
    """
    if creator is None:
        return 99
    if creator.role in ("HR_ADMIN", "SUPER_ADMIN"):
        return 1
    # HOD: somebody has hod_id = creator.id
    from app.models.user import GroupMember  # noqa
    hod_res = await db.execute(
        select(User.id).where(User.hod_id == creator.id).limit(1)
    )
    if hod_res.scalar_one_or_none() is not None or creator.role == "HOD":
        return 2
    # Manager: somebody reports to creator directly
    mgr_res = await db.execute(
        select(User.id).where(User.direct_manager_id == creator.id).limit(1)
    )
    if mgr_res.scalar_one_or_none() is not None or creator.role in ("MANAGER", "MGR2"):
        return 3
    return 99


async def _rule_applies_to_employee(
    rule: WeightRule,
    employee: User,
    creator: Optional[User],
    creator_priority: int,
    db: AsyncSession,
) -> bool:
    """Check if rule applies to employee based on rule target and creator's scope."""
    from app.models.user import GroupMember

    # First: does the employee match the rule's target filter?
    target = _rule_target_type(rule)
    if target == "group":
        gm = await db.execute(
            select(GroupMember.user_id).where(
                GroupMember.group_id == rule.group_id,
                GroupMember.user_id  == employee.id,
            )
        )
        if gm.scalar_one_or_none() is None:
            return False
    elif target == "hierarchy":
        if (employee.hierarchy or "") != (rule.hierarchy or ""):
            return False
    elif target == "category":
        if (employee.category or "") != (rule.user_category or ""):
            return False
    elif target == "department":
        if str(employee.department_id or "") != str(rule.department_id or ""):
            return False
    elif target == "grade":
        if (employee.job_grade or "") != (rule.job_grade or ""):
            return False
    # everyone: applies to all

    # Second: scope restrictions based on creator role
    if creator is None or creator_priority == 1:
        # HR Admin / Super Admin rules apply to everyone matching the target
        return True

    if creator_priority == 2:
        # HOD: applies to direct reports OR indirect (2 levels)
        if employee.direct_manager_id and str(employee.direct_manager_id) == str(creator.id):
            return True
        if employee.hod_id and str(employee.hod_id) == str(creator.id):
            return True
        # Indirect: employee's direct manager reports to creator
        if employee.direct_manager_id:
            dm_res = await db.execute(
                select(User).where(User.id == employee.direct_manager_id)
            )
            dm = dm_res.scalar_one_or_none()
            if dm and dm.direct_manager_id and str(dm.direct_manager_id) == str(creator.id):
                return True
        return False

    if creator_priority == 3:
        # Manager: only direct reports
        if employee.direct_manager_id and str(employee.direct_manager_id) == str(creator.id):
            return True
        return False

    return False


async def get_applicable_rule(
    employee_id: UUID,
    cycle_id: UUID,
    db: AsyncSession,
) -> Optional[dict]:
    """Resolve the single highest-priority weight rule applicable to an employee.

    Role priority: 1 (HR Admin) > 2 (HOD) > 3 (Manager).
    Within same priority, tie-break by target specificity:
        Group > Hierarchy > Category > Department > Grade > Everyone.
    Returns the rule_to_dict() of the chosen rule, or None.
    """
    emp_res = await db.execute(select(User).where(User.id == employee_id))
    employee = emp_res.scalar_one_or_none()
    if employee is None:
        return None

    rules_res = await db.execute(
        select(WeightRule).where(WeightRule.cycle_id == cycle_id)
    )
    rules = rules_res.scalars().all()
    if not rules:
        return None

    # Cache creators by id
    creator_cache: dict = {}
    priority_cache: dict = {}

    async def _creator_for(rule: WeightRule):
        if rule.created_by is None:
            return None, 99
        key = str(rule.created_by)
        if key in creator_cache:
            return creator_cache[key], priority_cache[key]
        c_res = await db.execute(select(User).where(User.id == rule.created_by))
        creator = c_res.scalar_one_or_none()
        prio = await _creator_role_priority(creator, db)
        creator_cache[key]  = creator
        priority_cache[key] = prio
        return creator, prio

    best = None  # tuple (priority, -specificity, rule, creator)
    for rule in rules:
        # Skip the GLOBAL_MIN sentinel — it's a baseline, not a coverage rule
        if (rule.label or "") == "GLOBAL_MIN":
            continue
        creator, prio = await _creator_for(rule)
        if not await _rule_applies_to_employee(rule, employee, creator, prio, db):
            continue
        specificity = _TARGET_SPECIFICITY.get(_rule_target_type(rule), 0)
        key = (prio, -specificity)
        if best is None or key < best[0]:
            best = (key, rule, creator)

    if best is None:
        return None

    _, rule, creator = best
    creator_role = creator.role if creator else None
    return rule_to_dict(rule, creator_role=creator_role)

# ── Static routes ──────────────────────────────────────────────────────────

@router.get("/")
async def list_kpis(
    cycle_id:     UUID,
    user_id:      Optional[UUID] = None,
    status:       Optional[str]  = None,
    pending_for_me: bool         = False,
    db:           AsyncSession   = Depends(get_db),
    current_user: User           = Depends(get_current_user),
):
    q = select(Kpi).where(Kpi.cycle_id == cycle_id)

    if pending_for_me:
        # Show KPIs awaiting approval at this manager's level in the chain
        sub_dm = select(User.id).where(User.direct_manager_id    == current_user.id)
        sub_rm = select(User.id).where(User.reviewing_manager_id == current_user.id)
        sub_hd = select(User.id).where(User.hod_id               == current_user.id)
        from sqlalchemy import or_, and_
        q = q.where(or_(
            and_(Kpi.status == "PENDING_DM",  Kpi.user_id.in_(sub_dm)),
            and_(Kpi.status == "PENDING_RM",  Kpi.user_id.in_(sub_rm)),
            and_(Kpi.status == "PENDING_HOD", Kpi.user_id.in_(sub_hd)),
        ))
        if user_id:
            q = q.where(Kpi.user_id == user_id)
    else:
        # Check if user is HR/Super Admin
        is_admin = current_user.role in ["HR_ADMIN", "SUPER_ADMIN"]

        # Check if user is a manager of the requested employee (org-chart derived)
        is_manager_of_employee = False
        if user_id and not is_admin:
            from sqlalchemy import or_
            emp_result = await db.execute(
                select(User).where(
                    User.id == user_id,
                    or_(
                        User.direct_manager_id == current_user.id,
                        User.reviewing_manager_id == current_user.id,
                        User.hod_id == current_user.id,
                    )
                )
            )
            is_manager_of_employee = emp_result.scalar_one_or_none() is not None

        if is_admin:
            if user_id:
                q = q.where(Kpi.user_id == user_id)
        elif is_manager_of_employee:
            q = q.where(Kpi.user_id == user_id)
        elif current_user.role in ["MANAGER", "HOD"] and user_id:
            # Legacy role-based check
            q = q.where(Kpi.user_id == user_id)
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
        category      = body.kpi_dimension,
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

    # Resolve employees from target fields, then merge with explicit IDs
    from app.models.user import GroupMember
    resolved: set = set()

    if body.group_id:
        gm_res = await db.execute(
            select(GroupMember.user_id).where(GroupMember.group_id == body.group_id)
        )
        resolved.update(row[0] for row in gm_res.all())
    elif body.hierarchy:
        u_res = await db.execute(
            select(User.id).where(User.hierarchy == body.hierarchy, User.is_active == True)
        )
        resolved.update(row[0] for row in u_res.all())
    elif body.user_category:
        u_res = await db.execute(
            select(User.id).where(User.category == body.user_category, User.is_active == True)
        )
        resolved.update(row[0] for row in u_res.all())
    elif body.department_id:
        u_res = await db.execute(
            select(User.id).where(User.department_id == body.department_id, User.is_active == True)
        )
        resolved.update(row[0] for row in u_res.all())
    elif body.job_grade:
        u_res = await db.execute(
            select(User.id).where(User.job_grade == body.job_grade, User.is_active == True)
        )
        resolved.update(row[0] for row in u_res.all())
    elif not body.employee_ids:
        # No target specified and no explicit IDs → cascade to all active users
        u_res = await db.execute(select(User.id).where(User.is_active == True))
        resolved.update(row[0] for row in u_res.all())

    all_ids = resolved | set(body.employee_ids)

    # Managers may only cascade to their own reporting chain;
    # HR can opt-in to the same restriction via restrict_to_reports
    if current_user.role in ["MANAGER", "MGR2", "HOD"] or body.restrict_to_reports:
        chain_res = await db.execute(
            select(User.id).where(
                User.is_active == True,
                (
                    (User.direct_manager_id    == current_user.id) |
                    (User.reviewing_manager_id == current_user.id) |
                    (User.hod_id               == current_user.id)
                ),
            )
        )
        chain_ids = {row[0] for row in chain_res.all()}
        all_ids   = all_ids & chain_ids

    created = []
    skipped = []

    for emp_id in all_ids:
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
            category      = body.kpi_dimension,
            kpi_type      = "FIXED",
            weight        = body.weight,
            target        = body.target,
            measurement   = body.measurement,
            status        = "APPROVED",
            cascaded_by   = current_user.id,
            rating_targets = body.rating_targets,
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


# ── KPI Templates ──────────────────────────────────────────────────────────

class TemplateCreate(BaseModel):
    cycle_id:      UUID
    name:          str
    description:   Optional[str] = None
    kpi_dimension: str
    min_weight:    int = 0
    max_weight:    int = 100
    target:        str = ''
    measurement:   Optional[str] = None
    group_id:      Optional[UUID] = None
    hierarchy:     Optional[str]  = None
    user_category: Optional[str]  = None
    department_id: Optional[UUID] = None
    job_grade:     Optional[str]  = None
    rating_targets: Optional[list] = None


def template_to_dict(t) -> dict:
    return {
        "id":            str(t.id),
        "cycle_id":      str(t.cycle_id),
        "name":          t.name,
        "description":   t.description,
        "kpi_dimension": t.category,
        "weight":        t.weight,
        "target":        t.target,
        "measurement":   t.measurement,
        "department_id": str(t.department_id) if t.department_id else None,
        "job_grade":     t.job_grade,
        "is_active":     t.is_active,
        "rating_targets": t.rating_targets,
    }


@router.get("/templates/{cycle_id}")
async def list_templates(
    cycle_id:     UUID,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    from app.models.user import KpiTemplate, GroupMember  # noqa
    result = await db.execute(
        select(KpiTemplate).where(
            KpiTemplate.cycle_id  == cycle_id,
            KpiTemplate.is_active == True,
        ).order_by(KpiTemplate.created_at)
    )
    return [template_to_dict(t) for t in result.scalars().all()]


@router.post("/templates")
async def create_template(
    body: TemplateCreate,
    db:   AsyncSession = Depends(get_db),
    _:    User         = Depends(require_hr_admin),
):
    from app.models.user import KpiTemplate, GroupMember  # noqa
    t = KpiTemplate(
        cycle_id      = body.cycle_id,
        name          = body.name,
        description   = body.description,
        category      = body.kpi_dimension,
        weight        = body.min_weight,
        target        = body.target,
        measurement   = body.measurement,
        department_id = body.department_id,
        job_grade     = body.job_grade,
        rating_targets = body.rating_targets,
    )
    db.add(t)
    await db.flush()
    await db.refresh(t)
    return template_to_dict(t)


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: UUID,
    db:          AsyncSession = Depends(get_db),
    _:           User         = Depends(require_hr_admin),
):
    from app.models.user import KpiTemplate, GroupMember  # noqa
    result = await db.execute(
        select(KpiTemplate).where(KpiTemplate.id == template_id)
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Template not found")
    t.is_active = False
    return {"message": "Template deleted"}


@router.post("/templates/{template_id}/cascade")
async def cascade_template(
    template_id:  UUID,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(require_hr_admin),
):
    from app.models.user import KpiTemplate, GroupMember

    res = await db.execute(
        select(KpiTemplate).where(KpiTemplate.id == template_id)
    )
    t = res.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Template not found")

    # Match employees: group > department > job_grade > everyone
    if t.department_id:
        q = select(User).where(
            User.department_id == t.department_id,
            User.is_active     == True,
        )
    elif t.job_grade:
        q = select(User).where(
            User.job_grade == t.job_grade,
            User.is_active == True,
        )
    else:
        q = select(User).where(User.is_active == True)

    matched = (await db.execute(q)).scalars().all()

    created = updated = 0
    for u in matched:
        existing = (await db.execute(
            select(Kpi).where(
                Kpi.cycle_id == t.cycle_id,
                Kpi.user_id  == u.id,
                Kpi.name     == t.name,
                Kpi.kpi_type == "FIXED",
            )
        )).scalar_one_or_none()

        if existing:
            existing.description   = t.description
            existing.kpi_dimension = t.category
            existing.category      = t.category
            existing.weight        = t.weight
            existing.target        = t.target
            existing.measurement   = t.measurement
            existing.status        = "APPROVED"
            existing.cascaded_by   = current_user.id
            existing.rating_targets = t.rating_targets
            updated += 1
        else:
            db.add(Kpi(
                cycle_id      = t.cycle_id,
                user_id       = u.id,
                template_id   = t.id,
                name          = t.name,
                description   = t.description,
                kpi_dimension = t.category,
                category      = t.category,
                kpi_type      = "FIXED",
                weight        = t.weight,
                target        = t.target,
                measurement   = t.measurement,
                status        = "APPROVED",
                cascaded_by   = current_user.id,
                rating_targets = t.rating_targets,
            ))
            created += 1

    await db.flush()
    return {
        "created": created,
        "updated": updated,
        "message": (
            f"Cascaded to {len(matched)} employee(s) "
            f"({created} created, {updated} updated)."
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
    rules = result.scalars().all()

    # Resolve creator roles in one pass
    creator_ids = {r.created_by for r in rules if r.created_by}
    role_by_id: dict = {}
    if creator_ids:
        cres = await db.execute(select(User).where(User.id.in_(creator_ids)))
        for u in cres.scalars().all():
            role_by_id[str(u.id)] = u.role

    return [
        rule_to_dict(
            r,
            creator_role=role_by_id.get(str(r.created_by)) if r.created_by else None,
        )
        for r in rules
    ]


@router.get("/applicable-rule")
async def applicable_rule(
    employee_id:  UUID,
    cycle_id:     UUID,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Return the single highest-priority weight rule applying to the employee."""
    is_admin = current_user.role in ("HR_ADMIN", "SUPER_ADMIN")
    is_self  = str(current_user.id) == str(employee_id)

    if not is_admin and not is_self:
        emp_res = await db.execute(select(User).where(User.id == employee_id))
        emp = emp_res.scalar_one_or_none()
        if emp is None:
            raise HTTPException(404, "Employee not found")
        is_manager_of = (
            (emp.direct_manager_id    and str(emp.direct_manager_id)    == str(current_user.id)) or
            (emp.reviewing_manager_id and str(emp.reviewing_manager_id) == str(current_user.id)) or
            (emp.hod_id               and str(emp.hod_id)               == str(current_user.id))
        )
        if not is_manager_of:
            raise HTTPException(403, "Not authorised to view this employee's rule")

    return await get_applicable_rule(employee_id, cycle_id, db)


def _employees_matched_by_rule_payload(
    rule_payload: dict,
    db_users: list,
    group_members_by_group: dict,
) -> set:
    """Return set of user_ids that match a rule's target filter (ignoring creator scope)."""
    matched: set = set()
    group_id      = rule_payload.get("group_id")
    hierarchy     = rule_payload.get("hierarchy")
    user_category = rule_payload.get("user_category")
    department_id = rule_payload.get("department_id")
    job_grade     = rule_payload.get("job_grade")

    if group_id:
        return set(group_members_by_group.get(str(group_id), set()))
    if hierarchy:
        return {u.id for u in db_users if (u.hierarchy or "") == hierarchy}
    if user_category:
        return {u.id for u in db_users if (u.category or "") == user_category}
    if department_id:
        return {u.id for u in db_users if str(u.department_id or "") == str(department_id)}
    if job_grade:
        return {u.id for u in db_users if (u.job_grade or "") == job_grade}
    # everyone
    return {u.id for u in db_users}


@router.post("/weight-rules/{cycle_id}")
async def set_weight_rules(
    cycle_id:     UUID,
    body:         List[dict],
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    # Role gate — only HR Admin, Super Admin, HOD or Manager may write rules
    if current_user.role not in ("HR_ADMIN", "SUPER_ADMIN", "HOD", "MANAGER", "MGR2"):
        raise HTTPException(403, "Not authorised to set weight rules")

    actor_priority = await _creator_role_priority(current_user, db)

    # Pre-fetch existing rules with their creator roles for conflict checking
    existing_res = await db.execute(
        select(WeightRule).where(WeightRule.cycle_id == cycle_id)
    )
    existing_rules = existing_res.scalars().all()
    creator_ids = {r.created_by for r in existing_rules if r.created_by}
    creator_priority: dict = {}
    if creator_ids:
        cres = await db.execute(select(User).where(User.id.in_(creator_ids)))
        for u in cres.scalars().all():
            creator_priority[str(u.id)] = await _creator_role_priority(u, db)

    # Load all active users and group members once for matching
    if actor_priority != 1:
        from app.models.user import GroupMember
        users_res = await db.execute(select(User).where(User.is_active == True))
        all_users = users_res.scalars().all()
        users_by_id = {u.id: u for u in all_users}

        gm_res = await db.execute(select(GroupMember))
        group_members_by_group: dict = {}
        for gm in gm_res.scalars().all():
            group_members_by_group.setdefault(str(gm.group_id), set()).add(gm.user_id)

        # For each incoming non-sentinel rule, resolve which employees it covers
        # within the actor's scope, then check whether any higher-priority
        # existing rule already covers them.
        for r in body:
            if (r.get("label") or "") == "GLOBAL_MIN":
                continue
            target_matched = _employees_matched_by_rule_payload(
                r, all_users, group_members_by_group,
            )

            # Restrict to actor scope
            scoped: set = set()
            for uid in target_matched:
                emp = users_by_id.get(uid)
                if not emp:
                    continue
                if actor_priority == 2:  # HOD
                    if emp.direct_manager_id and str(emp.direct_manager_id) == str(current_user.id):
                        scoped.add(uid); continue
                    if emp.hod_id and str(emp.hod_id) == str(current_user.id):
                        scoped.add(uid); continue
                    if emp.direct_manager_id:
                        dm = users_by_id.get(emp.direct_manager_id)
                        if dm and dm.direct_manager_id and str(dm.direct_manager_id) == str(current_user.id):
                            scoped.add(uid); continue
                elif actor_priority == 3:  # Manager
                    if emp.direct_manager_id and str(emp.direct_manager_id) == str(current_user.id):
                        scoped.add(uid)

            if not scoped:
                continue

            # Check conflicts against existing rules of higher priority
            for ex in existing_rules:
                if (ex.label or "") == "GLOBAL_MIN":
                    continue
                ex_prio = creator_priority.get(str(ex.created_by), 99) if ex.created_by else 99
                if ex_prio >= actor_priority:
                    continue  # not higher priority

                ex_payload = {
                    "group_id":      str(ex.group_id) if ex.group_id else None,
                    "hierarchy":     ex.hierarchy,
                    "user_category": ex.user_category,
                    "department_id": str(ex.department_id) if ex.department_id else None,
                    "job_grade":     ex.job_grade,
                }
                ex_matched = _employees_matched_by_rule_payload(
                    ex_payload, all_users, group_members_by_group,
                )
                # Apply ex creator scope too
                ex_creator = None
                if ex.created_by:
                    ec_res = await db.execute(select(User).where(User.id == ex.created_by))
                    ex_creator = ec_res.scalar_one_or_none()
                ex_scoped: set = set()
                for uid in ex_matched:
                    emp = users_by_id.get(uid)
                    if not emp:
                        continue
                    if ex_prio == 1:
                        ex_scoped.add(uid)
                    elif ex_prio == 2 and ex_creator:
                        if emp.direct_manager_id and str(emp.direct_manager_id) == str(ex_creator.id):
                            ex_scoped.add(uid); continue
                        if emp.hod_id and str(emp.hod_id) == str(ex_creator.id):
                            ex_scoped.add(uid); continue
                        if emp.direct_manager_id:
                            dm = users_by_id.get(emp.direct_manager_id)
                            if dm and dm.direct_manager_id and str(dm.direct_manager_id) == str(ex_creator.id):
                                ex_scoped.add(uid)
                    elif ex_prio == 3 and ex_creator:
                        if emp.direct_manager_id and str(emp.direct_manager_id) == str(ex_creator.id):
                            ex_scoped.add(uid)

                overlap = scoped & ex_scoped
                if overlap:
                    names = []
                    for uid in list(overlap)[:8]:
                        u = users_by_id.get(uid)
                        if u:
                            names.append(u.full_name)
                    more = f" and {len(overlap) - len(names)} more" if len(overlap) > len(names) else ""
                    role_label = {1: "HR Admin", 2: "HOD"}.get(ex_prio, "higher-priority")
                    raise HTTPException(
                        400,
                        f"Rule '{r.get('label') or 'Untitled'}' conflicts with an existing "
                        f"{role_label} rule ('{ex.label or 'Untitled'}') already covering "
                        f"{len(overlap)} employee(s): {', '.join(names)}{more}.",
                    )

    # All checks passed — replace this actor's rules.
    # HR Admin replaces everything; non-admins replace only their own rules.
    for rule in existing_rules:
        if actor_priority == 1:
            await db.delete(rule)
        elif rule.created_by and str(rule.created_by) == str(current_user.id):
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
            created_by    = current_user.id,
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


# ── Admin scorecard management ────────────────────────────────────────────

class AdminScorecardRequest(BaseModel):
    cycle_id:    UUID
    employee_id: UUID


@router.post("/admin/reset-scorecard")
async def admin_reset_scorecard(
    body:         AdminScorecardRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(require_hr_admin),
):
    res = await db.execute(
        select(Kpi).where(Kpi.cycle_id == body.cycle_id, Kpi.user_id == body.employee_id)
    )
    kpis = res.scalars().all()

    from app.models.user import KpiAuditLog
    for kpi in kpis:
        old = kpi.status
        kpi.status      = "DRAFT"
        kpi.mgr_comment = None
        kpi.mgr_score   = None
        db.add(KpiAuditLog(
            kpi_id=kpi.id, actor_id=current_user.id,
            from_status=old, to_status="DRAFT", comment="Admin reset to draft",
        ))

    await db.flush()
    return {"reset": len(kpis), "message": "Scorecard reset to draft"}


@router.delete("/admin/delete-scorecard")
async def admin_delete_scorecard(
    body: AdminScorecardRequest,
    db:   AsyncSession = Depends(get_db),
    _:    User         = Depends(require_hr_admin),
):
    from app.models.user import KpiAuditLog

    res = await db.execute(
        select(Kpi).where(Kpi.cycle_id == body.cycle_id, Kpi.user_id == body.employee_id)
    )
    kpis = res.scalars().all()
    count = len(kpis)

    if kpis:
        audit_result = await db.execute(
            select(KpiAuditLog).where(KpiAuditLog.kpi_id.in_([k.id for k in kpis]))
        )
        for log in audit_result.scalars().all():
            await db.delete(log)
        await db.flush()

    for kpi in kpis:
        await db.delete(kpi)
    await db.flush()
    return {"deleted": count, "message": "Scorecard deleted"}


class AdminAllScorecardsRequest(BaseModel):
    cycle_id: UUID


@router.post("/admin/reset-all-scorecards")
async def admin_reset_all_scorecards(
    body:         AdminAllScorecardsRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(require_hr_admin),
):
    from app.models.user import KpiAuditLog

    res = await db.execute(select(Kpi).where(Kpi.cycle_id == body.cycle_id))
    kpis = res.scalars().all()

    if kpis:
        audit_result = await db.execute(
            select(KpiAuditLog).where(KpiAuditLog.kpi_id.in_([k.id for k in kpis]))
        )
        for log in audit_result.scalars().all():
            await db.delete(log)
        await db.flush()

    for kpi in kpis:
        kpi.status             = "DRAFT"
        kpi.mgr_comment        = None
        kpi.self_rating        = None
        kpi.actual_achievement = None
        kpi.self_remarks       = None

    await db.flush()
    return {"reset": len(kpis), "message": "All scorecards reset to draft"}


@router.delete("/admin/delete-all-scorecards")
async def admin_delete_all_scorecards(
    body:         AdminAllScorecardsRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(403, "Super Admin only")

    from app.models.user import KpiAuditLog

    res = await db.execute(select(Kpi).where(Kpi.cycle_id == body.cycle_id))
    kpis = res.scalars().all()
    count = len(kpis)

    if kpis:
        audit_result = await db.execute(
            select(KpiAuditLog).where(KpiAuditLog.kpi_id.in_([k.id for k in kpis]))
        )
        for log in audit_result.scalars().all():
            await db.delete(log)
        await db.flush()

    for kpi in kpis:
        await db.delete(kpi)
    await db.flush()
    return {"deleted": count, "message": "All scorecards deleted"}


# ── Scorecard-level endpoints ──────────────────────────────────────────────

@router.post("/submit-scorecard")
async def submit_scorecard(
    body:         ScorecardSubmitRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    chain = await get_cycle_chain(db, body.cycle_id)

    if "DM" in chain and not current_user.direct_manager_id:
        raise HTTPException(400, "Direct Manager not assigned. Contact HR.")
    if "RM" in chain and not current_user.reviewing_manager_id:
        raise HTTPException(400, "Reviewing Manager not assigned. Contact HR.")
    if "HOD" in chain and not current_user.hod_id:
        raise HTTPException(400, "HOD not assigned. Contact HR.")

    all_res = await db.execute(
        select(Kpi).where(Kpi.cycle_id == body.cycle_id, Kpi.user_id == current_user.id)
    )
    all_kpis = all_res.scalars().all()

    total_weight = sum(k.weight for k in all_kpis)
    if total_weight != 100:
        raise HTTPException(400, "Total weight must equal 100%")

    submittable = [k for k in all_kpis if k.status in ("DRAFT", "REJECTED", "APPROVED")]
    if not submittable:
        raise HTTPException(400, "No KPIs in submittable status (DRAFT, REJECTED, or APPROVED)")

    from app.models.user import KpiAuditLog, Notification  # noqa
    for kpi in submittable:
        old = kpi.status
        kpi.status = "PENDING_DM"
        db.add(KpiAuditLog(
            kpi_id=kpi.id, actor_id=current_user.id,
            from_status=old, to_status="PENDING_DM",
        ))

    if current_user.direct_manager_id:
        db.add(Notification(
            user_id=current_user.direct_manager_id,
            title="Scorecard Pending Your Approval",
            body=f"{current_user.full_name} has submitted their scorecard for your review.",
            type="KPI_PENDING",
        ))

    await db.flush()
    return {"submitted": len(submittable), "message": "Scorecard submitted for approval"}


@router.post("/review-scorecard")
async def review_scorecard(
    body:         ScorecardReviewRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    if body.action not in ("approve", "reject"):
        raise HTTPException(400, "action must be 'approve' or 'reject'")

    emp_res = await db.execute(select(User).where(User.id == body.employee_id))
    employee = emp_res.scalar_one_or_none()
    if not employee:
        raise HTTPException(404, "Employee not found")

    chain = await get_cycle_chain(db, body.cycle_id)
    is_admin = current_user.role in ["HR_ADMIN", "SUPER_ADMIN"]

    # Resolve which pending status applies to the current user for this employee.
    user_levels: list[str] = []
    if "DM"  in chain and employee.direct_manager_id    and str(employee.direct_manager_id)    == str(current_user.id):
        user_levels.append("DM")
    if "RM"  in chain and employee.reviewing_manager_id and str(employee.reviewing_manager_id) == str(current_user.id):
        user_levels.append("RM")
    if "HOD" in chain and employee.hod_id               and str(employee.hod_id)               == str(current_user.id):
        user_levels.append("HOD")

    if is_admin:
        candidate_statuses = [PENDING_STATUS_FOR_LEVEL[lv] for lv in chain]
    elif user_levels:
        candidate_statuses = [PENDING_STATUS_FOR_LEVEL[lv] for lv in user_levels]
    else:
        raise HTTPException(403, "You are not an approver for this employee")

    kpis_res = await db.execute(
        select(Kpi).where(
            Kpi.cycle_id == body.cycle_id,
            Kpi.user_id  == body.employee_id,
            Kpi.status.in_(candidate_statuses),
        )
    )
    kpis = kpis_res.scalars().all()
    if not kpis:
        raise HTTPException(404, "No KPIs pending approval for this employee at your approval level")

    statuses = {k.status for k in kpis}
    if len(statuses) != 1:
        raise HTTPException(400, "Scorecard KPIs are at mixed approval stages")
    current_status = next(iter(statuses))
    current_level  = LEVEL_FOR_PENDING_STATUS.get(current_status)
    if current_level is None:
        raise HTTPException(400, "Unknown approval stage")

    from app.models.user import KpiAuditLog, Notification

    if body.action == "approve":
        next_status = next_pending_status(chain, current_status)
        if next_status is None:
            for kpi in kpis:
                old = kpi.status
                kpi.status = "APPROVED"
                db.add(KpiAuditLog(
                    kpi_id=kpi.id, actor_id=current_user.id,
                    from_status=old, to_status="APPROVED", comment=body.comment or None,
                ))
                kpi.status = "LOCKED"
                db.add(KpiAuditLog(
                    kpi_id=kpi.id, actor_id=current_user.id,
                    from_status="APPROVED", to_status="LOCKED", comment=body.comment or None,
                ))
            db.add(Notification(
                user_id=employee.id,
                title="Scorecard Approved",
                body=f"Your scorecard has been approved and locked by {current_user.full_name}.",
                type="KPI_APPROVED",
            ))
            msg = f"Scorecard approved and locked for {employee.full_name}"
        else:
            for kpi in kpis:
                old = kpi.status
                kpi.status = next_status
                db.add(KpiAuditLog(
                    kpi_id=kpi.id, actor_id=current_user.id,
                    from_status=old, to_status=next_status, comment=body.comment or None,
                ))
            next_level   = LEVEL_FOR_PENDING_STATUS[next_status]
            next_user_id = {
                "DM":  employee.direct_manager_id,
                "RM":  employee.reviewing_manager_id,
                "HOD": employee.hod_id,
            }.get(next_level)
            if next_user_id:
                db.add(Notification(
                    user_id=next_user_id,
                    title="Scorecard Pending Your Approval",
                    body=f"{employee.full_name}'s scorecard has been forwarded for your review.",
                    type="KPI_PENDING",
                ))
            db.add(Notification(
                user_id=employee.id,
                title="Scorecard Forwarded",
                body=f"Your scorecard was approved by {current_user.full_name} and forwarded to the next approver.",
                type="KPI_FORWARDED",
            ))
            msg = f"Scorecard forwarded to {next_level} for {employee.full_name}"
    else:
        if not body.comment:
            raise HTTPException(400, "A comment is required when rejecting a scorecard")
        for kpi in kpis:
            old = kpi.status
            kpi.status      = "REJECTED"
            kpi.mgr_comment = body.comment
            db.add(KpiAuditLog(
                kpi_id=kpi.id, actor_id=current_user.id,
                from_status=old, to_status="REJECTED", comment=body.comment,
            ))
        db.add(Notification(
            user_id=employee.id,
            title="Scorecard Rejected",
            body=f"Your scorecard was rejected by {current_user.full_name}. Please revise and resubmit.",
            type="KPI_REJECTED",
        ))
        msg = f"Scorecard rejected for {employee.full_name}"

    await db.flush()
    return {"updated": len(kpis), "message": msg}


# ── Self-evaluation ────────────────────────────────────────────────────────

@router.post("/self-evaluate-all")
async def self_evaluate_all(
    body:         SelfEvaluateAllRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    locked_res = await db.execute(
        select(Kpi).where(
            Kpi.cycle_id == body.cycle_id,
            Kpi.user_id  == current_user.id,
            Kpi.status.in_(["LOCKED", "SELF_EVALUATED"]),
        )
    )
    locked_kpis = locked_res.scalars().all()
    locked_ids  = {str(k.id) for k in locked_kpis}

    eval_ids = {str(e.kpi_id) for e in body.evaluations}

    if locked_ids - eval_ids:
        raise HTTPException(
            400,
            "All locked KPIs for this cycle must be evaluated before submission",
        )

    by_id = {str(k.id): k for k in locked_kpis}
    count = 0
    for ev in body.evaluations:
        kpi = by_id.get(str(ev.kpi_id))
        if not kpi:
            raise HTTPException(404, f"KPI {ev.kpi_id} not found or not eligible")
        if str(kpi.user_id) != str(current_user.id):
            raise HTTPException(403, "Cannot evaluate KPIs that are not yours")
        kpi.actual_achievement = ev.actual_achievement
        kpi.self_rating        = ev.self_rating
        kpi.self_remarks       = ev.self_remarks or ""
        kpi.status             = "SELF_EVALUATED"
        count += 1

    await db.flush()
    return {"evaluated": count, "message": "Self evaluation submitted"}


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
    from app.models.user import KpiAuditLog
    audit_result = await db.execute(
        select(KpiAuditLog).where(KpiAuditLog.kpi_id == kpi_id)
    )
    for log in audit_result.scalars().all():
        await db.delete(log)
    await db.flush()
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


@router.patch("/{kpi_id}/rating-targets")
async def update_rating_targets(
    kpi_id:       UUID,
    body:         RatingTargetsRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    result = await db.execute(select(Kpi).where(Kpi.id == kpi_id))
    kpi = result.scalar_one_or_none()
    if not kpi:
        raise HTTPException(404, "KPI not found")
    if str(kpi.user_id) != str(current_user.id):
        raise HTTPException(403, "Not your KPI")
    if kpi.kpi_type == "FIXED":
        raise HTTPException(403, "Rating targets for cascaded KPIs cannot be modified by staff")
    if kpi.status not in ("DRAFT", "APPROVED"):
        raise HTTPException(400, "Rating targets can only be set on DRAFT or APPROVED KPIs")
    kpi.rating_targets = body.rating_targets
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
