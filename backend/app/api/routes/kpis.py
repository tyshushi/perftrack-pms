from uuid import UUID
from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from decimal import Decimal

from app.db.session import get_db
from app.core.security import get_current_user, require_hr_admin, require_permission
from app.models.user import Kpi, User, WeightRule, PerformanceCycle
from app.services.kpi_workflow import KpiWorkflowService
from app.api.routes.cycles import normalise_approval_chain
import app.services.email_service as _email_svc

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


async def _get_global_min_weight(db: AsyncSession, cycle_id: UUID) -> int:
    """Fetch the global minimum weight per KPI from the GLOBAL_MIN sentinel rule.
    Stored in fin_min on a WeightRule whose label == 'GLOBAL_MIN'. Returns 0 if absent.
    """
    res = await db.execute(
        select(WeightRule).where(
            WeightRule.cycle_id == cycle_id,
            WeightRule.label    == "GLOBAL_MIN",
        ).limit(1)
    )
    rule = res.scalar_one_or_none()
    if rule is None:
        return 0
    return int(rule.fin_min or 0)


async def get_kpi_count_limits(db) -> dict:
    from sqlalchemy import text
    result = await db.execute(text("""
        SELECT key, value FROM system_settings
        WHERE key IN ('max_kpis_per_scorecard', 'min_kpis_per_scorecard')
    """))
    settings = {row[0]: int(row[1]) for row in result.all()}
    return {
        'max': settings.get('max_kpis_per_scorecard', 10),
        'min': settings.get('min_kpis_per_scorecard', 3),
    }


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


class ManagerEvaluationItem(BaseModel):
    kpi_id:      UUID
    mgr_rating:  float
    mgr_remarks: Optional[str] = ""


class ManagerEvaluateAllRequest(BaseModel):
    cycle_id:    UUID
    employee_id: UUID
    evaluations: List[ManagerEvaluationItem]


class RatingTargetsRequest(BaseModel):
    rating_targets: list


# ── Helper ─────────────────────────────────────────────────────────────────

def kpi_to_dict(k: Kpi, cascader: Optional[User] = None) -> dict:
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
        "cascaded_by":      str(k.cascaded_by) if k.cascaded_by else None,
        "cascaded_by_name": cascader.full_name if cascader else None,
        "cascaded_by_role": cascader.role if cascader else None,
        "rating_targets":     k.rating_targets,
        "actual_achievement": k.actual_achievement,
        "self_rating":        float(k.self_rating) if k.self_rating is not None else None,
        "self_remarks":       k.self_remarks,
        "is_late":            k.is_late or False,
        "hr_unlocked":        k.hr_unlocked or False,
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


