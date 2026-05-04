"""Users route with CSV import and profile management"""
from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import csv
import io
from datetime import date

from app.db.session import get_db
from app.core.security import get_current_user, require_hr_admin
from app.models.user import User

router = APIRouter()


# ── Schemas ────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    employee_id:   str
    email:         str
    full_name:     str
    role:          str
    job_grade:     Optional[str] = None
    department_id: Optional[UUID] = None
    manager_id:    Optional[UUID] = None
    password:      str


class ManagerUpdate(BaseModel):
    direct_manager_id:    Optional[UUID] = None
    reviewing_manager_id: Optional[UUID] = None
    hod_id:               Optional[UUID] = None
    approval_levels:      Optional[int]  = None


class ImportConfirmRow(BaseModel):
    employee_code:   str
    email:           str
    name:            str
    department:      Optional[str] = None
    division:        Optional[str] = None
    section:         Optional[str] = None
    position:        Optional[str] = None
    grade:           Optional[str] = None
    role:            Optional[str] = None
    hire_date:       Optional[str] = None
    gender:          Optional[str] = None
    country:         Optional[str] = None
    work_location:   Optional[str] = None
    employee_type:   Optional[str] = None
    category:        Optional[str] = None
    employment_unit: Optional[str] = None
    action:          str  # create, update, deactivate


class ImportConfirmRequest(BaseModel):
    rows: List[ImportConfirmRow]


# ── Constants ──────────────────────────────────────────────────────────────

REQUIRED_COLUMNS = {
    "Employee Code", "Name", "Employment Unit", "Department",
    "Division", "Section", "Position Title", "Grade", "Category",
    "Country", "Work Location", "Employee Type", "Hire Date",
    "Gender", "ROLE"
}

VALID_ROLES = {"STAFF", "MANAGER", "MGR2", "HOD", "HR_ADMIN", "SUPER_ADMIN"}


def normalize_role(role_str: str) -> str:
    if not role_str:
        return "STAFF"
    r = role_str.strip().upper()
    aliases = {
        "STAFF":              "STAFF",
        "EMPLOYEE":           "STAFF",
        "MANAGER":            "MANAGER",
        "MGR":                "MANAGER",
        "MGR2":               "MGR2",
        "MANAGER2":           "MGR2",
        "SENIOR MANAGER":     "MGR2",
        "HOD":                "HOD",
        "HEAD":               "HOD",
        "HEAD OF DEPARTMENT": "HOD",
        "CXO":                "HOD",
        "HR_ADMIN":           "HR_ADMIN",
        "HR ADMIN":           "HR_ADMIN",
        "HRADMIN":            "HR_ADMIN",
        "SUPER_ADMIN":        "SUPER_ADMIN",
        "SUPERADMIN":         "SUPER_ADMIN",
        "ADMIN":              "HR_ADMIN",
    }
    return aliases.get(r, "STAFF")


def parse_date(date_str: str) -> Optional[date]:
    if not date_str or not date_str.strip():
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%m/%d/%Y", "%d-%m-%Y", "%d %b %Y", "%d %B %Y"):
        try:
            from datetime import datetime
            return datetime.strptime(date_str.strip(), fmt).date()
        except ValueError:
            continue
    return None


# ── User endpoints ─────────────────────────────────────────────────────────

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
            "id":                    str(u.id),
            "employee_id":           u.employee_id,
            "email":                 u.email,
            "full_name":             u.full_name,
            "role":                  u.role,
            "job_grade":             u.job_grade,
            "department_id":         str(u.department_id) if u.department_id else None,
            "manager_id":            str(u.manager_id) if u.manager_id else None,
            "direct_manager_id":     str(u.direct_manager_id) if u.direct_manager_id else None,
            "reviewing_manager_id":  str(u.reviewing_manager_id) if u.reviewing_manager_id else None,
            "hod_id":                str(u.hod_id) if u.hod_id else None,
            "approval_levels":       u.approval_levels or 3,
            "is_active":             u.is_active,
            "position_title":        u.position_title,
            "division":              u.division,
            "section":               u.section,
            "employment_unit":       u.employment_unit,
            "category":              u.category,
            "country":               u.country,
            "work_location":         u.work_location,
            "employee_type":         u.employee_type,
            "hire_date":             str(u.hire_date) if u.hire_date else None,
            "gender":                u.gender,
        }
        for u in users
    ]


