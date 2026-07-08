from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

from app.api.routes.auth import router as auth_router
from app.api.routes.users import router as users_router
from app.api.routes.departments import router as departments_router
from app.api.routes.cycles import router as cycles_router
from app.api.routes.weight_rules import router as weight_rules_router
from app.api.routes.kpi_templates import router as kpi_templates_router
from app.api.routes.kpis import router as kpis_router
from app.api.routes.evaluations import router as evaluations_router
from app.api.routes.scorecards import router as scorecards_router
from app.api.routes.increments import router as increments_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.admin import router as admin_router
from app.api.routes.groups import router as groups_router
from app.api.routes.roles import router as roles_router
from app.api.routes.settings import router as settings_router
from app.api.routes.reports import router as reports_router
from app.api.routes.email_logs import router as email_logs_router

MIGRATIONS = """
    DO $$ BEGIN ALTER TABLE users ADD COLUMN employment_unit VARCHAR(100);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ADD COLUMN division VARCHAR(100);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ADD COLUMN section VARCHAR(100);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ADD COLUMN position_title VARCHAR(150);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ADD COLUMN category VARCHAR(50);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ADD COLUMN country VARCHAR(100);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ADD COLUMN work_location VARCHAR(100);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ADD COLUMN employee_type VARCHAR(50);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ADD COLUMN hire_date DATE;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ADD COLUMN gender VARCHAR(20);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ADD COLUMN direct_manager_id UUID REFERENCES users(id);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ADD COLUMN reviewing_manager_id UUID REFERENCES users(id);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ADD COLUMN hod_id UUID REFERENCES users(id);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ADD COLUMN approval_levels INT DEFAULT 3;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE performance_cycles ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE kpis ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE kpis ALTER COLUMN kpi_type TYPE VARCHAR(20) USING kpi_type::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE kpi_templates ALTER COLUMN kpi_type TYPE VARCHAR(20) USING kpi_type::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE kpi_audit_log ALTER COLUMN from_status TYPE VARCHAR(20) USING from_status::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE kpi_audit_log ALTER COLUMN to_status TYPE VARCHAR(20) USING to_status::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE scorecards ALTER COLUMN eval_status TYPE VARCHAR(20) USING eval_status::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE scorecards ALTER COLUMN increment_status TYPE VARCHAR(20) USING increment_status::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(20) USING role::text;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE kpis ADD COLUMN cascaded_by UUID REFERENCES users(id);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE users ADD COLUMN hierarchy VARCHAR(50);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE kpis ADD COLUMN kpi_dimension VARCHAR(50);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN
    UPDATE kpis SET kpi_dimension = category WHERE kpi_dimension IS NULL;
    EXCEPTION WHEN others THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN fin_min INT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN fin_max INT DEFAULT 100;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN cust_min INT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN cust_max INT DEFAULT 100;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN ip_min INT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN ip_max INT DEFAULT 100;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN lg_min INT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN lg_max INT DEFAULT 100;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN lc_min INT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN lc_max INT DEFAULT 100;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN label VARCHAR(100);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN priority INT DEFAULT 0;
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN created_by UUID REFERENCES users(id);
    EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN UPDATE users SET email = lower(email) WHERE email <> lower(email);
    EXCEPTION WHEN others THEN NULL; END $$;

    DO $$ BEGIN
    CREATE TABLE IF NOT EXISTS groups (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        cycle_id    UUID REFERENCES performance_cycles(id),
        created_by  UUID REFERENCES users(id),
        is_active   BOOLEAN DEFAULT TRUE,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
    EXCEPTION WHEN duplicate_table THEN NULL; END $$;

    DO $$ BEGIN
    CREATE TABLE IF NOT EXISTS group_members (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        added_by   UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(group_id, user_id)
    );
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN hierarchy VARCHAR(50);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN user_category VARCHAR(50);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE weight_rules ADD COLUMN group_id UUID REFERENCES groups(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE kpi_templates ADD COLUMN kpi_dimension VARCHAR(50);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE kpi_templates ADD COLUMN min_weight INT DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE kpi_templates ADD COLUMN max_weight INT DEFAULT 100;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE kpi_templates ADD COLUMN hierarchy VARCHAR(50);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE kpi_templates ADD COLUMN user_category VARCHAR(50);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE kpi_templates ADD COLUMN group_id UUID REFERENCES groups(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE kpi_templates ADD COLUMN cascaded_by UUID REFERENCES users(id);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  DELETE FROM kpi_audit_log WHERE kpi_id IS NULL;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE performance_cycles ADD COLUMN rating_type VARCHAR(20) DEFAULT 'NUMERIC';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE performance_cycles ADD COLUMN rating_scale_max INT DEFAULT 5;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE performance_cycles ADD COLUMN rating_levels JSONB;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE kpis ADD COLUMN rating_targets JSONB;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE kpis ADD COLUMN actual_achievement TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE kpis ADD COLUMN self_rating NUMERIC(4,2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE kpis ADD COLUMN self_remarks TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE kpi_templates ADD COLUMN rating_targets JSONB;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS custom_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
    permission VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, permission)
  );
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role_id)
  );
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE performance_cycles ADD COLUMN approval_chain VARCHAR(20) DEFAULT 'DM_ONLY';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE performance_cycles ALTER COLUMN approval_chain TYPE TEXT USING approval_chain::text;
  ALTER TABLE performance_cycles ALTER COLUMN approval_chain SET DEFAULT '["DM"]';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  UPDATE performance_cycles SET approval_chain = '["DM"]' WHERE approval_chain IS NULL OR approval_chain = 'DM_ONLY';
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE users ADD COLUMN base_role VARCHAR(50) DEFAULT 'STAFF';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  UPDATE users SET role = 'MANAGER' WHERE role = 'MGR2';
EXCEPTION WHEN others THEN NULL; END $$;

-- NOTE: RBAC data seeding (system roles + permissions + user-role
-- assignments) intentionally does NOT run in these migrations. The
-- migrations only guarantee the RBAC *schema* (custom_roles /
-- role_permissions / user_roles tables) exists. The actual data seed
-- lives in RBAC_SEED and is applied by run_schema_and_seed() ONLY when
-- the custom_roles table is empty, so an existing deployment with
-- populated roles is never re-seeded.

DO $$ BEGIN
  INSERT INTO users (
    id, employee_id, email, full_name, role, hashed_password, is_active, job_grade
  ) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'EMP000',
    'superadmin@pms.local',
    'Super Admin',
    'SUPER_ADMIN',
    '$2b$12$b0L5ZNPU4hLN0K15lwjzWujAXwo0J6QbD9bZ3HVhsR54lkmkFTZZ2',
    true,
    'SA1'
  )
  ON CONFLICT (email) DO UPDATE SET
    hashed_password = '$2b$12$b0L5ZNPU4hLN0K15lwjzWujAXwo0J6QbD9bZ3HVhsR54lkmkFTZZ2',
    role = 'SUPER_ADMIN',
    is_active = true;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  );
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  INSERT INTO system_settings (key, value) VALUES ('manager_cascade_enabled', 'true')
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE kpis ADD COLUMN is_late BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE performance_cycles ADD COLUMN status VARCHAR(20) DEFAULT 'DRAFT';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(200) UNIQUE,
    to_email VARCHAR(255) NOT NULL,
    cc_emails TEXT,
    subject TEXT NOT NULL,
    template_name VARCHAR(100) NOT NULL,
    template_data JSONB,
    status VARCHAR(20) DEFAULT 'PENDING',
    attempt_count INT DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    provider_message_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
EXCEPTION WHEN duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
  CREATE INDEX IF NOT EXISTS idx_email_logs_idempotency ON email_logs(idempotency_key);
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  INSERT INTO system_settings (key, value) VALUES
    ('email_notifications_enabled', 'true'),
    ('email_test_mode', 'true')
  ON CONFLICT (key) DO NOTHING;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  INSERT INTO system_settings (key, value) VALUES
    ('max_kpis_per_scorecard', '10'),
    ('min_kpis_per_scorecard', '3')
  ON CONFLICT (key) DO NOTHING;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  INSERT INTO system_settings (key, value) VALUES
    ('global_min_weight_per_kpi', '5')
  ON CONFLICT (key) DO NOTHING;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE performance_cycles ADD COLUMN reminder_frequency VARCHAR(20) DEFAULT 'NONE';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE performance_cycles ADD COLUMN reminder_days_of_week JSON;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE performance_cycles ADD COLUMN reminder_day_of_month INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE performance_cycles ADD COLUMN last_reminder_sent_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE performance_cycles ADD COLUMN last_reminder_check_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE kpis ADD COLUMN hr_unlocked BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

"""


