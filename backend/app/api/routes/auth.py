"""
Auth routes: login, refresh, me
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from pydantic import BaseModel
from datetime import datetime

from app.db.session import get_db
from app.core.security import (
    verify_password, create_access_token, create_refresh_token, get_current_user
)
from app.models.user import User

router = APIRouter()


class TokenOut(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"


@router.post("/login", response_model=TokenOut)
async def login(
    form: OAuth2PasswordRequestForm = Depends(),
    db:   AsyncSession              = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == form.username, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(401, "Invalid credentials")

    await db.execute(update(User).where(User.id == user.id).values(last_login=datetime.utcnow()))

    return TokenOut(
        access_token  = create_access_token({"sub": str(user.id), "role": user.role}),
        refresh_token = create_refresh_token({"sub": str(user.id)}),
    )


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)):
    return {
        "id":            str(current_user.id),
        "employee_id":   current_user.employee_id,
        "email":         current_user.email,
        "full_name":     current_user.full_name,
        "role":          current_user.role,
        "job_grade":     current_user.job_grade,
        "department_id": str(current_user.department_id) if current_user.department_id else None,
        "manager_id":    str(current_user.manager_id) if current_user.manager_id else None,
    }

