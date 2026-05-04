"""Departments route"""
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import get_current_user, require_hr_admin
from app.models.user import Department, User

router = APIRouter()

class DeptCreate(BaseModel):
    code: str
    name: str
    parent_id: Optional[UUID] = None

@router.get("/")
async def list_departments(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Department).where(Department.is_active == True).order_by(Department.name))
    return [{"id": str(d.id), "code": d.code, "name": d.name, "parent_id": str(d.parent_id) if d.parent_id else None} for d in result.scalars().all()]

@router.post("/")
async def create_department(body: DeptCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_hr_admin)):
    dept = Department(**body.model_dump())
    db.add(dept)
    await db.flush()
    return {"id": str(dept.id), "name": dept.name}