# Full RBAC seed: the 5 system roles, their permissions, and the user->role
# assignments for every existing user. This is applied by run_schema_and_seed()
# ONLY when the custom_roles table is empty (a fresh / un-seeded database), so
# an existing deployment that already has roles is never touched. Every
# statement is idempotent (ON CONFLICT DO NOTHING) as a belt-and-suspenders
# guard even inside the empty-table gate.
RBAC_SEED = """
-- 1. System roles (SUPER_ADMIN, HR_ADMIN, MANAGER, HOD, STAFF)
DO $$ BEGIN
  INSERT INTO custom_roles (name, description, is_system) VALUES
    ('SUPER_ADMIN', 'Full system access including role management', TRUE),
    ('HR_ADMIN', 'Full HR operations access', TRUE),
    ('MANAGER', 'Team management and scorecard approval', TRUE),
    ('HOD', 'Department head access', TRUE),
    ('STAFF', 'Standard employee access', TRUE)
  ON CONFLICT (name) DO NOTHING;
EXCEPTION WHEN others THEN NULL; END $$;

-- 2. Permissions for every system role
DO $$ BEGIN
  INSERT INTO role_permissions (role_id, permission)
  SELECT r.id, p.permission
  FROM custom_roles r
  CROSS JOIN (VALUES
    ('HR_ADMIN', 'view_employees'),
    ('HR_ADMIN', 'edit_employee_profiles'),
    ('HR_ADMIN', 'manage_reporting_lines'),
    ('HR_ADMIN', 'deactivate_employees'),
    ('HR_ADMIN', 'create_employees'),
    ('HR_ADMIN', 'view_own_scorecard'),
    ('HR_ADMIN', 'view_team_scorecards'),
    ('HR_ADMIN', 'view_all_scorecards'),
    ('HR_ADMIN', 'approve_scorecards'),
    ('HR_ADMIN', 'reject_scorecards'),
    ('HR_ADMIN', 'reset_scorecards'),
    ('HR_ADMIN', 'view_cycles'),
    ('HR_ADMIN', 'manage_cycles'),
    ('HR_ADMIN', 'manage_templates'),
    ('HR_ADMIN', 'cascade_kpis'),
    ('HR_ADMIN', 'manage_weight_rules'),
    ('HR_ADMIN', 'view_groups'),
    ('HR_ADMIN', 'manage_groups'),
    ('HR_ADMIN', 'view_team_dashboard'),
    ('HR_ADMIN', 'view_org_dashboard'),
    ('HR_ADMIN', 'manage_roles'),
    ('SUPER_ADMIN', 'view_employees'),
    ('SUPER_ADMIN', 'edit_employee_profiles'),
    ('SUPER_ADMIN', 'manage_reporting_lines'),
    ('SUPER_ADMIN', 'deactivate_employees'),
    ('SUPER_ADMIN', 'create_employees'),
    ('SUPER_ADMIN', 'view_own_scorecard'),
    ('SUPER_ADMIN', 'view_team_scorecards'),
    ('SUPER_ADMIN', 'view_all_scorecards'),
    ('SUPER_ADMIN', 'approve_scorecards'),
    ('SUPER_ADMIN', 'reject_scorecards'),
    ('SUPER_ADMIN', 'reset_scorecards'),
    ('SUPER_ADMIN', 'delete_scorecards'),
    ('SUPER_ADMIN', 'view_cycles'),
    ('SUPER_ADMIN', 'manage_cycles'),
    ('SUPER_ADMIN', 'manage_templates'),
    ('SUPER_ADMIN', 'cascade_kpis'),
    ('SUPER_ADMIN', 'manage_weight_rules'),
    ('SUPER_ADMIN', 'view_groups'),
    ('SUPER_ADMIN', 'manage_groups'),
    ('SUPER_ADMIN', 'view_team_dashboard'),
    ('SUPER_ADMIN', 'view_org_dashboard'),
    ('SUPER_ADMIN', 'manage_roles'),
    ('SUPER_ADMIN', 'manage_custom_roles'),
    ('MANAGER', 'view_own_scorecard'),
    ('MANAGER', 'view_team_scorecards'),
    ('MANAGER', 'approve_scorecards'),
    ('MANAGER', 'reject_scorecards'),
    ('MANAGER', 'cascade_kpis'),
    ('MANAGER', 'view_team_dashboard'),
    ('HOD', 'view_own_scorecard'),
    ('HOD', 'view_team_scorecards'),
    ('HOD', 'view_all_scorecards'),
    ('HOD', 'approve_scorecards'),
    ('HOD', 'reject_scorecards'),
    ('HOD', 'view_team_dashboard'),
    ('HOD', 'view_org_dashboard'),
    ('STAFF', 'view_own_scorecard')
  ) AS p(role_name, permission)
  WHERE r.name = p.role_name
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN others THEN NULL; END $$;

-- 3. Assign each existing user to their matching system role
DO $$ BEGIN
  INSERT INTO user_roles (user_id, role_id)
  SELECT u.id, r.id
  FROM users u
  JOIN custom_roles r ON r.name = u.role::text
  WHERE u.role::text IN ('SUPER_ADMIN', 'HR_ADMIN', 'MANAGER', 'HOD', 'STAFF')
  ON CONFLICT DO NOTHING;
EXCEPTION WHEN others THEN NULL; END $$;
"""