@router.get("/direct-reports")
async def direct_reports(
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Get all users where current user is direct manager, reviewing manager, or HOD."""
    result = await db.execute(
        select(User).where(
            User.is_active == True,
            (User.direct_manager_id    == current_user.id) |
            (User.reviewing_manager_id == current_user.id) |
            (User.hod_id               == current_user.id)
        ).order_by(User.full_name)
    )
    users = result.scalars().all()
    return [
        {
            "id":           str(u.id),
            "full_name":    u.full_name,
            "employee_id":  u.employee_id,
            "role":         u.role,
            "job_grade":    u.job_grade,
            "direct_manager_id":    str(u.direct_manager_id)    if u.direct_manager_id    else None,
            "reviewing_manager_id": str(u.reviewing_manager_id) if u.reviewing_manager_id else None,
            "hod_id":               str(u.hod_id)               if u.hod_id               else None,
            "approval_levels":      u.approval_levels or 3,
        }
        for u in users
    ]


@router.post("/")
async def create_user(
    body: UserCreate,
    db:   AsyncSession = Depends(get_db),
    _:    User         = Depends(require_hr_admin),
):
    from app.core.security import hash_password
    user = User(
        employee_id     = body.employee_id,
        email           = body.email,
        full_name       = body.full_name,
        role            = body.role,
        job_grade       = body.job_grade,
        department_id   = body.department_id,
        manager_id      = body.manager_id,
        hashed_password = hash_password(body.password),
    )
    db.add(user)
    await db.flush()
    return {"id": str(user.id), "email": user.email}


@router.get("/{user_id}/profile")
async def get_user_profile(
    user_id:      UUID,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """Get full user profile including all org fields and manager details."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    async def get_manager_info(uid):
        if not uid:
            return None
        r = await db.execute(select(User).where(User.id == uid))
        u = r.scalar_one_or_none()
        if not u:
            return None
        return {
            "id":          str(u.id),
            "name":        u.full_name,
            "employee_id": u.employee_id,
            "role":        u.role,
            "email":       u.email,
        }

    # Get department name
    dept_name = None
    if user.department_id:
        from app.models.user import Department
        dr = await db.execute(
            select(Department).where(Department.id == user.department_id)
        )
        dept = dr.scalar_one_or_none()
        dept_name = dept.name if dept else None

    return {
        "id":              str(user.id),
        "employee_id":     user.employee_id,
        "email":           user.email,
        "full_name":       user.full_name,
        "role":            user.role,
        "job_grade":       user.job_grade,
        "department_id":   str(user.department_id) if user.department_id else None,
        "department_name": dept_name,
        "is_active":       user.is_active,
        "approval_levels": user.approval_levels or 3,

        # Org fields
        "employment_unit": user.employment_unit,
        "division":        user.division,
        "section":         user.section,
        "position_title":  user.position_title,
        "category":        user.category,
        "country":         user.country,
        "work_location":   user.work_location,
        "employee_type":   user.employee_type,
        "hire_date":       str(user.hire_date) if user.hire_date else None,
        "gender":          user.gender,

        # Approval chain
        "direct_manager":    await get_manager_info(user.direct_manager_id),
        "reviewing_manager": await get_manager_info(user.reviewing_manager_id),
        "hod":               await get_manager_info(user.hod_id),
    }


@router.patch("/{user_id}/managers")
async def update_managers(
    user_id:      UUID,
    body:         ManagerUpdate,
    db:           AsyncSession = Depends(get_db),
    current_user: User         = Depends(get_current_user),
):
    """HR Admin or Manager can update an employee's reporting managers."""
    if current_user.role not in ["HR_ADMIN", "SUPER_ADMIN", "MANAGER", "MGR2", "HOD"]:
        raise HTTPException(403, "Not authorised to change reporting managers")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    if body.direct_manager_id    is not None:
        user.direct_manager_id    = body.direct_manager_id    if body.direct_manager_id    != UUID("00000000-0000-0000-0000-000000000000") else None
    if body.reviewing_manager_id is not None:
        user.reviewing_manager_id = body.reviewing_manager_id if body.reviewing_manager_id != UUID("00000000-0000-0000-0000-000000000000") else None
    if body.hod_id               is not None:
        user.hod_id               = body.hod_id               if body.hod_id               != UUID("00000000-0000-0000-0000-000000000000") else None
    if body.approval_levels      is not None:
        user.approval_levels      = body.approval_levels

    await db.flush()
    return {"message": "Managers updated successfully"}


@router.patch("/{user_id}/password")
async def change_password(
    user_id: UUID,
    body:    dict,
    db:      AsyncSession = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """User can change their own password. HR Admin can change anyone's."""
    if str(current_user.id) != str(user_id) and current_user.role not in ["HR_ADMIN", "SUPER_ADMIN"]:
        raise HTTPException(403, "Not authorised")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    from app.core.security import hash_password, verify_password
    if str(current_user.id) == str(user_id):
        if not verify_password(body.get("current_password", ""), user.hashed_password):
            raise HTTPException(400, "Current password is incorrect")

    new_password = body.get("new_password", "")
    if len(new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    user.hashed_password = hash_password(new_password)
    await db.flush()
    return {"message": "Password changed successfully"}


# ── CSV Import ─────────────────────────────────────────────────────────────

@router.post("/import/preview")
async def import_preview(
    file:         UploadFile   = File(...),
    db:           AsyncSession = Depends(get_db),
    _:            User         = Depends(require_hr_admin),
):
    """Parse CSV and return preview: NEW, DUPLICATE, MISSING."""
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        raise HTTPException(400, "CSV file is empty or unreadable")

    csv_columns = set(reader.fieldnames)
    missing_cols = REQUIRED_COLUMNS - csv_columns
    if missing_cols:
        raise HTTPException(400, f"Missing columns: {', '.join(sorted(missing_cols))}")

    rows = list(reader)
    if not rows:
        raise HTTPException(400, "CSV has no data rows")

    # Fetch all existing users
    result = await db.execute(select(User))
    existing_users = result.scalars().all()
    by_code  = {u.employee_id: u for u in existing_users}
    by_email = {u.email: u for u in existing_users}

    # Build employee code lookup for manager matching
    code_to_id = {u.employee_id: str(u.id) for u in existing_users}

    csv_codes = set()
    preview   = []

    for i, row in enumerate(rows, start=2):
        emp_code  = row.get("Employee Code", "").strip()
        name      = row.get("Name", "").strip()
        email     = row.get("Email", row.get("email", "")).strip()
        dept      = row.get("Department", "").strip()
        division  = row.get("Division", "").strip()
        section   = row.get("Section", "").strip()
        position  = row.get("Position Title", "").strip()
        grade     = row.get("Grade", "").strip()
        role_raw  = row.get("ROLE", "").strip()
        role      = normalize_role(role_raw)
        hire_date = row.get("Hire Date", "").strip()
        gender    = row.get("Gender", "").strip()
        country   = row.get("Country", "").strip()
        work_loc  = row.get("Work Location", "").strip()
        emp_type  = row.get("Employee Type", "").strip()
        category  = row.get("Category", "").strip()
        emp_unit  = row.get("Employment Unit", "").strip()

        # Optional manager columns from CSV
        dm_code  = row.get("Direct Manager Code", row.get("Manager Code", "")).strip()
        rm_code  = row.get("Reviewing Manager Code", "").strip()
        hod_code = row.get("HOD Code", "").strip()

        # Generate email if missing
        if not email and emp_code:
            email = f"{emp_code.lower()}@company.local"

        if not emp_code:
            preview.append({
                "row": i, "status": "ERROR",
                "employee_code": "", "name": name, "email": email,
                "message": "Missing Employee Code — row skipped",
            })
            continue

        csv_codes.add(emp_code)

        base = {
            "row":            i,
            "employee_code":  emp_code,
            "name":           name,
            "email":          email,
            "department":     dept,
            "division":       division,
            "section":        section,
            "position":       position,
            "grade":          grade,
            "role":           role,
            "hire_date":      hire_date,
            "gender":         gender,
            "country":        country,
            "work_location":  work_loc,
            "employee_type":  emp_type,
            "category":       category,
            "employment_unit": emp_unit,
            "dm_code":        dm_code,
            "rm_code":        rm_code,
            "hod_code":       hod_code,
        }

        existing = by_code.get(emp_code) or by_email.get(email)

        if existing:
            changes = {}
            if name      and existing.full_name  != name:  changes["name"]  = {"from": existing.full_name,  "to": name}
            if grade     and existing.job_grade   != grade: changes["grade"] = {"from": existing.job_grade,   "to": grade}
            if role      and existing.role        != role:  changes["role"]  = {"from": existing.role,        "to": role}
            if position  and existing.position_title != position: changes["position"] = {"from": existing.position_title, "to": position}

            preview.append({
                **base,
                "status":  "DUPLICATE",
                "changes": changes,
                "message": f"Exists (ID: {existing.employee_id}). {len(changes)} field(s) changed.",
            })
        else:
            preview.append({
                **base,
                "status":  "NEW",
                "message": "Will be created as a new user",
            })

    # Find MISSING employees
    active_users = [u for u in existing_users if u.is_active]
    for user in active_users:
        if user.employee_id not in csv_codes:
            preview.append({
                "row":            None,
                "status":         "MISSING",
                "employee_code":  user.employee_id,
                "name":           user.full_name,
                "email":          user.email,
                "department":     None,
                "division":       None,
                "section":        None,
                "position":       None,
                "grade":          user.job_grade,
                "role":           user.role,
                "hire_date":      None,
                "gender":         None,
                "country":        None,
                "work_location":  None,
                "employee_type":  None,
                "category":       None,
                "employment_unit": None,
                "dm_code":        None,
                "rm_code":        None,
                "hod_code":       None,
                "message":        "In system but not in CSV — may have left the organisation",
            })

    summary = {
        "total_in_csv": len(rows),
        "new":          sum(1 for p in preview if p["status"] == "NEW"),
        "duplicates":   sum(1 for p in preview if p["status"] == "DUPLICATE"),
        "missing":      sum(1 for p in preview if p["status"] == "MISSING"),
        "errors":       sum(1 for p in preview if p["status"] == "ERROR"),
    }

    return {"summary": summary, "rows": preview}


@router.post("/import/confirm")
async def import_confirm(
    body: ImportConfirmRequest,
    db:   AsyncSession         = Depends(get_db),
    _:    User                 = Depends(require_hr_admin),
):
    """Apply confirmed import actions."""
    from app.core.security import hash_password
    from datetime import datetime as dt

    # Build lookup maps
    result = await db.execute(select(User))
    all_users = result.scalars().all()
    by_code   = {u.employee_id: u for u in all_users}
    code_to_id = {u.employee_id: u.id for u in all_users}

    # Fetch departments
    from app.models.user import Department
    dr = await db.execute(select(Department).where(Department.is_active == True))
    all_depts = dr.scalars().all()
    dept_by_name = {d.name.lower(): d.id for d in all_depts}

    created = updated = deactivated = skipped = 0

    for row in body.rows:
        # Resolve department
        dept_id = None
        if row.department:
            dept_id = dept_by_name.get(row.department.lower())

        # Resolve manager IDs from codes
        dm_id  = code_to_id.get(getattr(row, 'dm_code',  None) or "") if hasattr(row, 'dm_code')  else None
        rm_id  = code_to_id.get(getattr(row, 'rm_code',  None) or "") if hasattr(row, 'rm_code')  else None
        hod_id = code_to_id.get(getattr(row, 'hod_code', None) or "") if hasattr(row, 'hod_code') else None

        parsed_hire_date = parse_date(row.hire_date) if row.hire_date else None

        if row.action == "create":
            if row.employee_code in by_code:
                skipped += 1
                continue
            new_user = User(
                employee_id          = row.employee_code,
                email                = row.email,
                full_name            = row.name,
                role                 = row.role or "STAFF",
                job_grade            = row.grade,
                employment_unit      = row.employment_unit,
                department_id        = dept_id,
                division             = row.division,
                section              = row.section,
                position_title       = row.position,
                category             = row.category,
                country              = row.country,
                work_location        = row.work_location,
                employee_type        = row.employee_type,
                hire_date            = parsed_hire_date,
                gender               = row.gender,
                direct_manager_id    = dm_id,
                reviewing_manager_id = rm_id,
                hod_id               = hod_id,
                hashed_password      = hash_password("Welcome@1234"),
                is_active            = True,
            )
            db.add(new_user)
            created += 1

        elif row.action == "update":
            user = by_code.get(row.employee_code)
            if not user:
                skipped += 1
                continue
            if row.name:           user.full_name       = row.name
            if row.grade:          user.job_grade        = row.grade
            if row.role:           user.role             = row.role
            if row.position:       user.position_title   = row.position
            if row.division:       user.division         = row.division
            if row.section:        user.section          = row.section
            if row.employment_unit: user.employment_unit = row.employment_unit
            if row.category:       user.category         = row.category
            if row.country:        user.country          = row.country
            if row.work_location:  user.work_location    = row.work_location
            if row.employee_type:  user.employee_type    = row.employee_type
            if row.gender:         user.gender           = row.gender
            if parsed_hire_date:   user.hire_date        = parsed_hire_date
            if dept_id:            user.department_id    = dept_id
            if dm_id:              user.direct_manager_id    = dm_id
            if rm_id:              user.reviewing_manager_id = rm_id
            if hod_id:             user.hod_id               = hod_id
            user.updated_at = dt.utcnow()
            updated += 1

        elif row.action == "deactivate":
            user = by_code.get(row.employee_code)
            if not user:
                skipped += 1
                continue
            user.is_active  = False
            user.updated_at = dt.utcnow()
            deactivated += 1

    await db.flush()
    return {
        "created":     created,
        "updated":     updated,
        "deactivated": deactivated,
        "skipped":     skipped,
        "message":     f"Import complete. New users get temporary password: Welcome@1234",
    }