async def check_phase_and_tag_late(cycle_id, phase: str, db) -> dict:
    """
    Returns: {'allowed': bool, 'is_late': bool, 'message': str, 'cycle': cycle_obj}
    phase: 'kpi_setting' | 'self_eval' | 'mgr_eval'
    """
    cycle_result = await db.execute(
        select(PerformanceCycle).where(PerformanceCycle.id == cycle_id)
    )
    cycle = cycle_result.scalar_one_or_none()
    if not cycle:
        return {'allowed': False, 'is_late': False, 'message': 'Cycle not found', 'cycle': None}

    if cycle.status != 'ACTIVE':
        return {'allowed': False, 'is_late': False,
                'message': f'This cycle is not active (status: {cycle.status})', 'cycle': cycle}

    today = date.today()

    if phase == 'kpi_setting':
        start = cycle.kpi_setting_start
        end = cycle.kpi_setting_end
    elif phase == 'self_eval':
        start = cycle.self_eval_start
        end = cycle.self_eval_end
    elif phase == 'mgr_eval':
        start = cycle.mgr_eval_start
        end = cycle.mgr_eval_end
    else:
        return {'allowed': True, 'is_late': False, 'message': '', 'cycle': cycle}

    if start and today < start:
        return {'allowed': False, 'is_late': False,
                'message': f'This window is not yet open. Opens on {start.strftime("%d/%m/%Y")}',
                'cycle': cycle}

    is_late = bool(end and today > end)
    message = ''
    if is_late:
        message = f'Window closed on {end.strftime("%d/%m/%Y")}. This will be tagged as Late Submission.'
    elif end:
        message = f'Open until {end.strftime("%d/%m/%Y")}'

    return {'allowed': True, 'is_late': is_late, 'message': message, 'cycle': cycle}


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
    is_manager_of_employee = False

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

        # Check if user has reset_scorecards permission (scorecard managers)
        has_reset_permission = False
        if not is_admin and user_id:
            from sqlalchemy import text
            perm_check = await db.execute(text("""
                SELECT rp.permission
                FROM user_roles ur
                JOIN role_permissions rp ON rp.role_id = ur.role_id
                WHERE ur.user_id = :uid AND rp.permission = 'reset_scorecards'
            """), {"uid": str(current_user.id)})
            has_reset_permission = perm_check.scalar_one_or_none() is not None

        if is_admin or has_reset_permission:
            if user_id:
                q = q.where(Kpi.user_id == user_id)
        elif is_manager_of_employee:
            # Managers see all KPI statuses for their reports, including
            # SELF_EVALUATED — no status filter is applied on this branch.
            q = q.where(Kpi.user_id == user_id)
        elif current_user.role in ["MANAGER", "HOD"] and user_id:
            # Legacy role-based check
            q = q.where(Kpi.user_id == user_id)
        else:
            q = q.where(Kpi.user_id == current_user.id)

    if status and not is_manager_of_employee:
        q = q.where(Kpi.status == status)

    result = await db.execute(q.order_by(Kpi.created_at))
    kpis = result.scalars().all()

    cascader_ids = {k.cascaded_by for k in kpis if k.cascaded_by}
    cascaders: dict = {}
    if cascader_ids:
        c_res = await db.execute(select(User).where(User.id.in_(cascader_ids)))
        for u in c_res.scalars().all():
            cascaders[str(u.id)] = u

    return [
        kpi_to_dict(k, cascader=cascaders.get(str(k.cascaded_by)) if k.cascaded_by else None)
        for k in kpis
    ]


