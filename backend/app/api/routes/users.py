"""Users route with CSV import"""
from uuid import UUID
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import csv
import io

from app.db.session import get_db
from app.core.security import get_current_user, require_hr_admin
from app.models.user import User

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


class ImportPreviewRow(BaseModel):
    row:           int
    status:        str   # NEW, DUPLICATE, UPDATED, MISSING
    employee_code: str
    name:          str
    email:         str
    department:    Optional[str]
    division:      Optional[str]
    section:       Optional[str]
    position:      Optional[str]
    grade:         Optional[str]
    role:          Optional[str]
    hire_date:     Optional[str]
    gender:        Optional[str]
    country:       Optional[str]
    work_location: Optional[str]
    employee_type: Optional[str]
    category:      Optional[str]
    employment_unit: Optional[str]
    changes:       Optional[dict] = None
    message:       Optional[str] = None


class ImportConfirmRow(BaseModel):
    employee_code: str
    email:         str
    name:          str
    department:    Optional[str]
    division:      Optional[str]
    section:       Optional[str]
    position:      Optional[str]
    grade:         Optional[str]
    role:          str
    hire_date:     Optional[str]
    gender:        Optional[str]
    country:       Optional[str]
    work_location: Optional[str]
    employee_type: Optional[str]
    category:      Optional[str]
    employment_unit: Optional[str]
    action:        str  # create, update, deactivate


class ImportConfirmRequest(BaseModel):
    rows: List[ImportConfirmRow]


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
    # Common aliases
    aliases = {
        "STAFF": "STAFF",
        "EMPLOYEE": "STAFF",
        "MANAGER": "MANAGER",
        "MGR": "MANAGER",
        "MGR2": "MGR2",
        "MANAGER2": "MGR2",
        "SENIOR MANAGER": "MGR2",
        "HOD": "HOD",
        "HEAD": "HOD",
        "HEAD OF DEPARTMENT": "HOD",
        "CXO": "HOD",
        "HR_ADMIN": "HR_ADMIN",
        "HR ADMIN": "HR_ADMIN",
        "HRADMIN": "HR_ADMIN",
        "SUPER_ADMIN": "SUPER_ADMIN",
        "SUPERADMIN": "SUPER_ADMIN",
        "ADMIN": "HR_ADMIN",
    }
    return aliases.get(r, "STAFF")


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
            "full_name": u.full_name, "role": u.role,
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
         "role": u.role, "job_grade": u.job_grade}
        for u in users
    ]


