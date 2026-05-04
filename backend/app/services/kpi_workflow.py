"""
KPI Workflow Service
Implements the Finite State Machine for KPI approval across up to 4 levels.
Also handles weight validation, scoring, and scorecard aggregation.
"""
from uuid import UUID
from typing import Optional
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from fastapi import HTTPException, status

from app.models.user import (
    Kpi, KpiStatus, KpiAuditLog, Scorecard, IncrementBand,
    WeightRule, User, PerformanceCycle, Notification
)


# ── State Machine ──────────────────────────────────────────────────────────

# Allowed transitions: (from_status, actor_role) -> to_status
TRANSITIONS = {
    (KpiStatus.DRAFT,        "STAFF"):       KpiStatus.PENDING_MGR,
    (KpiStatus.PENDING_MGR,  "MANAGER"):     KpiStatus.PENDING_MGR2,
    (KpiStatus.PENDING_MGR,  "MANAGER"):     KpiStatus.REJECTED,      # override below
    (KpiStatus.PENDING_MGR2, "MGR2"):        KpiStatus.PENDING_HOD,
    (KpiStatus.PENDING_MGR2, "MGR2"):        KpiStatus.REJECTED,
    (KpiStatus.PENDING_HOD,  "HOD"):         KpiStatus.APPROVED,
    (KpiStatus.PENDING_HOD,  "HOD"):         KpiStatus.REJECTED,
    # HR Admin can force-approve at any stage
    (KpiStatus.PENDING_MGR,  "HR_ADMIN"):    KpiStatus.APPROVED,
    (KpiStatus.PENDING_MGR2, "HR_ADMIN"):    KpiStatus.APPROVED,
    (KpiStatus.PENDING_HOD,  "HR_ADMIN"):    KpiStatus.APPROVED,
}

# Roles that can approve at each pending stage
APPROVER_ROLES = {
    KpiStatus.PENDING_MGR:  ["MANAGER", "HR_ADMIN", "SUPER_ADMIN"],
    KpiStatus.PENDING_MGR2: ["MGR2", "HR_ADMIN", "SUPER_ADMIN"],
    KpiStatus.PENDING_HOD:  ["HOD", "HR_ADMIN", "SUPER_ADMIN"],
}

# Score fields per role
SCORE_FIELD = {
    "MANAGER": "mgr_score",
    "MGR2":    "mgr2_score",
    "HOD":     "hod_score",
}
COMMENT_FIELD = {
    "MANAGER": "mgr_comment",
    "MGR2":    "mgr2_comment",
    "HOD":     "hod_comment",
}


