"""Notifications route"""
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.db.session import get_db
from app.core.security import get_current_user
from app.models.user import Notification, User

router = APIRouter()

@router.get("/")
async def list_notifications(
    unread_only: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        q = q.where(Notification.is_read == False)
    result = await db.execute(q.order_by(Notification.created_at.desc()).limit(50))
    notifs = result.scalars().all()
    return [{"id": str(n.id), "title": n.title, "body": n.body,
             "type": n.type, "is_read": n.is_read,
             "created_at": n.created_at.isoformat()} for n in notifs]

@router.patch("/read-all")
async def mark_all_read(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await db.execute(update(Notification).where(Notification.user_id == current_user.id).values(is_read=True))
    return {"ok": True}
