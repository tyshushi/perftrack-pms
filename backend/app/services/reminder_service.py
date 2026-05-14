from datetime import datetime, timedelta, date
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.user import PerformanceCycle, Kpi, User
from app.services.email_service import notify_reminder

CHECK_INTERVAL_MINUTES = 5  # Don't run check more than once every 5 minutes


async def should_run_reminders_today(cycle: PerformanceCycle, today: date) -> bool:
    """Determine if reminders should be sent today for this cycle based on frequency"""
    freq = cycle.reminder_frequency

    if freq == 'NONE' or not freq:
        return False

    # Don't send same-day duplicates
    if cycle.last_reminder_sent_at:
        if cycle.last_reminder_sent_at.date() == today:
            return False

    if freq == 'DAILY':
        return True

    if freq == 'WEEKLY':
        days = cycle.reminder_days_of_week or []
        if days and today.weekday() in days:
            return True
        return False

    if freq == 'TWICE_WEEKLY':
        days = cycle.reminder_days_of_week or []
        return today.weekday() in days

    return False


async def get_pending_actions_for_user(db: AsyncSession, user: User, active_cycles: list) -> list:
    """Compute what's pending for a user across all active cycles"""
    actions = []
    today = date.today()

    for cycle in active_cycles:
        # Skip if no phase windows defined
        if not cycle.kpi_setting_start:
            continue

        # KPI Setting phase - check user has not submitted yet
        if cycle.kpi_setting_start <= today:
            kpi_setting_result = await db.execute(
                select(Kpi).where(
                    Kpi.cycle_id == cycle.id,
                    Kpi.user_id == user.id,
                )
            )
            kpis = kpi_setting_result.scalars().all()

            # Phase window logic
            in_kpi_window = cycle.kpi_setting_end and today <= cycle.kpi_setting_end

            # User hasn't submitted at all (no KPIs or all DRAFT)
            if kpis:
                all_pre_submit = all(k.status in ['DRAFT', 'REJECTED'] for k in kpis)
                if all_pre_submit and in_kpi_window:
                    days_left = (cycle.kpi_setting_end - today).days
                    actions.append({
                        'type': 'kpi_setting',
                        'cycle_name': cycle.name,
                        'days_left': days_left,
                        'kpi_count': len(kpis),
                    })

        # Self Eval phase
        if cycle.self_eval_start and cycle.self_eval_start <= today:
            kpis_for_self = await db.execute(
                select(Kpi).where(
                    Kpi.cycle_id == cycle.id,
                    Kpi.user_id == user.id,
                    Kpi.status == 'LOCKED',
                )
            )
            locked_kpis = kpis_for_self.scalars().all()

            in_self_window = cycle.self_eval_end and today <= cycle.self_eval_end

            if locked_kpis and in_self_window:
                days_left = (cycle.self_eval_end - today).days
                actions.append({
                    'type': 'self_eval',
                    'cycle_name': cycle.name,
                    'days_left': days_left,
                    'kpi_count': len(locked_kpis),
                })

        # Manager Eval phase - check direct reports needing evaluation
        if cycle.mgr_eval_start and cycle.mgr_eval_start <= today:
            in_mgr_window = cycle.mgr_eval_end and today <= cycle.mgr_eval_end

            if in_mgr_window:
                # Find direct reports with SELF_EVALUATED KPIs
                pending_reports_result = await db.execute(text("""
                    SELECT DISTINCT u.id, u.full_name
                    FROM users u
                    JOIN kpis k ON k.user_id = u.id
                    WHERE k.cycle_id = :cycle_id
                      AND k.status = 'SELF_EVALUATED'
                      AND (u.direct_manager_id = :uid OR u.reviewing_manager_id = :uid OR u.hod_id = :uid)
                      AND u.is_active = true
                """), {'cycle_id': str(cycle.id), 'uid': str(user.id)})

                pending = pending_reports_result.all()
                if pending:
                    days_left = (cycle.mgr_eval_end - today).days
                    actions.append({
                        'type': 'mgr_eval',
                        'cycle_name': cycle.name,
                        'days_left': days_left,
                        'employees': [row[1] for row in pending],
                    })

        # Approval pending - check direct reports needing approval
        pending_approval_result = await db.execute(text("""
            SELECT DISTINCT u.id, u.full_name
            FROM users u
            JOIN kpis k ON k.user_id = u.id
            WHERE k.cycle_id = :cycle_id
              AND k.status IN ('PENDING_DM', 'PENDING_RM', 'PENDING_HOD')
              AND (
                (k.status = 'PENDING_DM' AND u.direct_manager_id = :uid)
                OR (k.status = 'PENDING_RM' AND u.reviewing_manager_id = :uid)
                OR (k.status = 'PENDING_HOD' AND u.hod_id = :uid)
              )
              AND u.is_active = true
        """), {'cycle_id': str(cycle.id), 'uid': str(user.id)})

        pending_approval = pending_approval_result.all()
        if pending_approval:
            actions.append({
                'type': 'approval',
                'cycle_name': cycle.name,
                'days_left': None,
                'employee_count': len(pending_approval),
            })

    return actions


async def check_and_send_reminders(db: AsyncSession):
    """
    Lazy evaluation: called from middleware/login.
    Rate-limited to once per 5 minutes globally.
    """
    # Get active cycles
    cycles_result = await db.execute(
        select(PerformanceCycle).where(PerformanceCycle.status == 'ACTIVE')
    )
    active_cycles = cycles_result.scalars().all()

    today = date.today()

    # Find cycles that need reminders today
    cycles_needing_reminder = []
    for cycle in active_cycles:
        if await should_run_reminders_today(cycle, today):
            cycles_needing_reminder.append(cycle)

    if not cycles_needing_reminder:
        return

    # Get all active users
    users_result = await db.execute(
        select(User).where(User.is_active == True)
    )
    users = users_result.scalars().all()

    # For each user, compute pending actions and send reminder if needed
    for user in users:
        if not user.email:
            continue

        actions = await get_pending_actions_for_user(db, user, cycles_needing_reminder)
        if actions:
            try:
                await notify_reminder(db, {
                    'id': user.id,
                    'full_name': user.full_name,
                    'email': user.email,
                }, actions)
            except Exception as e:
                print(f"Reminder failed for {user.email}: {e}")

    # Mark cycles as reminded today
    for cycle in cycles_needing_reminder:
        cycle.last_reminder_sent_at = datetime.now()

    await db.flush()


async def maybe_run_reminders(db: AsyncSession):
    """
    Rate-limited entry point. Called from middleware.
    Only actually runs the check at most once per 5 minutes.
    """
    # Use a simple in-memory check via system_settings
    last_check_result = await db.execute(text("""
        SELECT value FROM system_settings WHERE key = 'last_reminder_check_at'
    """))
    last_check_row = last_check_result.first()

    now = datetime.now()
    if last_check_row and last_check_row[0]:
        try:
            last_check = datetime.fromisoformat(last_check_row[0])
            if (now - last_check).total_seconds() < CHECK_INTERVAL_MINUTES * 60:
                return  # Too soon, skip
        except ValueError:
            pass

    # Update last check time first to prevent race conditions
    await db.execute(text("""
        INSERT INTO system_settings (key, value) VALUES ('last_reminder_check_at', :now)
        ON CONFLICT (key) DO UPDATE SET value = :now
    """), {'now': now.isoformat()})
    await db.flush()

    # Run the check
    try:
        await check_and_send_reminders(db)
    except Exception as e:
        print(f"Reminder check failed: {e}")
