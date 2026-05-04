"""Users route"""
from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import get_current_user, require_hr_admin, hash_password
from app.models.user import User, UserRole

router = APIRouter()


class UserCreate(BaseModel):
    employee_id:   str
    email:         str
    full_name:     str
    role:          str
    job_grade:     Optional[str] = None
    department_id: Optional[UUID] = None
    manager_id:    Optional[UUID] = None
    password:      str


@router.get("/")
async def list_users(
    department_id: Optional[UUID] = None,
    role:          Optional[str]  = None,
    db:            AsyncSession   = Depends(get_db),
    current_user:  User           = Depends(get_current_user),
):
    q = select(User).where(User.is_active == True)
    if department_id:
        q = q.where(User.department_id == department_id)
    if role:
        q = q.where(User.role == role)
    result = await db.execute(q.order_by(User.full_name))
    users = result.scalars().all()
    return [
        {
            "id": str(u.id), "employee_id": u.employee_id, "email": u.email,
            "full_name": u.full_name, "role": u.role.value,
            "job_grade": u.job_grade,
            "department_id": str(u.department_id) if u.department_id else None,
            "manager_id": str(u.manager_id) if u.manager_id else None,
        }
        for u in users
    ]


@router.post("/")
async def create_user(
    body: UserCreate,
    db:   AsyncSession = Depends(get_db),
    _:    User         = Depends(require_hr_admin),
):
    user = User(
        employee_id     = body.employee_id,
        email           = body.email,
        full_name       = body.full_name,
        role            = UserRole(body.role),
        job_grade       = body.job_grade,
        department_id   = body.department_id,
        manager_id      = body.manager_id,
        hashed_password = hash_password(body.password),
    )
    db.add(user)
    await db.flush()
    return {"id": str(user.id), "email": user.email}


@router.get("/direct-reports")
async def direct_reports(
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    result = await db.execute(
        select(User).where(User.manager_id == current_user.id, User.is_active == True)
    )
    users = result.scalars().all()
    return [
        {"id": str(u.id), "full_name": u.full_name, "employee_id": u.employee_id,
         "role": u.role.value, "job_grade": u.job_grade}
        for u in users
    ]
