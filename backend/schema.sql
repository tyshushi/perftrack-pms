-- ============================================================
-- Performance Management System — PostgreSQL Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('STAFF', 'MANAGER', 'MGR2', 'HOD', 'HR_ADMIN', 'SUPER_ADMIN');
CREATE TYPE kpi_status AS ENUM ('DRAFT', 'PENDING_MGR', 'PENDING_MGR2', 'PENDING_HOD', 'APPROVED', 'REJECTED', 'LOCKED');
CREATE TYPE eval_status AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED', 'FINALISED');
CREATE TYPE cycle_status AS ENUM ('DRAFT', 'KPI_SETTING', 'SELF_EVAL', 'MGR_EVAL', 'MGR2_EVAL', 'HOD_EVAL', 'CALIBRATION', 'COMPLETED');
CREATE TYPE kpi_type AS ENUM ('FIXED', 'OPTIONAL');
CREATE TYPE increment_status AS ENUM ('PENDING', 'FLAGGED', 'CONFIRMED', 'PUBLISHED');

-- ============================================================
-- DEPARTMENTS
-- ============================================================

CREATE TABLE departments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(20) UNIQUE NOT NULL,
    name            VARCHAR(100) NOT NULL,
    parent_id       UUID REFERENCES departments(id),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS & HIERARCHY
-- ============================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     VARCHAR(50) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    full_name       VARCHAR(150) NOT NULL,
    role            user_role NOT NULL DEFAULT 'STAFF',
    job_grade       VARCHAR(20),                          -- e.g. G1, G2, M1, M2
    department_id   UUID REFERENCES departments(id),
    manager_id      UUID REFERENCES users(id),            -- direct reporting line
    is_active       BOOLEAN DEFAULT TRUE,
    hashed_password TEXT NOT NULL,
    last_login      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Recursive CTE helper view: full reporting chain per user (up to 4 levels)
CREATE VIEW user_hierarchy AS
WITH RECURSIVE chain AS (
    SELECT id, full_name, role, manager_id, department_id, 0 AS depth
    FROM users WHERE is_active = TRUE
    UNION ALL
    SELECT u.id, u.full_name, u.role, u.manager_id, u.department_id, c.depth + 1
    FROM users u
    JOIN chain c ON u.id = c.manager_id
    WHERE c.depth < 4
)
SELECT * FROM chain;

-- ============================================================
-- PERFORMANCE CYCLES
-- ============================================================

CREATE TABLE performance_cycles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(100) NOT NULL,             -- e.g. "FY2026 Annual"
    year                INT NOT NULL,
    status              cycle_status NOT NULL DEFAULT 'DRAFT',

    -- Phase windows (HR configures)
    kpi_setting_start   DATE NOT NULL,
    kpi_setting_end     DATE NOT NULL,
    self_eval_start     DATE NOT NULL,
    self_eval_end       DATE NOT NULL,
    mgr_eval_start      DATE NOT NULL,
    mgr_eval_end        DATE NOT NULL,
    mgr2_eval_start     DATE,
    mgr2_eval_end       DATE,
    hod_eval_start      DATE,
    hod_eval_end        DATE,
    calibration_start   DATE,
    calibration_end     DATE,

    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WEIGHT RULES (per role or department per cycle)
-- ============================================================

CREATE TABLE weight_rules (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id            UUID NOT NULL REFERENCES performance_cycles(id) ON DELETE CASCADE,
    department_id       UUID REFERENCES departments(id),   -- NULL = applies to all depts
    job_grade           VARCHAR(20),                       -- NULL = applies to all grades
    category            VARCHAR(50) NOT NULL,              -- e.g. Financial, Customer, Internal, Learning
    min_weight          INT NOT NULL DEFAULT 0,            -- minimum % allowed
    max_weight          INT NOT NULL DEFAULT 100,          -- maximum % allowed
    fixed_weight        INT,                               -- if set, staff cannot change this
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_weight CHECK (min_weight >= 0 AND max_weight <= 100 AND min_weight <= max_weight)
);

-- ============================================================
-- KPI TEMPLATES (fixed KPIs cascaded by HR or Manager)
-- ============================================================

