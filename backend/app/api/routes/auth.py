"""
Auth routes: login, refresh, me
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, or_, text
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional, Any, Dict

from app.db.session import get_db
from app.core.security import (
    verify_password, create_access_token, create_refresh_token, get_current_user
)
from app.models.user import User, UserRole, CustomRole, RolePermission

router = APIRouter()
log = logging.getLogger("auth")


class UserOut(BaseModel):
    id:             str
    full_name:      str
    email:          str
    role:           str
    derived_roles:  List[str]
    permissions:    List[str]


class TokenOut(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    user:          Optional[Dict[str, Any]] = None


async def _resolve_permissions_and_derived(db: AsyncSession, user: User):
    # Get permissions from explicitly assigned roles
    raw = await db.execute(text("""
        SELECT rp.permission
        FROM user_roles ur
        JOIN role_permissions rp ON rp.role_id = ur.role_id
        WHERE ur.user_id = :user_id
    """), {"user_id": str(user.id)})
    explicit_permissions = {row[0] for row in raw.all()}

    # Count direct reports to derive MANAGER role
    direct_result = await db.execute(text("""
        SELECT COUNT(*) FROM users
        WHERE is_active = true
        AND (direct_manager_id = :uid OR reviewing_manager_id = :uid)
    """), {"uid": str(user.id)})
    direct_count = direct_result.scalar() or 0

    # Count HOD reports
    hod_result = await db.execute(text("""
        SELECT COUNT(*) FROM users
        WHERE is_active = true AND hod_id = :uid
    """), {"uid": str(user.id)})
    hod_count = hod_result.scalar() or 0

    derived_roles: List[str] = []
    derived_permissions = set()

    if direct_count > 0:
        derived_roles.append("MANAGER")
        mgr_perms = await db.execute(text("""
            SELECT rp.permission
            FROM custom_roles cr
            JOIN role_permissions rp ON rp.role_id = cr.id
            WHERE cr.name = 'MANAGER'
        """))
        derived_permissions.update(row[0] for row in mgr_perms.all())

    if hod_count > 0:
        derived_roles.append("HOD")
        hod_perms = await db.execute(text("""
            SELECT rp.permission
            FROM custom_roles cr
            JOIN role_permissions rp ON rp.role_id = cr.id
            WHERE cr.name = 'HOD'
        """))
        derived_permissions.update(row[0] for row in hod_perms.all())

    # Merge explicit + derived permissions
    all_permissions = sorted(explicit_permissions | derived_permissions)

    return all_permissions, derived_roles


@router.post("/login", response_model=TokenOut)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db:   AsyncSession              = Depends(get_db),
):
    log.info("=== LOGIN CALLED for: %s ===", form.username if form else "unknown")
    typed = (form.username or "").strip()
    typed_lower = typed.lower()

    result = await db.execute(
        select(User).where(func.lower(User.email) == typed_lower)
    )
    user = result.scalar_one_or_none()

    if not user:
        log.warning("LOGIN FAIL: no user matching email=%r (case-insensitive)", typed)
        raise HTTPException(401, "Invalid credentials")

    log.info(
        "LOGIN attempt: typed=%r stored_email=%r employee_id=%r is_active=%s",
        typed, user.email, user.employee_id, user.is_active,
    )

    if not user.is_active:
        log.warning("LOGIN FAIL: user %r is inactive", user.email)
        raise HTTPException(401, "Invalid credentials")

    if not verify_password(form.password, user.hashed_password):
        log.warning("LOGIN FAIL: bad password for %r", user.email)
        raise HTTPException(401, "Invalid credentials")

    await db.execute(update(User).where(User.id == user.id).values(last_login=datetime.utcnow()))

    permissions, derived_roles = await _resolve_permissions_and_derived(db, user)

    from app.services.reminder_service import maybe_run_reminders
    try:
        await maybe_run_reminders(db)
    except Exception as e:
        print(f"Reminder check error during login: {e}")

    return TokenOut(
        access_token  = create_access_token({"sub": str(user.id), "role": user.role}),
        refresh_token = create_refresh_token({"sub": str(user.id)}),
        user = {
            "id":            str(user.id),
            "full_name":     user.full_name,
            "email":         user.email,
            "role":          user.role,
            "derived_roles": derived_roles,
            "permissions":   permissions,
        },
    )


@router.get("/me")
async def me(
    current_user: User         = Depends(get_current_user),
    db:           AsyncSession = Depends(get_db),
):
    permissions, derived_roles = await _resolve_permissions_and_derived(db, current_user)
    return {
        "id":            str(current_user.id),
        "employee_id":   current_user.employee_id,
        "email":         current_user.email,
        "full_name":     current_user.full_name,
        "role":          current_user.role,
        "job_grade":     current_user.job_grade,
        "department_id": str(current_user.department_id) if current_user.department_id else None,
        "manager_id":    str(current_user.manager_id) if current_user.manager_id else None,
        "derived_roles": derived_roles,
        "permissions":   permissions,
    }

