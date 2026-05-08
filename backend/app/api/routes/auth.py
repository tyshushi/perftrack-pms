"""
Auth routes: login, refresh, me
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, or_
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
    perm_result = await db.execute(
        select(RolePermission.permission)
        .join(CustomRole, CustomRole.id == RolePermission.role_id)
        .join(UserRole, UserRole.role_id == CustomRole.id)
        .where(UserRole.user_id == user.id)
    )
    permissions = sorted({p for (p,) in perm_result.all()})

    log.info("=== RBAC DEBUG: user_id=%s permissions=%d user_roles_check below ===", str(user.id), len(permissions))
    ur_result = await db.execute(select(UserRole).where(UserRole.user_id == user.id))
    ur_rows = ur_result.scalars().all()
    log.info("=== RBAC DEBUG: user_roles rows=%d ===", len(ur_rows))
    cr_result = await db.execute(select(CustomRole))
    cr_rows = cr_result.scalars().all()
    log.info("=== RBAC DEBUG: custom_roles total=%d names=%s ===", len(cr_rows), [r.name for r in cr_rows])
    rp_result = await db.execute(select(RolePermission))
    rp_rows = rp_result.scalars().all()
    log.info("=== RBAC DEBUG: role_permissions total=%d ===", len(rp_rows))

    log.info("PERMISSIONS DEBUG: user_id=%s found %d permissions", user.id, len(permissions))

    ur_count = await db.execute(select(func.count()).select_from(UserRole).where(UserRole.user_id == user.id))
    log.info("USER_ROLES DEBUG: user_id=%s has %d role assignments", user.id, ur_count.scalar())

    cr_count = await db.execute(select(func.count()).select_from(CustomRole))
    log.info("CUSTOM_ROLES DEBUG: total %d custom roles in DB", cr_count.scalar())

    rp_count = await db.execute(select(func.count()).select_from(RolePermission))
    log.info("ROLE_PERMISSIONS DEBUG: total %d permission rows in DB", rp_count.scalar())

    direct_count_result = await db.execute(
        select(func.count(User.id)).where(
            User.is_active == True,
            or_(
                User.direct_manager_id    == user.id,
                User.reviewing_manager_id == user.id,
            ),
        )
    )
    direct_count = direct_count_result.scalar() or 0

    hod_count_result = await db.execute(
        select(func.count(User.id)).where(
            User.is_active == True,
            User.hod_id == user.id,
        )
    )
    hod_count = hod_count_result.scalar() or 0

    derived_roles: List[str] = []
    if direct_count > 0:
        derived_roles.append("MANAGER")
    if hod_count > 0:
        derived_roles.append("HOD")

    return permissions, derived_roles


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