async def run_schema_and_seed():
    import asyncpg
    from sqlalchemy import text
    from app.db.session import engine, Base
    import app.models.user  # noqa: F401 — register every ORM model on Base.metadata

    raw_url = os.environ.get("DATABASE_URL", "")
    url = raw_url.replace("postgresql+asyncpg://", "postgresql://").replace("postgres://", "postgresql://")
    if not url:
        return

    # 1. Create all base tables from the SQLAlchemy models FIRST, so the
    #    ALTER TABLE / CREATE TABLE statements in MIGRATIONS have their target
    #    tables (and required extensions/types) already in place.
    try:
        async with engine.begin() as conn:
            # Prerequisites the ORM models and raw migrations depend on
            await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
            await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "pgcrypto"'))
            await conn.execute(text(
                "DO $$ BEGIN "
                "CREATE TYPE user_role AS ENUM "
                "('STAFF','MANAGER','MGR2','HOD','HR_ADMIN','SUPER_ADMIN'); "
                "EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
            ))
            # Create all base tables defined on the ORM models
            await conn.run_sync(Base.metadata.create_all)
        print("==> Base tables created (Base.metadata.create_all).")
    except Exception as base_e:
        import traceback
        print(f"==> Base table creation ERROR: {base_e}")
        traceback.print_exc()

    conn = None
    try:
        conn = await asyncpg.connect(url)
        # 2. Run migrations (adds columns / auxiliary tables to the base tables)
        await conn.execute(MIGRATIONS)
        print("==> Schema migrations complete.")

        # RBAC seeding — gated on the custom_roles table being EMPTY.
        #   * custom_roles has 0 rows  -> run the full RBAC seed (create the 5
        #     system roles + their permissions + assign roles to every user).
        #   * custom_roles has rows     -> skip; an already-seeded deployment is
        #     never re-seeded or mutated.
        try:
            cr_count = await conn.fetchval("SELECT COUNT(*) FROM custom_roles")
            print(f"==> RBAC: custom_roles count = {cr_count}")

            if cr_count == 0:
                print("==> RBAC: custom_roles is empty — running full RBAC seed...")
                await conn.execute(RBAC_SEED)

                # Verify the seed populated all three RBAC tables
                cr_after = await conn.fetchval("SELECT COUNT(*) FROM custom_roles")
                rp_after = await conn.fetchval("SELECT COUNT(*) FROM role_permissions")
                ur_after = await conn.fetchval("SELECT COUNT(*) FROM user_roles")
                print(f"==> RBAC: seeded custom_roles={cr_after} "
                      f"role_permissions={rp_after} user_roles={ur_after}")

                # Confirm all 5 system roles exist with their permission counts
                roles = await conn.fetch("""
                    SELECT r.name, COUNT(rp.id) AS perm_count
                    FROM custom_roles r
                    LEFT JOIN role_permissions rp ON rp.role_id = r.id
                    WHERE r.is_system = TRUE
                    GROUP BY r.name
                    ORDER BY r.name
                """)
                for row in roles:
                    print(f"==> RBAC role seeded: {row['name']} "
                          f"({row['perm_count']} permissions)")

                # Sample user->role assignments
                sample = await conn.fetch("""
                    SELECT u.email, u.role, r.name as role_name
                    FROM users u
                    JOIN user_roles ur ON ur.user_id = u.id
                    JOIN custom_roles r ON r.id = ur.role_id
                    LIMIT 5
                """)
                for row in sample:
                    print(f"==> RBAC sample: {row['email']} role={row['role']} "
                          f"custom_role={row['role_name']}")
            else:
                print(f"==> RBAC: custom_roles already has {cr_count} rows — "
                      f"skipping RBAC seed.")

        except Exception as rbac_e:
            import traceback
            print(f"==> RBAC seeding ERROR: {rbac_e}")
            traceback.print_exc()

        # Base tables already exist (created via Base.metadata.create_all above),
        # so seed only when the database is empty of data rather than of tables.
        result = await conn.fetchval("SELECT COUNT(*) FROM users")
        if result == 0:
            print("==> Running seed.sql...")
            await conn.execute(open("seed.sql").read())
            print(f"==> Loaded seed.sql with {result} rows")
            print("==> Database ready!")
        else:
            print(f"==> Database already has {result} users, skipping seed.")
    except Exception as e:
        import traceback
        print(f"==> DB init ERROR: {e}")
        traceback.print_exc()
    finally:
        if conn:
            await conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_schema_and_seed()
    yield


