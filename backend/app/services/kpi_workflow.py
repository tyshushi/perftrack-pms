"""
KPI Workflow Service
Approval chain based on assigned managers per employee:
Direct Manager → Reviewing Manager → HOD
Duplicate managers are skipped automatically.
"""
from uuid import UUID
from typing import Optional
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException

from app.models.user import (
    Kpi, KpiAuditLog, Scorecard, IncrementBand,
    WeightRule, User, Notification
)

# KPI status constants
DRAFT        = "DRAFT"
PENDING_DM   = "PENDING_DM"    # pending direct manager
PENDING_RM   = "PENDING_RM"    # pending reviewing manager
PENDING_HOD  = "PENDING_HOD"
APPROVED     = "APPROVED"
REJECTED     = "REJECTED"
LOCKED       = "LOCKED"


class KpiWorkflowService:

    def __init__(self, db: AsyncSession):
        self.db = db

    async def submit_kpi(self, kpi_id: UUID, actor: User) -> Kpi:
        kpi = await self._get_kpi(kpi_id)
        if str(kpi.user_id) != str(actor.id):
            raise HTTPException(403, "You can only submit your own KPIs")
        if kpi.status != DRAFT:
            raise HTTPException(400, f"KPI is already submitted (status: {kpi.status})")

        await self._validate_weight(kpi, actor)

        # Determine first approver
        next_status = await self._first_pending_status(actor)
        await self._transition(kpi, actor, next_status)
        await self._notify_next_approver(kpi, actor, next_status)
        return kpi

    async def evaluate_kpi(
        self, kpi_id: UUID, actor: User,
        score: Decimal, comment: str, action: str
    ) -> Kpi:
        kpi = await self._get_kpi(kpi_id)

        # Get the KPI owner
        owner = await self._get_user(kpi.user_id)
        if not owner:
            raise HTTPException(404, "KPI owner not found")

        # Check actor is authorised for current status
        await self._assert_can_act(kpi, actor, owner)

        # Store score and comment in correct field
        score_field, comment_field = self._score_fields(kpi.status, owner, actor)
        if score_field:
            setattr(kpi, score_field, score)
        if comment_field:
            setattr(kpi, comment_field, comment)

        if action == "approve":
            next_status = await self._next_status(kpi.status, owner)
            await self._transition(kpi, actor, next_status, comment=comment, score=score)
            if next_status == APPROVED:
                await self._notify(owner.id, "KPI Approved", f"Your KPI '{kpi.name}' has been fully approved.", "KPI_APPROVED", kpi.id)
            else:
                await self._notify_next_approver(kpi, owner, next_status)
        else:
            await self._transition(kpi, actor, REJECTED, comment=comment, score=score)
            await self._notify(owner.id, "KPI Rejected",
                f"Your KPI '{kpi.name}' was rejected by {actor.full_name}. Please revise and resubmit.",
                "KPI_REJECTED", kpi.id)
        return kpi

    async def self_evaluate(self, kpi_id: UUID, actor: User, score: Decimal, comment: str) -> Kpi:
        kpi = await self._get_kpi(kpi_id)
        if str(kpi.user_id) != str(actor.id):
            raise HTTPException(403, "Cannot evaluate another person's KPI")
        if kpi.status == LOCKED:
            raise HTTPException(400, "Scorecard is locked")
        kpi.self_score   = score
        kpi.self_comment = comment
        await self.db.flush()
        return kpi

    async def lock_kpi(self, kpi_id: UUID, actor: User) -> Kpi:
        kpi = await self._get_kpi(kpi_id)
        if actor.role not in ["HR_ADMIN", "SUPER_ADMIN"]:
            raise HTTPException(403, "Only HR Admin can lock KPIs")
        if kpi.status != APPROVED:
            raise HTTPException(400, "Only APPROVED KPIs can be locked")
        kpi.final_score = self._compute_final_score(kpi)
        await self._transition(kpi, actor, LOCKED)
        return kpi

    # ── Scorecard ─────────────────────────────────────────────────────────

    async def recalculate_scorecard(self, cycle_id: UUID, user_id: UUID) -> Scorecard:
        result = await self.db.execute(
            select(Kpi).where(Kpi.cycle_id == cycle_id, Kpi.user_id == user_id)
        )
        kpis = result.scalars().all()
        if not kpis:
            raise HTTPException(404, "No KPIs found")

        def weighted_avg(attr):
            scored = [k for k in kpis if getattr(k, attr) is not None]
            if not scored: return None
            w = sum(k.weight for k in scored)
            return sum(getattr(k, attr) * k.weight for k in scored) / w if w else None

        self_total = weighted_avg("self_score")
        dm_total   = weighted_avg("mgr_score")
        rm_total   = weighted_avg("mgr2_score")
        hod_total  = weighted_avg("hod_score")

        evaluator_scores = [s for s in [dm_total, rm_total, hod_total] if s is not None]
        final_score = sum(evaluator_scores) / len(evaluator_scores) if evaluator_scores else self_total

        res = await self.db.execute(
            select(Scorecard).where(Scorecard.cycle_id == cycle_id, Scorecard.user_id == user_id)
        )
        sc = res.scalar_one_or_none()
        if not sc:
            sc = Scorecard(cycle_id=cycle_id, user_id=user_id)
            self.db.add(sc)

        sc.self_total  = round(self_total,  2) if self_total  else None
        sc.mgr_total   = round(dm_total,    2) if dm_total    else None
        sc.mgr2_total  = round(rm_total,    2) if rm_total    else None
        sc.hod_total   = round(hod_total,   2) if hod_total   else None
        sc.final_score = round(final_score, 2) if final_score else None
        await self.db.flush()
        return sc

    async def apply_increment(self, scorecard: Scorecard, cycle_id: UUID) -> Scorecard:
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
            scorecard.increment_pct    = band.increment_pct
            scorecard.performance_band = band.band_name
            scorecard.increment_status = "FLAGGED"
        await self.db.flush()
        return scorecard

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _get_kpi(self, kpi_id: UUID) -> Kpi:
        result = await self.db.execute(select(Kpi).where(Kpi.id == kpi_id))
        kpi = result.scalar_one_or_none()
        if not kpi:
            raise HTTPException(404, "KPI not found")
        return kpi

    async def _get_user(self, user_id: UUID) -> Optional[User]:
        result = await self.db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def _first_pending_status(self, owner: User) -> str:
        """Determine first approval step for this employee."""
        if owner.direct_manager_id:
            return PENDING_DM
        if owner.reviewing_manager_id:
            return PENDING_RM
        if owner.hod_id:
            return PENDING_HOD
        return APPROVED  # no managers assigned — auto approve

    async def _next_status(self, current: str, owner: User) -> str:
        """Determine next status, skipping duplicate managers."""
        dm_id  = str(owner.direct_manager_id)  if owner.direct_manager_id  else None
        rm_id  = str(owner.reviewing_manager_id) if owner.reviewing_manager_id else None
        hod_id = str(owner.hod_id)             if owner.hod_id             else None

        if current == PENDING_DM:
            # Go to RM if different from DM and exists
            if rm_id and rm_id != dm_id:
                return PENDING_RM
            # Otherwise go to HOD if different
            if hod_id and hod_id != dm_id:
                return PENDING_HOD
            return APPROVED

        if current == PENDING_RM:
            if hod_id and hod_id != rm_id:
                return PENDING_HOD
            return APPROVED

        if current == PENDING_HOD:
            return APPROVED

        return APPROVED

    async def _assert_can_act(self, kpi: Kpi, actor: User, owner: User):
        """Check that actor is the correct approver for current status."""
        actor_id = str(actor.id)
        hr_roles = ["HR_ADMIN", "SUPER_ADMIN"]

        if actor.role in hr_roles:
            return  # HR can always act

        allowed = False
        if kpi.status == PENDING_DM  and str(owner.direct_manager_id)    == actor_id: allowed = True
        if kpi.status == PENDING_RM  and str(owner.reviewing_manager_id)  == actor_id: allowed = True
        if kpi.status == PENDING_HOD and str(owner.hod_id)                == actor_id: allowed = True

        if not allowed:
            raise HTTPException(403, f"You are not the assigned approver for this KPI at stage {kpi.status}")

    def _score_fields(self, status: str, owner: User, actor: User):
        """Return (score_field, comment_field) based on who is acting."""
        if status == PENDING_DM:  return "mgr_score",  "mgr_comment"
        if status == PENDING_RM:  return "mgr2_score", "mgr2_comment"
        if status == PENDING_HOD: return "hod_score",  "hod_comment"
        return None, None

    async def _transition(self, kpi: Kpi, actor: User, new_status: str,
                          comment: str = None, score: Decimal = None):
        old = kpi.status
        kpi.status = new_status
        log = KpiAuditLog(
            kpi_id=kpi.id, actor_id=actor.id,
            from_status=old, to_status=new_status,
            comment=comment, score_given=score,
        )
        self.db.add(log)
        await self.db.flush()

    def _compute_final_score(self, kpi: Kpi) -> Optional[Decimal]:
        scores = [s for s in [kpi.mgr_score, kpi.mgr2_score, kpi.hod_score] if s is not None]
        return round(sum(scores) / len(scores), 1) if scores else kpi.self_score

    async def _notify(self, user_id: UUID, title: str, body: str, type_: str, ref_id: UUID):
        n = Notification(user_id=user_id, title=title, body=body, type=type_, reference_id=ref_id)
        self.db.add(n)

    async def _notify_next_approver(self, kpi: Kpi, owner: User, next_status: str):
        target_id = None
        if next_status == PENDING_DM:  target_id = owner.direct_manager_id
        if next_status == PENDING_RM:  target_id = owner.reviewing_manager_id
        if next_status == PENDING_HOD: target_id = owner.hod_id
        if target_id:
            await self._notify(target_id,
                "KPI Pending Your Approval",
                f"{owner.full_name} has submitted a KPI for your review: {kpi.name}",
                "KPI_PENDING", kpi.id)

    async def _validate_weight(self, kpi: Kpi, user: User):
        result = await self.db.execute(
            select(WeightRule).where(
                WeightRule.cycle_id == kpi.cycle_id,
                WeightRule.category == kpi.category,
            ).where(
                (WeightRule.department_id == user.department_id) |
                (WeightRule.department_id == None)
            ).order_by(WeightRule.department_id.desc().nulls_last())
        )
        rule = result.scalar_one_or_none()
        if not rule:
            return
        if rule.fixed_weight is not None and kpi.weight != rule.fixed_weight:
            raise HTTPException(400, f"Weight for '{kpi.category}' must be exactly {rule.fixed_weight}%")
        if kpi.weight < rule.min_weight or kpi.weight > rule.max_weight:
            raise HTTPException(400, f"Weight for '{kpi.category}' must be between {rule.min_weight}% and {rule.max_weight}%")
