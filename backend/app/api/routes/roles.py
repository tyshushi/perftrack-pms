from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import get_current_user, require_roles
from app.models.user import CustomRole, RolePermission, UserRole, User

router = APIRouter()


require_super_admin   = require_roles("SUPER_ADMIN")
require_role_managers = require_roles("HR_ADMIN", "SUPER_ADMIN")


class RoleCreate(BaseModel):
    name:        str
    description: Optional[str] = None
    permissions: List[str] = []


class RoleUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None


class AssignUsersRequest(BaseModel):
    user_ids: List[UUID]


def _serialize_role(role: CustomRole, permissions: List[str], user_count: int = 0) -> dict:
    return {
        "id":          str(role.id),
        "name":        role.name,
        "description": role.description,
        "is_system":   role.is_system,
        "created_by":  str(role.created_by) if role.created_by else None,
        "created_at":  role.created_at.isoformat() if role.created_at else None,
        "updated_at":  role.updated_at.isoformat() if role.updated_at else None,
        "permissions": permissions,
        "user_count":  user_count,
    }


@router.get("/")
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _:  User         = Depends(require_role_managers),
):
    result = await db.execute(select(CustomRole).order_by(CustomRole.name))
    roles = result.scalars().all()
    out = []
    for r in roles:
        perms_result = await db.execute(
            select(RolePermission.permission).where(RolePermission.role_id == r.id)
        )
        perms = [p for (p,) in perms_result.all()]
        count_result = await db.execute(
            select(func.count()).select_from(UserRole).where(UserRole.role_id == r.id)
        )
        user_count = count_result.scalar() or 0
        out.append(_serialize_role(r, perms, user_count))
    return out


@router.post("/")
async def create_role(
    body:         RoleCreate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(require_super_admin),
):
    existing = await db.execute(select(CustomRole).where(CustomRole.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Role with this name already exists")

    role = CustomRole(
        name        = body.name,
        description = body.description,
        is_system   = False,
        created_by  = current_user.id,
    )
    db.add(role)
    await db.flush()

    for perm in set(body.permissions):
        db.add(RolePermission(role_id=role.id, permission=perm))
    await db.flush()
    await db.refresh(role)

    return _serialize_role(role, list(set(body.permissions)))


@router.patch("/{role_id}")
async def update_role(
    role_id: UUID,
    body:    RoleUpdate,
    db:      AsyncSession = Depends(get_db),
    _:       User         = Depends(require_super_admin),
):
    result = await db.execute(select(CustomRole).where(CustomRole.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(404, "Role not found")

    if body.name is not None:
        role.name = body.name
    if body.description is not None:
        role.description = body.description

    if body.permissions is not None:
        await db.execute(delete(RolePermission).where(RolePermission.role_id == role.id))
        for perm in set(body.permissions):
            db.add(RolePermission(role_id=role.id, permission=perm))

    await db.flush()

    perms_result = await db.execute(
        select(RolePermission.permission).where(RolePermission.role_id == role.id)
    )
    perms = [p for (p,) in perms_result.all()]
    return _serialize_role(role, perms)


@router.delete("/{role_id}", status_code=204)
async def delete_role(
    role_id: UUID,
    db:      AsyncSession = Depends(get_db),
    _:       User         = Depends(require_super_admin),
):
    result = await db.execute(select(CustomRole).where(CustomRole.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(404, "Role not found")
    if role.is_system:
        raise HTTPException(400, "Cannot delete system role")
    count_result = await db.execute(
        select(func.count()).select_from(UserRole).where(UserRole.role_id == role.id)
    )
    assigned = count_result.scalar() or 0
    if assigned > 0:
        raise HTTPException(400, f"Cannot delete role: {assigned} user(s) still assigned")
    await db.delete(role)
    await db.flush()


@router.get("/{role_id}/users")
async def list_role_users(
    role_id: UUID,
    db:      AsyncSession = Depends(get_db),
    _:       User         = Depends(get_current_user),
):
    result = await db.execute(select(CustomRole).where(CustomRole.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(404, "Role not found")

    ur_result = await db.execute(
        select(UserRole).where(UserRole.role_id == role_id)
    )
    user_roles = ur_result.scalars().all()
    out = []
    for ur in user_roles:
        u_res = await db.execute(select(User).where(User.id == ur.user_id))
        u = u_res.scalar_one_or_none()
        if u:
            out.append({
                "user_role_id":  str(ur.id),
                "user_id":       str(u.id),
                "employee_id":   u.employee_id,
                "full_name":     u.full_name,
                "email":         u.email,
                "role":          u.role,
                "department_id": str(u.department_id) if u.department_id else None,
                "assigned_by":   str(ur.assigned_by) if ur.assigned_by else None,
                "created_at":    ur.created_at.isoformat() if ur.created_at else None,
            })
    return out


@router.post("/{role_id}/users")
async def assign_users(
    role_id:      UUID,
    body:         AssignUsersRequest,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(require_role_managers),
):
    result = await db.execute(select(CustomRole).where(CustomRole.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(404, "Role not found")

    added = skipped = 0
    for user_id in body.user_ids:
        existing = await db.execute(
            select(UserRole).where(
                UserRole.role_id == role_id,
                UserRole.user_id == user_id,
            )
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue
        db.add(UserRole(
            role_id     = role_id,
            user_id     = user_id,
            assigned_by = current_user.id,
        ))
        added += 1

    await db.flush()
    return {
        "added":   added,
        "skipped": skipped,
        "message": f"Assigned {added} user(s). {skipped} already had this role.",
    }


@router.delete("/{role_id}/users/{user_id}", status_code=204)
async def remove_user_role(
    role_id: UUID,
    user_id: UUID,
    db:      AsyncSession = Depends(get_db),
    _:       User         = Depends(require_role_managers),
):
    result = await db.execute(
        select(UserRole).where(
            UserRole.role_id == role_id,
            UserRole.user_id == user_id,
        )
    )
    ur = result.scalar_one_or_none()
    if not ur:
        raise HTTPException(404, "User role assignment not found")
    await db.delete(ur)
    await db.flush()
