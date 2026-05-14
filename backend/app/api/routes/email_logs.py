from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional

from app.db.session import get_db
from app.core.security import require_roles
from app.models.user import User

router = APIRouter()

require_hr_admin = require_roles("HR_ADMIN", "SUPER_ADMIN")


@router.get("/")
async def list_email_logs(
    status: Optional[str] = Query(None, description="Filter by status: SENT, FAILED, PENDING"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_hr_admin),
):
    params: dict = {}
    where = ""
    if status:
        where = "WHERE status = :status"
        params["status"] = status.upper()

    result = await db.execute(text(f"""
        SELECT
            id,
            idempotency_key,
            to_email,
            subject,
            template_name,
            template_data,
            status,
            attempt_count,
            last_attempt_at,
            sent_at,
            error_message,
            provider_message_id,
            created_at
        FROM email_logs
        {where}
        ORDER BY created_at DESC
        LIMIT 100
    """), params)

    rows = result.mappings().all()
    return [
        {
            "id":                   str(r["id"]),
            "idempotency_key":      r["idempotency_key"],
            "to_email":             r["to_email"],
            "subject":              r["subject"],
            "template_name":        r["template_name"],
            "template_data":        r["template_data"],
            "status":               r["status"],
            "attempt_count":        r["attempt_count"],
            "last_attempt_at":      r["last_attempt_at"].isoformat() if r["last_attempt_at"] else None,
            "sent_at":              r["sent_at"].isoformat() if r["sent_at"] else None,
            "error_message":        r["error_message"],
            "provider_message_id":  r["provider_message_id"],
            "created_at":           r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]