class KpiWorkflowService:

    def __init__(self, db: AsyncSession):
        self.db = db

    async def submit_kpi(self, kpi_id: UUID, actor: User) -> Kpi:
        """Staff submits a DRAFT KPI for manager review."""
        kpi = await self._get_kpi(kpi_id)
        if kpi.user_id != actor.id:
            raise HTTPException(403, "You can only submit your own KPIs")
        if kpi.status != KpiStatus.DRAFT:
            raise HTTPException(400, f"KPI is already in status: {kpi.status}")

        await self._validate_weight(kpi, actor)
        await self._transition(kpi, actor, KpiStatus.PENDING_MGR)
        await self._notify_manager(kpi, actor)
        return kpi

    async def evaluate_kpi(
        self,
        kpi_id: UUID,
        actor: User,
        score: Decimal,
        comment: str,
        action: str,  # "approve" or "reject"
    ) -> Kpi:
        """Manager/MGR2/HOD scores and approves or rejects a KPI."""
        kpi = await self._get_kpi(kpi_id)
        allowed = APPROVER_ROLES.get(kpi.status, [])
        if actor.role not in allowed:
            raise HTTPException(403, f"Your role cannot act on KPIs in status {kpi.status}")

        # Set score and comment
        score_field   = SCORE_FIELD.get(actor.role)
        comment_field = COMMENT_FIELD.get(actor.role)
        if score_field:
            setattr(kpi, score_field, score)
        if comment_field:
            setattr(kpi, comment_field, comment)

        # Determine next status
        if action == "approve":
            next_status = self._next_approval_status(kpi.status, actor.role)
        else:
            next_status = KpiStatus.REJECTED

        await self._transition(kpi, actor, next_status, comment=comment, score=score)

        if next_status == KpiStatus.APPROVED:
            await self._notify_staff_approved(kpi)
        elif next_status == KpiStatus.REJECTED:
            await self._notify_staff_rejected(kpi, actor)

        return kpi

    async def self_evaluate(
        self, kpi_id: UUID, actor: User, score: Decimal, comment: str
    ) -> Kpi:
        """Staff submits self-evaluation score."""
        kpi = await self._get_kpi(kpi_id)
        if kpi.user_id != actor.id:
            raise HTTPException(403, "Cannot evaluate another person's KPI")
        if kpi.status == KpiStatus.LOCKED:
            raise HTTPException(400, "Scorecard is locked")
        kpi.self_score   = score
        kpi.self_comment = comment
        await self.db.flush()
        return kpi

    async def lock_kpi(self, kpi_id: UUID, actor: User) -> Kpi:
        """HR Admin locks an approved KPI."""
        kpi = await self._get_kpi(kpi_id)
        if actor.role not in ["HR_ADMIN", "SUPER_ADMIN"]:
            raise HTTPException(403, "Only HR Admin can lock KPIs")
        if kpi.status != KpiStatus.APPROVED:
            raise HTTPException(400, "Only APPROVED KPIs can be locked")
        kpi.final_score = self._compute_final_score(kpi)
        await self._transition(kpi, actor, KpiStatus.LOCKED)
        return kpi

    # ── Scorecard Aggregation ────────────────────────────────────────────

    async def recalculate_scorecard(self, cycle_id: UUID, user_id: UUID) -> Scorecard:
        """Recompute weighted totals and fetch or create scorecard row."""
        result = await self.db.execute(
            select(Kpi).where(
                Kpi.cycle_id == cycle_id,
                Kpi.user_id  == user_id,
            )
        )
        kpis = result.scalars().all()
        if not kpis:
            raise HTTPException(404, "No KPIs found for this user in this cycle")

        total_weight = sum(k.weight for k in kpis)

        def weighted_avg(score_attr):
            scored = [k for k in kpis if getattr(k, score_attr) is not None]
            if not scored:
                return None
            w = sum(k.weight for k in scored)
            return sum(getattr(k, score_attr) * k.weight for k in scored) / w if w else None

        self_total  = weighted_avg("self_score")
        mgr_total   = weighted_avg("mgr_score")
        mgr2_total  = weighted_avg("mgr2_score")
        hod_total   = weighted_avg("hod_score")

        # Final score: average of available evaluator scores (excluding self)
        evaluator_scores = [s for s in [mgr_total, mgr2_total, hod_total] if s is not None]
        final_score = sum(evaluator_scores) / len(evaluator_scores) if evaluator_scores else self_total

        # Fetch or create scorecard
        res = await self.db.execute(
            select(Scorecard).where(Scorecard.cycle_id == cycle_id, Scorecard.user_id == user_id)
        )
        sc = res.scalar_one_or_none()
        if not sc:
            sc = Scorecard(cycle_id=cycle_id, user_id=user_id)
            self.db.add(sc)

        sc.self_total  = round(self_total,  2) if self_total  else None
        sc.mgr_total   = round(mgr_total,   2) if mgr_total   else None
        sc.mgr2_total  = round(mgr2_total,  2) if mgr2_total  else None
        sc.hod_total   = round(hod_total,   2) if hod_total   else None
        sc.final_score = round(final_score, 2) if final_score else None

        await self.db.flush()
        return sc

    async def apply_increment(self, scorecard: Scorecard, cycle_id: UUID) -> Scorecard:
        """Look up increment band and set increment_pct on scorecard."""
        if scorecard.final_score is None:
            return scorecard

        result = await self.db.execute(
            select(IncrementBand).where(
                IncrementBand.cycle_id  == cycle_id,
                IncrementBand.min_score <= scorecard.final_score,
                IncrementBand.max_score >= scorecard.final_score,
            )
        )
        band = result.scalar_one_or_none()
        if band:
            scorecard.increment_pct      = band.increment_pct
            scorecard.performance_band   = band.band_name
            scorecard.increment_status   = "FLAGGED"
        await self.db.flush()
        return scorecard

    # ── Weight Validation ────────────────────────────────────────────────

    async def _validate_weight(self, kpi: Kpi, user: User):
        """Ensure KPI weight conforms to WeightRule for this user's dept/grade."""
        result = await self.db.execute(
            select(WeightRule).where(
                WeightRule.cycle_id  == kpi.cycle_id,
                WeightRule.category  == kpi.category,
            ).where(
                (WeightRule.department_id == user.department_id) |
                (WeightRule.department_id == None)
            ).where(
                (WeightRule.job_grade == user.job_grade) |
                (WeightRule.job_grade == None)
            ).order_by(WeightRule.department_id.desc().nulls_last())
        )
        rule = result.scalar_one_or_none()
        if not rule:
            return  # No rule defined — allow

        if rule.fixed_weight is not None and kpi.weight != rule.fixed_weight:
            raise HTTPException(
                400,
                f"Weight for '{kpi.category}' must be exactly {rule.fixed_weight}% for your role/department"
            )
        if kpi.weight < rule.min_weight or kpi.weight > rule.max_weight:
            raise HTTPException(
                400,
                f"Weight for '{kpi.category}' must be between {rule.min_weight}% and {rule.max_weight}%"
            )

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _get_kpi(self, kpi_id: UUID) -> Kpi:
        result = await self.db.execute(select(Kpi).where(Kpi.id == kpi_id))
        kpi = result.scalar_one_or_none()
        if not kpi:
            raise HTTPException(404, "KPI not found")
        return kpi

    async def _transition(
        self, kpi: Kpi, actor: User, new_status: KpiStatus,
        comment: str = None, score: Decimal = None
    ):
        old_status  = kpi.status
        kpi.status  = new_status
        log = KpiAuditLog(
            kpi_id      = kpi.id,
            actor_id    = actor.id,
            from_status = old_status,
            to_status   = new_status,
            comment     = comment,
            score_given = score,
        )
        self.db.add(log)
        await self.db.flush()

    def _next_approval_status(self, current: KpiStatus, role: str) -> KpiStatus:
        mapping = {
            KpiStatus.PENDING_MGR:  KpiStatus.PENDING_MGR2,
            KpiStatus.PENDING_MGR2: KpiStatus.PENDING_HOD,
            KpiStatus.PENDING_HOD:  KpiStatus.APPROVED,
        }
        # HR Admin skips straight to APPROVED
        if role in ["HR_ADMIN", "SUPER_ADMIN"]:
            return KpiStatus.APPROVED
        return mapping.get(current, KpiStatus.APPROVED)

    def _compute_final_score(self, kpi: Kpi) -> Optional[Decimal]:
        scores = [s for s in [kpi.mgr_score, kpi.mgr2_score, kpi.hod_score] if s is not None]
        return round(sum(scores) / len(scores), 1) if scores else kpi.self_score

    async def _notify(self, user_id: UUID, title: str, body: str, notif_type: str, ref_id: UUID):
        n = Notification(user_id=user_id, title=title, body=body, type=notif_type, reference_id=ref_id)
        self.db.add(n)

    async def _notify_manager(self, kpi: Kpi, submitter: User):
        if submitter.manager_id:
            await self._notify(
                submitter.manager_id,
                "KPI Pending Your Review",
                f"{submitter.full_name} has submitted a KPI for your review: {kpi.name}",
                "KPI_PENDING",
                kpi.id,
            )

    async def _notify_staff_approved(self, kpi: Kpi):
        await self._notify(
            kpi.user_id,
            "KPI Fully Approved",
            f"Your KPI '{kpi.name}' has been approved.",
            "KPI_APPROVED",
            kpi.id,
        )

    async def _notify_staff_rejected(self, kpi: Kpi, actor: User):
        await self._notify(
            kpi.user_id,
            "KPI Rejected",
            f"Your KPI '{kpi.name}' was rejected by {actor.full_name}. Please revise and resubmit.",
            "KPI_REJECTED",
            kpi.id,
        )