@router.post("/import/preview")
async def import_preview(
    file:         UploadFile       = File(...),
    db:           AsyncSession     = Depends(get_db),
    _:            User             = Depends(require_hr_admin),
):
    """
    Parse CSV and return a preview of what will happen:
    NEW, DUPLICATE (flagged), UPDATED, MISSING
    """
    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handles BOM from Excel
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))

    # Validate columns
    if not reader.fieldnames:
        raise HTTPException(400, "CSV file is empty or unreadable")

    csv_columns = set(reader.fieldnames)
    missing_cols = REQUIRED_COLUMNS - csv_columns
    if missing_cols:
        raise HTTPException(400, f"Missing columns: {', '.join(sorted(missing_cols))}")

    rows = list(reader)
    if not rows:
        raise HTTPException(400, "CSV has no data rows")

    # Fetch all existing active users
    result = await db.execute(select(User).where(User.is_active == True))
    existing_users = result.scalars().all()
    existing_by_code  = {u.employee_id: u for u in existing_users}
    existing_by_email = {u.email: u for u in existing_users}

    # Track which employee codes appear in CSV
    csv_codes = set()
    preview: List[dict] = []

    for i, row in enumerate(rows, start=2):  # row 1 = header
        emp_code = row.get("Employee Code", "").strip()
        name     = row.get("Name", "").strip()
        email    = row.get("Email", row.get("email", "")).strip()
        dept     = row.get("Department", "").strip()
        division = row.get("Division", "").strip()
        section  = row.get("Section", "").strip()
        position = row.get("Position Title", "").strip()
        grade    = row.get("Grade", "").strip()
        role_raw = row.get("ROLE", "").strip()
        role     = normalize_role(role_raw)
        hire_date    = row.get("Hire Date", "").strip()
        gender       = row.get("Gender", "").strip()
        country      = row.get("Country", "").strip()
        work_loc     = row.get("Work Location", "").strip()
        emp_type     = row.get("Employee Type", "").strip()
        category     = row.get("Category", "").strip()
        emp_unit     = row.get("Employment Unit", "").strip()

        # Generate email if not in CSV
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
            "row": i,
            "employee_code": emp_code,
            "name": name,
            "email": email,
            "department": dept,
            "division": division,
            "section": section,
            "position": position,
            "grade": grade,
            "role": role,
            "hire_date": hire_date,
            "gender": gender,
            "country": country,
            "work_location": work_loc,
            "employee_type": emp_type,
            "category": category,
            "employment_unit": emp_unit,
        }

        by_code  = existing_by_code.get(emp_code)
        by_email = existing_by_email.get(email)

        if by_code or by_email:
            existing = by_code or by_email
            # Detect what changed
            changes = {}
            if name and existing.full_name != name:
                changes["name"] = {"from": existing.full_name, "to": name}
            if grade and existing.job_grade != grade:
                changes["grade"] = {"from": existing.job_grade, "to": grade}
            if role and existing.role != role:
                changes["role"] = {"from": existing.role, "to": role}

            preview.append({
                **base,
                "status": "DUPLICATE",
                "changes": changes,
                "message": f"Exists in system (ID: {existing.employee_id}). {len(changes)} field(s) changed.",
            })
        else:
            preview.append({
                **base,
                "status": "NEW",
                "message": "Will be created as a new user",
            })

    # Find MISSING employees (in system but not in CSV)
    for user in existing_users:
        if user.employee_id not in csv_codes:
            preview.append({
                "row": None,
                "status": "MISSING",
                "employee_code": user.employee_id,
                "name": user.full_name,
                "email": user.email,
                "department": None,
                "division": None,
                "section": None,
                "position": None,
                "grade": user.job_grade,
                "role": user.role,
                "hire_date": None,
                "gender": None,
                "country": None,
                "work_location": None,
                "employee_type": None,
                "category": None,
                "employment_unit": None,
                "message": "In system but not in CSV — may have left the organisation",
            })

    summary = {
        "total_in_csv":  len(rows),
        "new":           sum(1 for p in preview if p["status"] == "NEW"),
        "duplicates":    sum(1 for p in preview if p["status"] == "DUPLICATE"),
        "missing":       sum(1 for p in preview if p["status"] == "MISSING"),
        "errors":        sum(1 for p in preview if p["status"] == "ERROR"),
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
    from datetime import datetime

    result = await db.execute(select(User))
    existing = result.scalars().all()
    by_code  = {u.employee_id: u for u in existing}

    created = updated = deactivated = skipped = 0

    for row in body.rows:
        if row.action == "create":
            # Check not already exists
            if row.employee_code in by_code:
                skipped += 1
                continue
            new_user = User(
    employee_id      = row.employee_code,
    email            = row.email,
    full_name        = row.name,
    role             = row.role or "STAFF",
    job_grade        = row.grade,
    employment_unit  = row.employment_unit,
    division         = row.division,
    section          = row.section,
    position_title   = row.position,
    category         = row.category,
    country          = row.country,
    work_location    = row.work_location,
    employee_type    = row.employee_type,
    gender           = row.gender,
    hashed_password  = hash_password("Welcome@1234"),
    is_active        = True,
)
            db.add(new_user)
            created += 1

        elif row.action == "update":
            user = by_code.get(row.employee_code)
            if not user:
                skipped += 1
                continue
            if row.name:       user.full_name = row.name
            if row.grade:      user.job_grade = row.grade
            if row.role:       user.role      = row.role
            user.updated_at = datetime.utcnow()
            updated += 1

        elif row.action == "deactivate":
            user = by_code.get(row.employee_code)
            if not user:
                skipped += 1
                continue
            user.is_active  = False
            user.updated_at = datetime.utcnow()
            deactivated += 1

    await db.flush()
    return {
        "created":     created,
        "updated":     updated,
        "deactivated": deactivated,
        "skipped":     skipped,
        "message":     f"Import complete. New users get temporary password: Welcome@1234",
    }