app = FastAPI(
    title="Performance Management System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://tyshushi.github.io"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

app.include_router(auth_router,          prefix="/api/v1/auth",          tags=["Auth"])
app.include_router(users_router,         prefix="/api/v1/users",         tags=["Users"])
app.include_router(departments_router,   prefix="/api/v1/departments",   tags=["Departments"])
app.include_router(cycles_router,        prefix="/api/v1/cycles",        tags=["Cycles"])
app.include_router(weight_rules_router,  prefix="/api/v1/weight-rules",  tags=["Weight Rules"])
app.include_router(kpi_templates_router, prefix="/api/v1/kpi-templates", tags=["KPI Templates"])
app.include_router(kpis_router,          prefix="/api/v1/kpis",          tags=["KPIs"])
app.include_router(evaluations_router,   prefix="/api/v1/evaluations",   tags=["Evaluations"])
app.include_router(scorecards_router,    prefix="/api/v1/scorecards",    tags=["Scorecards"])
app.include_router(increments_router,    prefix="/api/v1/increments",    tags=["Increments"])
app.include_router(notifications_router, prefix="/api/v1/notifications", tags=["Notifications"])
app.include_router(admin_router,         prefix="/api/v1/admin",         tags=["Admin"])
app.include_router(groups_router,        prefix="/api/v1/groups",        tags=["Groups"])
app.include_router(roles_router,         prefix="/api/v1/roles",         tags=["Roles"])
app.include_router(settings_router,      prefix="/api/v1/settings",      tags=["Settings"])
app.include_router(reports_router,       prefix="/api/v1/reports",        tags=["Reports"])
app.include_router(email_logs_router,    prefix="/api/v1/email-logs",     tags=["Email Logs"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "PMS API v1.0"}
