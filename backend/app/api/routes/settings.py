import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import require_roles, get_current_user
from app.models.user import User

router = APIRouter()


require_hr_admin    = require_roles("HR_ADMIN", "SUPER_ADMIN")
require_super_admin = require_roles("SUPER_ADMIN")


class SettingUpdate(BaseModel):
    value: str


@router.get("/")
async def list_settings(
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
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


@router.get("/email-config")
async def get_email_config(
    current_user: User = Depends(require_hr_admin),
):
    return {
        "test_recipient": os.environ.get("EMAIL_TEST_MODE_RECIPIENT", ""),
        "email_from":     os.environ.get("EMAIL_FROM", ""),
        "has_api_key":    bool(os.environ.get("RESEND_API_KEY", "")),
    }


KPI_SETTINGS_KEYS = {'max_kpis_per_scorecard', 'min_kpis_per_scorecard', 'global_min_weight_per_kpi'}


@router.patch("/{key}")
async def update_setting(
    key:          str,
    body:         SettingUpdate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    if key in KPI_SETTINGS_KEYS:
        if current_user.role not in ("HR_ADMIN", "SUPER_ADMIN"):
            perm_result = await db.execute(text("""
                SELECT 1 FROM user_roles ur
                JOIN role_permissions rp ON rp.role_id = ur.role_id
                WHERE ur.user_id = :uid AND rp.permission = 'manage_weight_rules'
                LIMIT 1
            """), {"uid": str(current_user.id)})
            if not perm_result.scalar_one_or_none():
                raise HTTPException(403, "Insufficient permissions to update KPI settings")
    else:
        if current_user.role != "SUPER_ADMIN":
            raise HTTPException(403, "Only Super Admin can update this setting")

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
