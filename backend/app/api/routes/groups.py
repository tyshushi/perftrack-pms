from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel

from app.db.session import get_db
from app.core.security import get_current_user, require_permission
from app.models.user import Group, GroupMember, User

router = APIRouter()


class GroupCreate(BaseModel):
    name:        str
    description: Optional[str] = None
    cycle_id:    Optional[UUID] = None


class GroupUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None


class AddMembersRequest(BaseModel):
    user_ids: List[UUID]


@router.get("/")
async def list_groups(
    cycle_id:     Optional[UUID] = None,
    db:           AsyncSession   = Depends(get_db),
    current_user: User           = Depends(get_current_user),
):
    q = select(Group).where(Group.is_active == True)
    if cycle_id:
        q = q.where(Group.cycle_id == cycle_id)
    result = await db.execute(q.order_by(Group.name))
    groups = result.scalars().all()

    out = []
    for g in groups:
        members = await db.execute(
            select(GroupMember).where(GroupMember.group_id == g.id)
        )
        member_count = len(members.scalars().all())
        out.append({
            "id":           str(g.id),
            "name":         g.name,
            "description":  g.description,
            "cycle_id":     str(g.cycle_id) if g.cycle_id else None,
            "created_by":   str(g.created_by) if g.created_by else None,
            "is_active":    g.is_active,
            "member_count": member_count,
            "created_at":   g.created_at.isoformat(),
        })
    return out


@router.post("/")
async def create_group(
    body:         GroupCreate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(require_permission("manage_groups")),
):
    group = Group(
        name        = body.name,
        description = body.description,
        cycle_id    = body.cycle_id,
        created_by  = current_user.id,
    )
    db.add(group)
    await db.flush()
    await db.refresh(group)
    return {
        "id":          str(group.id),
        "name":        group.name,
        "description": group.description,
        "cycle_id":    str(group.cycle_id) if group.cycle_id else None,
        "member_count": 0,
    }


@router.patch("/{group_id}")
async def update_group(
    group_id: UUID,
    body:     GroupUpdate,
    db:       AsyncSession = Depends(get_db),
    _:        User         = Depends(require_permission("manage_groups")),
):
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "Group not found")
    if body.name:        group.name        = body.name
    if body.description: group.description = body.description
    await db.flush()
    return {"id": str(group.id), "name": group.name}


@router.delete("/{group_id}", status_code=204)
async def delete_group(
    group_id: UUID,
    db:       AsyncSession = Depends(get_db),
    _:        User         = Depends(require_permission("manage_groups")),
):
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "Group not found")
    group.is_active = False
    await db.flush()


@router.get("/{group_id}/members")
async def get_members(
    group_id:     UUID,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    result = await db.execute(
        select(GroupMember).where(GroupMember.group_id == group_id)
    )
    members = result.scalars().all()
    out = []
    for m in members:
        ur = await db.execute(select(User).where(User.id == m.user_id))
        u = ur.scalar_one_or_none()
        if u:
            out.append({
                "id":          str(m.id),
                "user_id":     str(u.id),
                "full_name":   u.full_name,
                "employee_id": u.employee_id,
                "role":        u.role,
                "job_grade":   u.job_grade,
                "department_id": str(u.department_id) if u.department_id else None,
                "category":    u.category,
                "hierarchy":   u.hierarchy if hasattr(u, 'hierarchy') else None,
            })
    return out


@router.post("/{group_id}/members")
async def add_members(
    group_id: UUID,
    body:     AddMembersRequest,
    db:       AsyncSession = Depends(get_db),
    current_user: User     = Depends(require_permission("manage_groups")),
):
    result = await db.execute(select(Group).where(Group.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "Group not found")

    added = skipped = 0
    for user_id in body.user_ids:
        existing = await db.execute(
            select(GroupMember).where(
                GroupMember.group_id == group_id,
                GroupMember.user_id  == user_id,
            )
        )
        if existing.scalar_one_or_none():
            skipped += 1
            continue
        db.add(GroupMember(
            group_id = group_id,
            user_id  = user_id,
            added_by = current_user.id,
        ))
        added += 1

    await db.flush()
    return {
        "added":   added,
        "skipped": skipped,
        "message": f"Added {added} member(s). {skipped} already in group.",
    }


@router.delete("/{group_id}/members/{user_id}", status_code=204)
async def remove_member(
    group_id: UUID,
    user_id:  UUID,
    db:       AsyncSession = Depends(get_db),
    _:        User         = Depends(require_permission("manage_groups")),
):
    result = await db.execute(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id  == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(404, "Member not found")
    await db.delete(member)