CREATE TABLE kpi_templates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id        UUID NOT NULL REFERENCES performance_cycles(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    category        VARCHAR(50) NOT NULL,
    kpi_type        kpi_type NOT NULL DEFAULT 'FIXED',
    weight          INT NOT NULL,                           -- % weight assigned
    target          VARCHAR(200) NOT NULL,
    measurement     TEXT,                                   -- how to measure this KPI

    -- Scope: who this template applies to
    department_id   UUID REFERENCES departments(id),        -- NULL = all departments
    job_grade       VARCHAR(20),                            -- NULL = all grades
    cascaded_by     UUID REFERENCES users(id),              -- HR or Manager who cascaded it
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- KPIs (per employee per cycle)
-- ============================================================

CREATE TABLE kpis (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id        UUID NOT NULL REFERENCES performance_cycles(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    template_id     UUID REFERENCES kpi_templates(id),     -- NULL if staff-created optional KPI

    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    category        VARCHAR(50) NOT NULL,
    kpi_type        kpi_type NOT NULL DEFAULT 'OPTIONAL',
    weight          INT NOT NULL,                           -- % of total score
    target          VARCHAR(200) NOT NULL,
    measurement     TEXT,

    -- Scores (each level fills in theirs)
    self_score      NUMERIC(3,1),
    mgr_score       NUMERIC(3,1),
    mgr2_score      NUMERIC(3,1),
    hod_score       NUMERIC(3,1),
    final_score     NUMERIC(3,1),                          -- computed: weighted avg of all scores

    -- Comments per level
    self_comment    TEXT,
    mgr_comment     TEXT,
    mgr2_comment    TEXT,
    hod_comment     TEXT,

    status          kpi_status NOT NULL DEFAULT 'DRAFT',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_weight_range CHECK (weight >= 0 AND weight <= 100),
    UNIQUE (cycle_id, user_id, name)
);

-- ============================================================
-- KPI AUDIT LOG (every status transition recorded)
-- ============================================================

CREATE TABLE kpi_audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kpi_id          UUID NOT NULL REFERENCES kpis(id),
    actor_id        UUID NOT NULL REFERENCES users(id),
    from_status     kpi_status,
    to_status       kpi_status NOT NULL,
    comment         TEXT,
    score_given     NUMERIC(3,1),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RATING SCALE (configurable per cycle by HR)
-- ============================================================

CREATE TABLE rating_scales (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id        UUID NOT NULL REFERENCES performance_cycles(id) ON DELETE CASCADE,
    score           NUMERIC(3,1) NOT NULL,                  -- e.g. 1, 2, 3, 4, 5
    label           VARCHAR(50) NOT NULL,                   -- e.g. "Outstanding"
    description     TEXT,
    color_hex       VARCHAR(7),                             -- UI display colour
    UNIQUE (cycle_id, score)
);

-- ============================================================
-- EMPLOYEE SCORECARDS (aggregate per employee per cycle)
-- ============================================================

CREATE TABLE scorecards (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id            UUID NOT NULL REFERENCES performance_cycles(id),
    user_id             UUID NOT NULL REFERENCES users(id),

    -- Weighted average scores
    self_total          NUMERIC(4,2),
    mgr_total           NUMERIC(4,2),
    mgr2_total          NUMERIC(4,2),
    hod_total           NUMERIC(4,2),
    final_score         NUMERIC(4,2),                       -- weighted composite

    -- Bell curve / forced ranking
    performance_band    VARCHAR(50),                        -- e.g. "Top Performer", "Meets Expectations"
    band_rank           INT,                                -- rank within department
    percentile          NUMERIC(5,2),

    -- Increment linkage
    increment_pct       NUMERIC(5,2),                       -- auto-calculated %
    increment_status    increment_status DEFAULT 'PENDING',
    increment_confirmed_by UUID REFERENCES users(id),
    increment_confirmed_at TIMESTAMPTZ,

    eval_status         eval_status NOT NULL DEFAULT 'NOT_STARTED',
    is_locked           BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE (cycle_id, user_id)
);

-- ============================================================
-- INCREMENT BANDS (HR configures per cycle)
-- ============================================================

CREATE TABLE increment_bands (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id        UUID NOT NULL REFERENCES performance_cycles(id) ON DELETE CASCADE,
    band_name       VARCHAR(50) NOT NULL,                   -- e.g. "Outstanding"
    min_score       NUMERIC(4,2) NOT NULL,
    max_score       NUMERIC(4,2) NOT NULL,
    increment_pct   NUMERIC(5,2) NOT NULL,                  -- % salary increment
    description     TEXT,
    CONSTRAINT chk_score_range CHECK (min_score >= 0 AND max_score <= 5)
);

-- ============================================================
-- BELL CURVE TARGETS (HR sets target distribution per cycle)
-- ============================================================

CREATE TABLE bell_curve_targets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id        UUID NOT NULL REFERENCES performance_cycles(id) ON DELETE CASCADE,
    department_id   UUID REFERENCES departments(id),        -- NULL = org-wide
    band_name       VARCHAR(50) NOT NULL,
    target_pct      NUMERIC(5,2) NOT NULL,                  -- e.g. 10% should be "Outstanding"
    CONSTRAINT chk_target CHECK (target_pct >= 0 AND target_pct <= 100)
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id),
    title           VARCHAR(200) NOT NULL,
    body            TEXT NOT NULL,
    type            VARCHAR(50),                            -- e.g. KPI_PENDING, EVAL_DUE, APPROVED
    reference_id    UUID,                                   -- kpi_id or scorecard_id
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_users_manager ON users(manager_id);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_kpis_cycle_user ON kpis(cycle_id, user_id);
CREATE INDEX idx_kpis_status ON kpis(status);
CREATE INDEX idx_kpi_audit_kpi ON kpi_audit_log(kpi_id);
CREATE INDEX idx_scorecards_cycle ON scorecards(cycle_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_weight_rules_cycle ON weight_rules(cycle_id, department_id);
