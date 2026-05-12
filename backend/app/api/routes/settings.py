from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import require_roles
from app.models.user import User

router = APIRouter()


require_hr_admin    = require_roles("HR_ADMIN", "SUPER_ADMIN")
require_super_admin = require_roles("SUPER_ADMIN")


class SettingUpdate(BaseModel):
    value: str


@router.get("/")
async def list_settings(
    db: AsyncSession = Depends(get_db),
    _:  User         = Depends(require_hr_admin),
):
    result = await db.execute(text("""
        SELECT s.key, s.value, s.updated_by, s.updated_at, u.full_name AS updated_by_name
        FROM system_settings s
        LEFT JOIN users u ON u.id = s.updated_by
    """))
    rows = result.mappings().all()
    return {
        r["key"]: {
            "value":           r["value"],
            "updated_by":      str(r["updated_by"]) if r["updated_by"] else None,
            "updated_by_name": r["updated_by_name"],
            "updated_at":      r["updated_at"].isoformat() if r["updated_at"] else None,
        }
        for r in rows
    }


@router.patch("/{key}")
async def update_setting(
    key:          str,
    body:         SettingUpdate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(require_super_admin),
):
    existing = await db.execute(
        text("SELECT key FROM system_settings WHERE key = :k"),
        {"k": key},
    )
    if not existing.scalar_one_or_none():
        raise HTTPException(404, f"Setting '{key}' not found")

    await db.execute(
        text("""
            UPDATE system_settings
            SET value = :v, updated_by = :uid, updated_at = NOW()
            WHERE key = :k
        """),
        {"v": body.value, "uid": str(current_user.id), "k": key},
    )
    await db.flush()

    result = await db.execute(text("""
        SELECT s.key, s.value, s.updated_by, s.updated_at, u.full_name AS updated_by_name
        FROM system_settings s
        LEFT JOIN users u ON u.id = s.updated_by
        WHERE s.key = :k
    """), {"k": key})
    row = result.mappings().first()
    return {
        "key":             row["key"],
        "value":           row["value"],
        "updated_by":      str(row["updated_by"]) if row["updated_by"] else None,
        "updated_by_name": row["updated_by_name"],
        "updated_at":      row["updated_at"].isoformat() if row["updated_at"] else None,
    }
