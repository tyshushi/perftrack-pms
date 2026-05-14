"""
Custom Report Builder — HR Admin / Super Admin only
"""
from uuid import UUID
from typing import List, Optional
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import require_hr_admin
from app.models.user import (
    User, Department, PerformanceCycle, Kpi, RatingScale, GroupMember,
)

router = APIRouter()


DEMOGRAPHICS_COLUMNS = [
    'employee_id', 'full_name', 'email', 'department', 'division', 'section',
    'position_title', 'job_grade', 'category', 'employee_type', 'country',
    'work_location', 'hire_date', 'gender',
]

REPORTING_COLUMNS = ['direct_manager', 'reviewing_manager', 'hod']

SCORECARD_COLUMNS = [
    'cycle_name', 'cycle_year', 'scorecard_status', 'is_late', 'kpi_count',
    'self_rating_overall', 'mgr_rating_overall', 'fin_weight', 'cust_weight',
    'ip_weight', 'lg_weight', 'lc_weight',
]

KPI_DETAIL_COLUMNS = [
    'kpi_name', 'kpi_dimension', 'kpi_weight', 'kpi_measurement',
    'kpi_type', 'rating_target_1', 'rating_target_2', 'rating_target_3',
    'rating_target_4', 'rating_target_5',
]

KPI_SCORE_COLUMNS = [
    'kpi_self_rating', 'kpi_self_rating_label', 'kpi_mgr_rating',
    'kpi_mgr_rating_label', 'kpi_weighted_contribution',
    'kpi_actual_achievement', 'kpi_self_remarks', 'kpi_mgr_comment',
    'kpi_status', 'kpi_is_late',
]


_STATUS_ORDER = [
    "DRAFT", "PENDING_DM", "SELF_EVALUATED", "PENDING_RM",
    "PENDING_HOD", "MGR_EVALUATED", "LOCKED", "REJECTED",
]

_DIMENSION_KEYS = {
    "Financials":           "fin_weight",
    "Customer":             "cust_weight",
    "Internal Process":     "ip_weight",
    "Learning & Growth":    "lg_weight",
    "Leadership & Culture": "lc_weight",
}


class ReportScope(BaseModel):
    department_ids:     Optional[List[UUID]] = None
    divisions:          Optional[List[str]]  = None
    job_grades:         Optional[List[str]]  = None
    categories:         Optional[List[str]]  = None
    group_ids:          Optional[List[UUID]] = None
    direct_manager_ids: Optional[List[UUID]] = None
    hod_ids:            Optional[List[UUID]] = None
    employee_ids:       Optional[List[UUID]] = None


class ReportBuildRequest(BaseModel):
    cycle_ids:          List[UUID]
    scope:              ReportScope
    columns:            List[str]
    kpi_breakdown_mode: bool = False


def _derive_status(kpis: list) -> str:
    if not kpis:
        return "NO_SCORECARD"
    statuses = [k.status for k in kpis]
    if "REJECTED" in statuses:
        return "REJECTED"
    def _ord(s):
        try:
            return _STATUS_ORDER.index(s)
        except ValueError:
            return -1
    return min(statuses, key=_ord)


async def _apply_scope(db: AsyncSession, scope: ReportScope) -> list:
    """Return list of User objects matching all non-null scope filters."""
    q = select(User).where(User.is_active == True)
    if scope.employee_ids:
        q = q.where(User.id.in_(scope.employee_ids))
    if scope.department_ids:
        q = q.where(User.department_id.in_(scope.department_ids))
    if scope.divisions:
        q = q.where(User.division.in_(scope.divisions))
    if scope.job_grades:
        q = q.where(User.job_grade.in_(scope.job_grades))
    if scope.categories:
        q = q.where(User.category.in_(scope.categories))
    if scope.direct_manager_ids:
        q = q.where(User.direct_manager_id.in_(scope.direct_manager_ids))
    if scope.hod_ids:
        q = q.where(User.hod_id.in_(scope.hod_ids))

    result = await db.execute(q)
    users = list(result.scalars().all())

    if scope.group_ids:
        gm_result = await db.execute(
            select(GroupMember.user_id).where(GroupMember.group_id.in_(scope.group_ids))
        )
        group_user_ids = set(gm_result.scalars().all())
        users = [u for u in users if u.id in group_user_ids]

    return users


@router.get("/column-groups")
async def get_column_groups(_: User = Depends(require_hr_admin)):
    return {
        "demographics": DEMOGRAPHICS_COLUMNS,
        "reporting":    REPORTING_COLUMNS,
        "scorecard":    SCORECARD_COLUMNS,
        "kpi_detail":   KPI_DETAIL_COLUMNS,
        "kpi_score":    KPI_SCORE_COLUMNS,
    }