@router.post("/")
async def create_kpi(
    body:         KpiCreate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    global_min = await _get_global_min_weight(db, body.cycle_id)
    if global_min and body.weight < global_min:
        raise HTTPException(
            400,
            f"Minimum weight per KPI is {global_min}%. "
            f"Cannot create a KPI with {body.weight}% weight.",
        )

    limits = await get_kpi_count_limits(db)
    existing_count_res = await db.execute(
        select(func.count(Kpi.id)).where(
            Kpi.cycle_id == body.cycle_id,
            Kpi.user_id  == current_user.id,
            Kpi.status   != "REJECTED",
        )
    )
    if (existing_count_res.scalar() or 0) >= limits['max']:
        raise HTTPException(400, f"Maximum {limits['max']} KPIs per scorecard. Cannot add more.")

    # Dimension max enforcement using the employee's applicable rule
    rule = await get_applicable_rule(current_user.id, body.cycle_id, db)
    if rule:
        dim_info = (rule.get("dimensions") or {}).get(body.kpi_dimension)
        if dim_info is not None:
            dim_max = dim_info.get("max", 100)
            existing = await db.execute(
                select(func.sum(Kpi.weight)).where(
                    Kpi.cycle_id      == body.cycle_id,
                    Kpi.user_id       == current_user.id,
                    Kpi.kpi_dimension == body.kpi_dimension,
                    Kpi.status        != "REJECTED",
                )
            )
            current_dim_total = existing.scalar() or 0
            if current_dim_total + body.weight > dim_max:
                raise HTTPException(
                    400,
                    f"Cannot add KPI: {body.kpi_dimension} dimension would reach "
                    f"{current_dim_total + body.weight}% which exceeds the maximum of "
                    f"{dim_max}% allowed for your group. Current {body.kpi_dimension} "
                    f"total: {current_dim_total}%.",
                )

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
    from sqlalchemy import text

    # Check if user has cascade_kpis permission via custom roles
    has_cascade_permission = current_user.role in ["HR_ADMIN", "SUPER_ADMIN", "MANAGER", "HOD"]

    if not has_cascade_permission:
        perm_check = await db.execute(text("""
            SELECT rp.permission
            FROM user_roles ur
            JOIN role_permissions rp ON rp.role_id = ur.role_id
            WHERE ur.user_id = :uid AND rp.permission = 'cascade_kpis'
        """), {"uid": str(current_user.id)})
        has_cascade_permission = perm_check.scalar_one_or_none() is not None

    # Also check derived MANAGER role (has direct reports)
    if not has_cascade_permission:
        direct_count = await db.execute(text("""
            SELECT COUNT(*) FROM users
            WHERE is_active = true
            AND (direct_manager_id = :uid OR reviewing_manager_id = :uid OR hod_id = :uid)
        """), {"uid": str(current_user.id)})
        has_cascade_permission = (direct_count.scalar() or 0) > 0

    if not has_cascade_permission:
        raise HTTPException(403, "Not authorised to cascade KPIs")

    if current_user.role not in ("HR_ADMIN", "SUPER_ADMIN"):
        cascade_setting = await db.execute(text(
            "SELECT value FROM system_settings WHERE key = 'manager_cascade_enabled'"
        ))
        cascade_value = cascade_setting.scalar_one_or_none()
        if cascade_value == 'false':
            raise HTTPException(
                403,
                "Manager KPI cascade is currently disabled. Contact HR Admin.",
            )

    global_min = await _get_global_min_weight(db, body.cycle_id)
    if global_min and body.weight < global_min:
        raise HTTPException(
            400,
            f"Minimum weight per KPI is {global_min}%. "
            f"Cannot create a KPI with {body.weight}% weight.",
        )

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

    limits = await get_kpi_count_limits(db)
    created = []
    skipped = []
    skipped_at_max = []

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

        emp_count_res = await db.execute(
            select(func.count(Kpi.id)).where(
                Kpi.cycle_id == body.cycle_id,
                Kpi.user_id  == emp_id,
                Kpi.status   != "REJECTED",
            )
        )
        if (emp_count_res.scalar() or 0) >= limits['max']:
            skipped_at_max.append(str(emp_id))
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
        "skipped_at_max": len(skipped_at_max),
        "message": (
            f"Cascaded to {len(created)} employee(s)."
            + (f" {len(skipped)} already existed." if skipped else "")
            + (f" {len(skipped_at_max)} employee(s) skipped (already at max of {limits['max']} KPIs)." if skipped_at_max else "")
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
    _:    User         = Depends(require_permission("manage_templates")),
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
    _:           User         = Depends(require_permission("manage_templates")),
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
    current_user: User         = Depends(require_permission("manage_templates")),
):
    from app.models.user import KpiTemplate, GroupMember

    res = await db.execute(
        select(KpiTemplate).where(KpiTemplate.id == template_id)
    )
    t = res.scalar_one_or_none()
    if not t:
        raise HTTPException(404, "Template not found")

    global_min = await _get_global_min_weight(db, t.cycle_id)
    if global_min and (t.weight or 0) < global_min:
        raise HTTPException(
            400,
            f"Minimum weight per KPI is {global_min}%. "
            f"Cannot create a KPI with {t.weight}% weight.",
        )

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

    rule = await get_applicable_rule(employee_id, cycle_id, db)
    global_min = await _get_global_min_weight(db, cycle_id)
    if rule is None:
        return {"global_min_weight": global_min} if global_min else None
    rule["global_min_weight"] = global_min
    return rule


@router.get("/count-limits")
async def count_limits_endpoint(
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    return await get_kpi_count_limits(db)


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
        kpi.status       = "DRAFT"
        kpi.mgr_comment  = None
        kpi.mgr_score    = None
        kpi.hr_unlocked  = True
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


class AdminMoveStageRequest(BaseModel):
    cycle_id:     UUID
    employee_id:  UUID
    target_stage: str
    comment:      str = ""


VALID_MOVE_STAGES = {
    "DRAFT", "PENDING_DM", "PENDING_RM", "PENDING_HOD",
    "LOCKED", "SELF_EVAL", "SELF_EVALUATED", "REJECTED",
}


@router.post("/admin/move-stage")
async def admin_move_stage(
    body:         AdminMoveStageRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(require_permission("reset_scorecards")),
):
    if body.target_stage not in VALID_MOVE_STAGES:
        raise HTTPException(
            400,
            f"Invalid target_stage. Must be one of: {', '.join(sorted(VALID_MOVE_STAGES))}",
        )
    if body.target_stage == "REJECTED" and not body.comment.strip():
        raise HTTPException(400, "A comment is required when rejecting a scorecard")

    res = await db.execute(
        select(Kpi).where(
            Kpi.cycle_id == body.cycle_id,
            Kpi.user_id  == body.employee_id,
        )
    )
    kpis = res.scalars().all()
    if not kpis:
        raise HTTPException(400, "No scorecard found for this employee in this cycle")

    from app.models.user import KpiAuditLog

    target = body.target_stage
    # SELF_EVAL is a synthetic stage — it opens self-evaluation, which is
    # triggered by KPIs being LOCKED.
    effective_status = "LOCKED" if target == "SELF_EVAL" else target
    is_hr_or_super = current_user.role in ("HR_ADMIN", "SUPER_ADMIN")

    for kpi in kpis:
        old = kpi.status
        if target == "DRAFT":
            # HR/Super Admin resets ALL KPIs (including FIXED) to allow full staff re-edit.
            # Others with reset_scorecards permission only reset OPTIONAL and their own
            # cascaded FIXED KPIs.
            own_cascade = (
                kpi.kpi_type == "FIXED"
                and kpi.cascaded_by is not None
                and str(kpi.cascaded_by) == str(current_user.id)
            )
            if is_hr_or_super or kpi.kpi_type == "OPTIONAL" or own_cascade:
                kpi.status             = "DRAFT"
                kpi.mgr_comment        = None
                kpi.self_rating        = None
                kpi.actual_achievement = None
                kpi.self_remarks       = None
                if is_hr_or_super:
                    kpi.hr_unlocked = True
        elif target == "REJECTED":
            kpi.status      = "REJECTED"
            kpi.mgr_comment = body.comment
        else:
            kpi.status = effective_status

        db.add(KpiAuditLog(
            kpi_id=kpi.id,
            actor_id=current_user.id,
            from_status=old,
            to_status=kpi.status,
            comment=body.comment or None,
        ))

    await db.flush()
    return {"moved": len(kpis), "message": f"Scorecard moved to {target}"}


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
        kpi.hr_unlocked        = True

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
    is_admin = current_user.role in ("HR_ADMIN", "SUPER_ADMIN")
    if not is_admin:
        phase_check = await check_phase_and_tag_late(body.cycle_id, 'kpi_setting', db)
        if not phase_check['allowed']:
            raise HTTPException(400, phase_check['message'])

    limits = await get_kpi_count_limits(db)
    kpi_count_res = await db.execute(
        select(func.count(Kpi.id)).where(
            Kpi.cycle_id == body.cycle_id,
            Kpi.user_id  == current_user.id,
            Kpi.status   != "REJECTED",
        )
    )
    kpi_count = kpi_count_res.scalar() or 0
    if kpi_count < limits['min']:
        raise HTTPException(
            400,
            f"Cannot submit: minimum {limits['min']} KPIs required. You currently have {kpi_count}.",
        )

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

    # Full dimension validation against applicable rule
    rule = await get_applicable_rule(current_user.id, body.cycle_id, db)
    if rule:
        dims = rule.get("dimensions") or {}
        violations: list[tuple[str, int, int, int]] = []
        for dim_name, bounds in dims.items():
            dim_total = sum(
                k.weight for k in all_kpis
                if k.kpi_dimension == dim_name and k.status != "REJECTED"
            )
            d_min = bounds.get("min", 0) or 0
            d_max = bounds.get("max", 100) or 100
            if dim_total < d_min or dim_total > d_max:
                violations.append((dim_name, dim_total, d_min, d_max))
        if violations:
            detail = "Cannot submit: Weight rule violations found:\n" + "\n".join(
                f"• {dim}: {total}% (allowed: {mn}%–{mx}%)"
                for dim, total, mn, mx in violations
            )
            raise HTTPException(400, detail)

    submittable = [k for k in all_kpis if k.status in ("DRAFT", "REJECTED", "APPROVED")]
    if not submittable:
        raise HTTPException(400, "No KPIs in submittable status (DRAFT, REJECTED, or APPROVED)")

    tag_late = (not is_admin) and phase_check['is_late']

    from app.models.user import KpiAuditLog, Notification  # noqa
    for kpi in submittable:
        old = kpi.status
        kpi.status = "PENDING_DM"
        if tag_late:
            kpi.is_late = True
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

    try:
        _cyc_res = await db.execute(select(PerformanceCycle).where(PerformanceCycle.id == body.cycle_id))
        _cyc = _cyc_res.scalar_one_or_none()
        if current_user.direct_manager_id and _cyc:
            _mgr_res = await db.execute(select(User).where(User.id == current_user.direct_manager_id))
            _mgr = _mgr_res.scalar_one_or_none()
            if _mgr and _mgr.email:
                await _email_svc.notify_scorecard_pending_approval(
                    db=db,
                    manager={'id': _mgr.id, 'full_name': _mgr.full_name, 'email': _mgr.email},
                    employee={'id': current_user.id, 'full_name': current_user.full_name, 'employee_id': current_user.employee_id or ''},
                    cycle={'id': _cyc.id, 'name': _cyc.name},
                )
    except Exception as _e:
        import logging
        logging.getLogger(__name__).warning("submit_scorecard email error: %s", _e)

    msg = "Scorecard submitted for approval"
    if tag_late:
        msg += " (tagged as Late Submission)"
    return {"submitted": len(submittable), "message": msg}


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
            kpi.mgr_comment = body.comment  # always set so staff can see the reason
            own_cascade = (
                kpi.kpi_type == "FIXED"
                and kpi.cascaded_by is not None
                and str(kpi.cascaded_by) == str(current_user.id)
            )
            if kpi.kpi_type == "OPTIONAL" or own_cascade:
                kpi.status = "REJECTED"
            else:
                # FIXED KPIs cascaded by HR Admin/HOD/other → DRAFT so scorecard
                # is back in staff's hands; kpi_type stays FIXED (keeps them non-editable)
                kpi.status = "DRAFT"
            db.add(KpiAuditLog(
                kpi_id=kpi.id, actor_id=current_user.id,
                from_status=old, to_status=kpi.status, comment=body.comment,
            ))
        db.add(Notification(
            user_id=employee.id,
            title="Scorecard Rejected",
            body=f"Your scorecard was rejected by {current_user.full_name}. Please revise and resubmit.",
            type="KPI_REJECTED",
        ))
        msg = f"Scorecard rejected for {employee.full_name}"

    await db.flush()

    try:
        _cyc_res = await db.execute(select(PerformanceCycle).where(PerformanceCycle.id == body.cycle_id))
        _cyc = _cyc_res.scalar_one_or_none()
        if _cyc and employee.email:
            _emp_d = {'id': employee.id, 'full_name': employee.full_name, 'email': employee.email, 'employee_id': employee.employee_id or ''}
            _approver_d = {'id': current_user.id, 'full_name': current_user.full_name, 'email': current_user.email or ''}
            _cyc_d = {'id': _cyc.id, 'name': _cyc.name}
            if body.action == "approve":
                _nxt = next_pending_status(chain, current_status)
                if _nxt is None:
                    await _email_svc.notify_scorecard_approved(db=db, employee=_emp_d, cycle=_cyc_d, approver=_approver_d)
                else:
                    _nxt_level = LEVEL_FOR_PENDING_STATUS[_nxt]
                    _nxt_uid = {'DM': employee.direct_manager_id, 'RM': employee.reviewing_manager_id, 'HOD': employee.hod_id}.get(_nxt_level)
                    if _nxt_uid:
                        _nxt_res = await db.execute(select(User).where(User.id == _nxt_uid))
                        _nxt_mgr = _nxt_res.scalar_one_or_none()
                        if _nxt_mgr and _nxt_mgr.email:
                            await _email_svc.notify_scorecard_pending_approval(
                                db=db,
                                manager={'id': _nxt_mgr.id, 'full_name': _nxt_mgr.full_name, 'email': _nxt_mgr.email},
                                employee=_emp_d,
                                cycle=_cyc_d,
                            )
            else:
                await _email_svc.notify_scorecard_rejected(db=db, employee=_emp_d, cycle=_cyc_d, approver=_approver_d, comment=body.comment)
    except Exception as _e:
        import logging
        logging.getLogger(__name__).warning("review_scorecard email error: %s", _e)

    return {"updated": len(kpis), "message": msg}


# ── Self-evaluation ────────────────────────────────────────────────────────

@router.post("/self-evaluate-all")
async def self_evaluate_all(
    body:         SelfEvaluateAllRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    is_admin = current_user.role in ("HR_ADMIN", "SUPER_ADMIN")
    if not is_admin:
        phase_check = await check_phase_and_tag_late(body.cycle_id, 'self_eval', db)
        if not phase_check['allowed']:
            raise HTTPException(400, phase_check['message'])

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

    tag_late = (not is_admin) and phase_check['is_late']

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
        if tag_late:
            kpi.is_late = True
        count += 1

    await db.flush()

    try:
        _cyc_res = await db.execute(select(PerformanceCycle).where(PerformanceCycle.id == body.cycle_id))
        _cyc = _cyc_res.scalar_one_or_none()
        if current_user.direct_manager_id and _cyc:
            _mgr_res = await db.execute(select(User).where(User.id == current_user.direct_manager_id))
            _mgr = _mgr_res.scalar_one_or_none()
            if _mgr and _mgr.email:
                await _email_svc.notify_self_eval_submitted(
                    db=db,
                    manager={'id': _mgr.id, 'full_name': _mgr.full_name, 'email': _mgr.email},
                    employee={'id': current_user.id, 'full_name': current_user.full_name, 'employee_id': current_user.employee_id or ''},
                    cycle={'id': _cyc.id, 'name': _cyc.name},
                )
    except Exception as _e:
        import logging
        logging.getLogger(__name__).warning("self_evaluate_all email error: %s", _e)

    msg = "Self evaluation submitted"
    if tag_late:
        msg += " (tagged as Late Submission)"
    return {"evaluated": count, "message": msg}


@router.post("/evaluate-all")
async def manager_evaluate_all(
    body:         ManagerEvaluateAllRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    emp_res = await db.execute(select(User).where(User.id == body.employee_id))
    employee = emp_res.scalar_one_or_none()
    if not employee:
        raise HTTPException(404, "Employee not found")

    is_admin = current_user.role in ("HR_ADMIN", "SUPER_ADMIN")
    is_direct_mgr = employee.direct_manager_id    and str(employee.direct_manager_id)    == str(current_user.id)
    is_review_mgr = employee.reviewing_manager_id and str(employee.reviewing_manager_id) == str(current_user.id)
    is_hod        = employee.hod_id               and str(employee.hod_id)               == str(current_user.id)

    has_approve_perm = False
    if not is_admin and not (is_direct_mgr or is_review_mgr or is_hod):
        from sqlalchemy import text
        perm_check = await db.execute(text("""
            SELECT rp.permission
            FROM user_roles ur
            JOIN role_permissions rp ON rp.role_id = ur.role_id
            WHERE ur.user_id = :uid AND rp.permission = 'approve_scorecards'
            LIMIT 1
        """), {"uid": str(current_user.id)})
        has_approve_perm = perm_check.scalar_one_or_none() is not None

    if not (is_admin or is_direct_mgr or is_review_mgr or is_hod or has_approve_perm):
        raise HTTPException(403, "Not authorised to evaluate this employee's scorecard")

    mgr_phase_check = None
    if not is_admin:
        mgr_phase_check = await check_phase_and_tag_late(body.cycle_id, 'mgr_eval', db)
        if not mgr_phase_check['allowed']:
            raise HTTPException(400, mgr_phase_check['message'])

    cycle_res = await db.execute(
        select(PerformanceCycle).where(PerformanceCycle.id == body.cycle_id)
    )
    cycle = cycle_res.scalar_one_or_none()
    if not cycle:
        raise HTTPException(404, "Cycle not found")
    max_rating = cycle.rating_scale_max or 5

    self_eval_res = await db.execute(
        select(Kpi).where(
            Kpi.cycle_id == body.cycle_id,
            Kpi.user_id  == body.employee_id,
            Kpi.status   == "SELF_EVALUATED",
        )
    )
    self_eval_kpis = self_eval_res.scalars().all()
    required_ids = {str(k.id) for k in self_eval_kpis}
    submitted_ids = {str(e.kpi_id) for e in body.evaluations}

    missing = required_ids - submitted_ids
    if missing:
        raise HTTPException(
            400,
            "All self-evaluated KPIs for this employee must be rated before submission",
        )

    all_res = await db.execute(
        select(Kpi).where(
            Kpi.cycle_id == body.cycle_id,
            Kpi.user_id  == body.employee_id,
        )
    )
    all_kpis = all_res.scalars().all()
    by_id = {str(k.id): k for k in all_kpis}

    from app.models.user import KpiAuditLog

    tag_late = (not is_admin) and mgr_phase_check is not None and mgr_phase_check['is_late']

    count = 0
    for ev in body.evaluations:
        kpi = by_id.get(str(ev.kpi_id))
        if not kpi:
            raise HTTPException(404, f"KPI {ev.kpi_id} not found for this employee")
        if str(kpi.user_id) != str(body.employee_id):
            raise HTTPException(403, "KPI does not belong to this employee")
        old_status = kpi.status
        kpi.mgr_score   = ev.mgr_rating
        kpi.mgr_comment = ev.mgr_remarks or ""
        kpi.status      = "MGR_EVALUATED"
        if tag_late:
            kpi.is_late = True
        db.add(KpiAuditLog(
            kpi_id=kpi.id, actor_id=current_user.id,
            from_status=old_status, to_status="MGR_EVALUATED",
            comment=ev.mgr_remarks or None,
            score_given=ev.mgr_rating,
        ))
        count += 1

    total_weighted = 0.0
    for kpi in all_kpis:
        if kpi.mgr_score is not None and kpi.weight is not None:
            total_weighted += (float(kpi.weight) / 100) * float(kpi.mgr_score)

    await db.flush()

    try:
        if employee.email:
            await _email_svc.notify_mgr_eval_complete(
                db=db,
                employee={'id': employee.id, 'full_name': employee.full_name, 'email': employee.email},
                cycle={'id': cycle.id, 'name': cycle.name},
                manager={'id': current_user.id, 'full_name': current_user.full_name, 'email': current_user.email or ''},
            )
    except Exception as _e:
        import logging
        logging.getLogger(__name__).warning("evaluate_all email error: %s", _e)

    msg = "Manager evaluation submitted"
    if tag_late:
        msg += " (tagged as Late Submission)"
    return {
        "evaluated":     count,
        "overall_score": round(total_weighted, 2),
        "message":       msg,
    }


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
        _cascader = None
        if kpi.cascaded_by:
            _r = await db.execute(select(User).where(User.id == kpi.cascaded_by))
            _cascader = _r.scalar_one_or_none()
        if _cascader and _cascader.role in ("HR_ADMIN", "SUPER_ADMIN") and not kpi.hr_unlocked:
            raise HTTPException(403, "HR Admin cascaded KPIs are locked to staff edits")
    was_rejected = kpi.status == "REJECTED"
    for field, val in body.model_dump(exclude_none=True).items():
        setattr(kpi, field, val)
    if was_rejected:
        from app.models.user import KpiAuditLog
        kpi.status = "DRAFT"
        db.add(KpiAuditLog(
            kpi_id=kpi.id, actor_id=current_user.id,
            from_status="REJECTED", to_status="DRAFT",
            comment="KPI edited by staff after rejection",
        ))
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
    if kpi.status not in ("DRAFT", "REJECTED"):
        raise HTTPException(400, "Cannot delete a submitted KPI")
    if kpi.kpi_type == "FIXED":
        _cascader = None
        if kpi.cascaded_by:
            _r = await db.execute(select(User).where(User.id == kpi.cascaded_by))
            _cascader = _r.scalar_one_or_none()
        if _cascader and _cascader.role in ("HR_ADMIN", "SUPER_ADMIN") and not kpi.hr_unlocked:
            raise HTTPException(403, "HR Admin cascaded KPIs cannot be deleted by staff")
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
    if kpi.kpi_type == "FIXED":
        raise HTTPException(403, "Cascaded KPI weights cannot be modified")
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
        _cascader = None
        if kpi.cascaded_by:
            _r = await db.execute(select(User).where(User.id == kpi.cascaded_by))
            _cascader = _r.scalar_one_or_none()
        if _cascader and _cascader.role in ("HR_ADMIN", "SUPER_ADMIN") and not kpi.hr_unlocked:
            raise HTTPException(403, "Rating targets for HR cascaded KPIs cannot be modified by staff")
    if kpi.status not in ("DRAFT", "REJECTED", "APPROVED"):
        raise HTTPException(400, "Rating targets can only be set on DRAFT, REJECTED or APPROVED KPIs")
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
