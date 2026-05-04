"""
Bell Curve & Increment Service
Ranks all employees within a department by final_score,
maps to performance bands, and assigns increment percentages.
"""
from uuid import UUID
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.user import (
    Scorecard, IncrementBand, BellCurveTarget,
    User, Notification, IncrementStatus
)


class BellCurveService:

    def __init__(self, db: AsyncSession):
        self.db = db

    async def run_for_cycle(self, cycle_id: UUID) -> dict:
        """
        Full bell curve run for a cycle:
        1. Fetch all finalised scorecards
        2. Rank within department
        3. Assign performance band based on percentile vs. BellCurveTarget
        4. Assign increment_pct from IncrementBand
        5. Return summary stats
        """
        # Fetch all scorecards for this cycle with user info
        result = await self.db.execute(
            select(Scorecard, User)
            .join(User, User.id == Scorecard.user_id)
            .where(Scorecard.cycle_id == cycle_id)
            .where(Scorecard.final_score != None)
            .order_by(User.department_id, Scorecard.final_score.desc())
        )
        rows = result.all()
        if not rows:
            return {"message": "No scorecards to process", "count": 0}

        # Fetch increment bands
        ib_result = await self.db.execute(
            select(IncrementBand).where(IncrementBand.cycle_id == cycle_id)
            .order_by(IncrementBand.min_score.desc())
        )
        bands = ib_result.scalars().all()

        # Fetch bell curve targets (dept-specific or org-wide)
        bt_result = await self.db.execute(
            select(BellCurveTarget).where(BellCurveTarget.cycle_id == cycle_id)
        )
        targets = bt_result.scalars().all()

        # Group by department
        dept_groups: dict[UUID, list] = {}
        for sc, user in rows:
            dept = user.department_id or "global"
            dept_groups.setdefault(dept, []).append((sc, user))

        updated = 0
        for dept_id, members in dept_groups.items():
            n = len(members)
            # Sorted descending by final_score (already sorted from query)
            dept_targets = [t for t in targets if t.department_id == dept_id] or \
                           [t for t in targets if t.department_id is None]

            for rank_0, (sc, user) in enumerate(members):
                rank        = rank_0 + 1
                percentile  = round((n - rank_0) / n * 100, 2)
                sc.band_rank  = rank
                sc.percentile = percentile

                # Assign band from percentile-based targets
                band_name = self._assign_band(percentile, dept_targets)
                sc.performance_band = band_name

                # Assign increment from score-based bands
                sc.increment_pct    = self._assign_increment(sc.final_score, bands)
                sc.increment_status = IncrementStatus.FLAGGED

                updated += 1

        await self.db.flush()
        return {"processed": updated, "departments": len(dept_groups)}

    def _assign_band(self, percentile: float, targets: list) -> str:
        """
        Map a percentile to a performance band using cumulative targets.
        Targets are sorted top-down, e.g.:
          Outstanding  10%  -> top 10th percentile
          Exceeds      20%  -> next 20%
          Meets        50%  -> next 50%
          etc.
        """
        if not targets:
            return "Meets Expectations"

        # Sort targets highest-band first (assume bands are ordered by prestige)
        # We'll work cumulative from the top
        sorted_targets = sorted(targets, key=lambda t: t.target_pct)
        cumulative = 0.0
        for t in sorted(targets, key=lambda t: -t.target_pct if "out" in t.band_name.lower() else t.target_pct):
            cumulative += float(t.target_pct)
            if percentile >= (100 - cumulative):
                return t.band_name
        return targets[-1].band_name if targets else "Meets Expectations"

    def _assign_increment(self, final_score, bands: list) -> float:
        """Find the increment band for a given final_score."""
        for band in bands:
            if float(band.min_score) <= float(final_score) <= float(band.max_score):
                return float(band.increment_pct)
        return 0.0

    async def confirm_increment(
        self, scorecard_id: UUID, confirmed_by_id: UUID
    ) -> Scorecard:
        """HR Admin confirms the auto-calculated increment."""
        from datetime import datetime
        result = await self.db.execute(
            select(Scorecard).where(Scorecard.id == scorecard_id)
        )
        sc = result.scalar_one_or_none()
        if not sc:
            from fastapi import HTTPException
            raise HTTPException(404, "Scorecard not found")

        sc.increment_status        = IncrementStatus.CONFIRMED
        sc.increment_confirmed_by  = confirmed_by_id
        sc.increment_confirmed_at  = datetime.utcnow()

        # Notify employee
        n = Notification(
            user_id  = sc.user_id,
            title    = "Your Salary Increment Has Been Confirmed",
            body     = f"Your performance increment of {sc.increment_pct}% has been confirmed by HR.",
            type     = "INCREMENT_CONFIRMED",
            reference_id = sc.id,
        )
        self.db.add(n)
        await self.db.flush()
        return sc