@router.get("/filter-options")
async def get_filter_options(
    db: AsyncSession = Depends(get_db),
    _:  User         = Depends(require_hr_admin),
):
    result = await db.execute(
        select(User.division, User.job_grade, User.category)
        .where(User.is_active == True)
    )
    rows = result.all()
    divisions  = sorted({r.division  for r in rows if r.division})
    job_grades = sorted({r.job_grade for r in rows if r.job_grade})
    categories = sorted({r.category  for r in rows if r.category})
    return {"divisions": divisions, "job_grades": job_grades, "categories": categories}


@router.post("/preview")
async def preview_report(
    body: ReportBuildRequest,
    db:   AsyncSession = Depends(get_db),
    _:    User         = Depends(require_hr_admin),
):
    users = await _apply_scope(db, body.scope)
    return {"count": len(users)}


@router.post("/build")
async def build_report(
    body: ReportBuildRequest,
    db:   AsyncSession = Depends(get_db),
    _:    User         = Depends(require_hr_admin),
):
    if not body.cycle_ids:
        raise HTTPException(400, "At least one cycle_id is required")
    if not body.columns:
        raise HTTPException(400, "At least one column is required")

    # Load reference data
    depts_result = await db.execute(select(Department))
    dept_map = {d.id: d.name for d in depts_result.scalars().all()}

    cycles_result = await db.execute(
        select(PerformanceCycle).where(PerformanceCycle.id.in_(body.cycle_ids))
    )
    cycle_map = {c.id: c for c in cycles_result.scalars().all()}
    if not cycle_map:
        raise HTTPException(404, "No matching cycles found")

    scales_result = await db.execute(
        select(RatingScale).where(RatingScale.cycle_id.in_(body.cycle_ids))
    )
    scales_by_cycle: dict = defaultdict(dict)
    for s in scales_result.scalars().all():
        scales_by_cycle[s.cycle_id][float(s.score)] = s.label

    # Apply scope
    users = await _apply_scope(db, body.scope)
    if not users:
        return []

    user_id_list = [u.id for u in users]

    # Load all active users for manager name resolution
    all_users_res = await db.execute(select(User).where(User.is_active == True))
    all_user_map = {u.id: u for u in all_users_res.scalars().all()}

    # Load KPIs for selected cycles and scoped users
    kpis_result = await db.execute(
        select(Kpi).where(
            Kpi.cycle_id.in_(body.cycle_ids),
            Kpi.user_id.in_(user_id_list),
        )
    )
    kpis_by_uc: dict = defaultdict(list)
    for kpi in kpis_result.scalars().all():
        kpis_by_uc[(kpi.user_id, kpi.cycle_id)].append(kpi)

    cols = set(body.columns)

    def _demo(u: User) -> dict:
        return {
            'employee_id':    u.employee_id,
            'full_name':      u.full_name,
            'email':          u.email,
            'department':     dept_map.get(u.department_id, ''),
            'division':       u.division or '',
            'section':        u.section or '',
            'position_title': u.position_title or '',
            'job_grade':      u.job_grade or '',
            'category':       u.category or '',
            'employee_type':  u.employee_type or '',
            'country':        u.country or '',
            'work_location':  u.work_location or '',
            'hire_date':      str(u.hire_date) if u.hire_date else '',
            'gender':         u.gender or '',
        }

    def _reporting(u: User) -> dict:
        def _name(uid):
            if uid and uid in all_user_map:
                return all_user_map[uid].full_name
            return ''
        return {
            'direct_manager':    _name(u.direct_manager_id),
            'reviewing_manager': _name(u.reviewing_manager_id),
            'hod':               _name(u.hod_id),
        }

    def _scorecard(kpis: list, cycle: PerformanceCycle) -> dict:
        status    = _derive_status(kpis)
        is_late   = any(k.is_late for k in kpis)
        kpi_count = len(kpis)

        self_total = None
        if any(k.self_rating is not None for k in kpis):
            self_total = sum(
                (float(k.weight) / 100.0) * float(k.self_rating)
                for k in kpis if k.self_rating is not None
            )

        mgr_total = None
        if any(k.mgr_score is not None for k in kpis):
            mgr_total = sum(
                (float(k.weight) / 100.0) * float(k.mgr_score)
                for k in kpis if k.mgr_score is not None
            )

        dim = {v: 0 for v in _DIMENSION_KEYS.values()}
        for k in kpis:
            key = _DIMENSION_KEYS.get(k.kpi_dimension)
            if key:
                dim[key] += k.weight

        return {
            'cycle_name':          cycle.name,
            'cycle_year':          cycle.year,
            'scorecard_status':    status,
            'is_late':             is_late,
            'kpi_count':           kpi_count,
            'self_rating_overall': round(self_total, 4) if self_total is not None else None,
            'mgr_rating_overall':  round(mgr_total, 4) if mgr_total is not None else None,
            'fin_weight':          dim['fin_weight'],
            'cust_weight':         dim['cust_weight'],
            'ip_weight':           dim['ip_weight'],
            'lg_weight':           dim['lg_weight'],
            'lc_weight':           dim['lc_weight'],
        }

    def _rating_label(cycle_id, score) -> str:
        if score is None:
            return ''
        return scales_by_cycle[cycle_id].get(float(score), str(score))

    def _kpi_detail(kpi: Kpi) -> dict:
        rt = kpi.rating_targets or []
        def _tgt(n: int) -> str:
            # Primary: find entry where value == n
            if isinstance(rt, list):
                for t in rt:
                    if isinstance(t, dict):
                        try:
                            if int(t.get('value', -1)) == n:
                                label  = str(t.get('label',  '') or '')
                                target = str(t.get('target', '') or t.get('description', '') or '')
                                if label and target:
                                    return f"{label}: {target}"
                                return label or target
                        except (ValueError, TypeError):
                            pass
                # Fallback: positional access (0-indexed)
                idx = n - 1
                if len(rt) > idx:
                    t = rt[idx]
                    if isinstance(t, dict):
                        label  = str(t.get('label',  '') or '')
                        target = str(t.get('target', '') or t.get('description', '') or '')
                        if label and target:
                            return f"{label}: {target}"
                        return label or target
                    return str(t)
            return ''
        return {
            'kpi_name':        kpi.name,
            'kpi_dimension':   kpi.kpi_dimension or '',
            'kpi_weight':      kpi.weight,
            'kpi_measurement': kpi.measurement or '',
            'kpi_type':        kpi.kpi_type or '',
            'rating_target_1': _tgt(1),
            'rating_target_2': _tgt(2),
            'rating_target_3': _tgt(3),
            'rating_target_4': _tgt(4),
            'rating_target_5': _tgt(5),
        }

    def _kpi_score(kpi: Kpi) -> dict:
        weighted = None
        if kpi.mgr_score is not None:
            weighted = round((float(kpi.weight) / 100.0) * float(kpi.mgr_score), 4)
        return {
            'kpi_self_rating':           float(kpi.self_rating) if kpi.self_rating is not None else None,
            'kpi_self_rating_label':     _rating_label(kpi.cycle_id, kpi.self_rating),
            'kpi_mgr_rating':            float(kpi.mgr_score) if kpi.mgr_score is not None else None,
            'kpi_mgr_rating_label':      _rating_label(kpi.cycle_id, kpi.mgr_score),
            'kpi_weighted_contribution': weighted,
            'kpi_actual_achievement':    kpi.actual_achievement or '',
            'kpi_self_remarks':          kpi.self_remarks or '',
            'kpi_mgr_comment':           kpi.mgr_comment or '',
            'kpi_status':                kpi.status or '',
            'kpi_is_late':               kpi.is_late or False,
        }

    def _filter(row: dict) -> dict:
        return {k: v for k, v in row.items() if k in cols}

    rows = []

    if body.kpi_breakdown_mode:
        for user in users:
            demo = _demo(user)
            rep  = _reporting(user)
            for cycle_id in body.cycle_ids:
                cycle = cycle_map.get(cycle_id)
                if not cycle:
                    continue
                kpis = kpis_by_uc.get((user.id, cycle_id), [])
                sc   = _scorecard(kpis, cycle)
                if kpis:
                    for kpi in kpis:
                        rows.append(_filter({**demo, **rep, **sc, **_kpi_detail(kpi), **_kpi_score(kpi)}))
                else:
                    empty = {c: '' for c in KPI_DETAIL_COLUMNS + KPI_SCORE_COLUMNS}
                    rows.append(_filter({**demo, **rep, **sc, **empty}))
    else:
        for user in users:
            demo = _demo(user)
            rep  = _reporting(user)
            for cycle_id in body.cycle_ids:
                cycle = cycle_map.get(cycle_id)
                if not cycle:
                    continue
                kpis = kpis_by_uc.get((user.id, cycle_id), [])
                sc   = _scorecard(kpis, cycle)
                rows.append(_filter({**demo, **rep, **sc}))

    return rows
