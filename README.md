# PerfTrack — Performance Management System

Enterprise-grade PMS for ~6,000 users.  
Stack: **React + TypeScript** · **FastAPI (Python)** · **PostgreSQL** · **Redis** · **Celery**

---

## Quick Start (Docker)

```bash
git clone <your-repo>
cd pms
docker compose up --build
```

Then open:
- **Frontend**: http://localhost:5173
- **API Docs**: http://localhost:8000/docs

### Demo Accounts (password: `demo1234`)

| Role             | Email                  |
|------------------|------------------------|
| Staff            | staff@pms.local        |
| Manager          | manager@pms.local      |
| Manager's Manager| mgr2@pms.local         |
| HOD / CxO        | hod@pms.local          |
| HR Admin         | hradmin@pms.local      |

---

## Architecture

```
frontend/          React + TypeScript (Vite)
  src/
    api/           Axios client — all API calls
    components/    Shared UI (Layout, etc.)
    pages/         One page per role view
    store/         Zustand auth store

backend/           FastAPI (Python 3.11)
  app/
    api/routes/    One file per domain
    core/          Config, JWT security
    db/            SQLAlchemy async session
    models/        All ORM models + enums
    services/      Business logic
      kpi_workflow.py   KPI FSM + weight validation
      bell_curve.py     Ranking + increment calc

backend/schema.sql     Full PostgreSQL schema
backend/seed.sql       Demo data + sample cycle
docker-compose.yml     Full stack orchestration
```

---

## Key Features

### Hybrid KPI Setting
- HR publishes **fixed KPI templates** (cascaded by dept/grade)
- Staff add **optional KPIs** on top within category weight limits
- **Weight rules** enforce min/max % per category per role/dept
- Total weight must sum to exactly 100% before submission

### 4-Level Approval Workflow
```
Staff (DRAFT) → Manager → Mgr's Manager → HOD → APPROVED → LOCKED
```
Every transition is logged in `kpi_audit_log` with actor, timestamp, score, and comment.

### Configurable Rating Scale
HR sets the scale per cycle (labels, descriptions, colour codes).  
Default: 1 (Unsatisfactory) → 5 (Outstanding)

### Bell Curve & Forced Ranking
- HR triggers bell curve run after HOD evaluations close
- Employees ranked by final score within department
- Assigned to performance bands based on percentile targets (e.g. top 10% = Outstanding)
- `POST /api/v1/scorecards/bell-curve?cycle_id=...`

### Auto Increment Calculation
- Final score mapped to increment % via `increment_bands` table
- HR confirms increment — triggers notification to employee
- Full audit: who confirmed, when, at what score

### Notifications
- In-app notifications created on every KPI transition
- Email via Celery + SMTP (configure in `.env`)
- Celery Beat sends deadline reminders automatically

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
DATABASE_URL=postgresql+asyncpg://pms_user:pms_secret@db:5432/pms_db
REDIS_URL=redis://redis:6379
SECRET_KEY=<32-char random string>
SMTP_HOST=smtp.yourcompany.com
SMTP_PORT=587
SMTP_USER=noreply@yourcompany.com
SMTP_PASSWORD=<password>
```

---

## Scaling to 6,000 Users

- PostgreSQL connection pool: 20 connections + 40 overflow per pod
- Run 3–5 FastAPI pods behind Nginx (already configured in `docker-compose.yml`)
- Redis handles session cache + Celery task queue
- Use `pg_isready` health checks before scaling
- For HRIS integration: add an import endpoint at `POST /api/v1/admin/import-users` (CSV or SCIM)

---

## Next Steps

1. **HRIS Integration** — bulk user import from your existing HR system (CSV or API)
2. **PDF Scorecard** — branded PDF export per employee using WeasyPrint
3. **SSO / SAML** — integrate with your org's identity provider
4. **Mobile app** — React Native using the same API
5. **Appeals workflow** — employee can dispute a rejected KPI
