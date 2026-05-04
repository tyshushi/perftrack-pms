-- ============================================================
-- Performance Management System — PostgreSQL Schema
-- Full schema with manager-based approval chain
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id          VARCHAR(50) UNIQUE NOT NULL,
    email                VARCHAR(255) UNIQUE NOT NULL,
    full_name            VARCHAR(150) NOT NULL,
    role                 VARCHAR(20) NOT NULL DEFAULT 'STAFF',
    job_grade            VARCHAR(20),

    -- Org structure fields (from CSV)
    employment_unit      VARCHAR(100),
    department_id        UUID REFERENCES departments(id),
    division             VARCHAR(100),
    section              VARCHAR(100),
    position_title       VARCHAR(150),
    category             VARCHAR(50),
    country              VARCHAR(100),
    work_location        VARCHAR(100),
    employee_type        VARCHAR(50),
    hire_date            DATE,
    gender               VARCHAR(20),

    -- Legacy single manager (kept for compatibility)
    manager_id           UUID REFERENCES users(id),

    -- Explicit approval chain (assigned per employee)
    direct_manager_id    UUID REFERENCES users(id),
    reviewing_manager_id UUID REFERENCES users(id),
    hod_id               UUID REFERENCES users(id),
    approval_levels      INT DEFAULT 3,

    is_active            BOOLEAN DEFAULT TRUE,
    hashed_password      TEXT NOT NULL,
    last_login           TIMESTAMPTZ,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PERFORMANCE CYCLES
-- ============================================================

CREATE TABLE performance_cycles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(100) NOT NULL,
    year                INT NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'DRAFT',

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
-- WEIGHT RULES (per category, per dept/grade per cycle)
-- ============================================================

CREATE TABLE weight_rules (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id            UUID NOT NULL REFERENCES performance_cycles(id) ON DELETE CASCADE,
    department_id       UUID REFERENCES departments(id),
    job_grade           VARCHAR(20),
    category            VARCHAR(50) NOT NULL,
    min_weight          INT NOT NULL DEFAULT 0,
    max_weight          INT NOT NULL DEFAULT 100,
    fixed_weight        INT,
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
    kpi_type        VARCHAR(20) NOT NULL DEFAULT 'FIXED',
    weight          INT NOT NULL,
    target          VARCHAR(200) NOT NULL,
    measurement     TEXT,
    department_id   UUID REFERENCES departments(id),
    job_grade       VARCHAR(20),
    cascaded_by     UUID REFERENCES users(id),
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
    template_id     UUID REFERENCES kpi_templates(id),

    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    category        VARCHAR(50) NOT NULL,
    kpi_type        VARCHAR(20) NOT NULL DEFAULT 'OPTIONAL',
    weight          INT NOT NULL,
    target          VARCHAR(200) NOT NULL,
    measurement     TEXT,

    -- Scores per approval level
    self_score      NUMERIC(3,1),
    mgr_score       NUMERIC(3,1),   -- direct manager score
    mgr2_score      NUMERIC(3,1),   -- reviewing manager score
    hod_score       NUMERIC(3,1),   -- HOD score
    final_score     NUMERIC(3,1),

    -- Comments per level
    self_comment    TEXT,
    mgr_comment     TEXT,
    mgr2_comment    TEXT,
    hod_comment     TEXT,

    -- Status uses manager-based pending states
    -- DRAFT | PENDING_DM | PENDING_RM | PENDING_HOD | APPROVED | REJECTED | LOCKED
    status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT',

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_kpi_weight CHECK (weight >= 0 AND weight <= 100),
    UNIQUE (cycle_id, user_id, name)
);

-- ============================================================
-- KPI AUDIT LOG
-- ============================================================

CREATE TABLE kpi_audit_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kpi_id          UUID NOT NULL REFERENCES kpis(id),
    actor_id        UUID NOT NULL REFERENCES users(id),
    from_status     VARCHAR(20),
    to_status       VARCHAR(20) NOT NULL,
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
    score           NUMERIC(3,1) NOT NULL,
    label           VARCHAR(50) NOT NULL,
    description     TEXT,
    color_hex       VARCHAR(7),
    UNIQUE (cycle_id, score)
);

-- ============================================================
-- SCORECARDS (aggregate per employee per cycle)
-- ============================================================

CREATE TABLE scorecards (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id            UUID NOT NULL REFERENCES performance_cycles(id),
    user_id             UUID NOT NULL REFERENCES users(id),

    -- Weighted totals
    self_total          NUMERIC(4,2),
    mgr_total           NUMERIC(4,2),   -- direct manager weighted avg
    mgr2_total          NUMERIC(4,2),   -- reviewing manager weighted avg
    hod_total           NUMERIC(4,2),
    final_score         NUMERIC(4,2),

    -- Bell curve / ranking
    performance_band    VARCHAR(50),
    band_rank           INT,
    percentile          NUMERIC(5,2),

    -- Increment
    increment_pct           NUMERIC(5,2),
    increment_status        VARCHAR(20) DEFAULT 'PENDING',
    increment_confirmed_by  UUID REFERENCES users(id),
    increment_confirmed_at  TIMESTAMPTZ,

    eval_status         VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
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
    band_name       VARCHAR(50) NOT NULL,
    min_score       NUMERIC(4,2) NOT NULL,
    max_score       NUMERIC(4,2) NOT NULL,
    increment_pct   NUMERIC(5,2) NOT NULL,
    description     TEXT,
    CONSTRAINT chk_score_range CHECK (min_score >= 0 AND max_score <= 5)
);

-- ============================================================
-- BELL CURVE TARGETS
-- ============================================================

CREATE TABLE bell_curve_targets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id        UUID NOT NULL REFERENCES performance_cycles(id) ON DELETE CASCADE,
    department_id   UUID REFERENCES departments(id),
    band_name       VARCHAR(50) NOT NULL,
    target_pct      NUMERIC(5,2) NOT NULL,
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
    type            VARCHAR(50),
    reference_id    UUID,
    is_read         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_users_manager          ON users(manager_id);
CREATE INDEX idx_users_direct_manager   ON users(direct_manager_id);
CREATE INDEX idx_users_reviewing_manager ON users(reviewing_manager_id);
CREATE INDEX idx_users_hod              ON users(hod_id);
CREATE INDEX idx_users_department       ON users(department_id);
CREATE INDEX idx_kpis_cycle_user        ON kpis(cycle_id, user_id);
CREATE INDEX idx_kpis_status            ON kpis(status);
CREATE INDEX idx_kpi_audit_kpi          ON kpi_audit_log(kpi_id);
CREATE INDEX idx_scorecards_cycle       ON scorecards(cycle_id);
CREATE INDEX idx_notifications_user     ON notifications(user_id, is_read);
CREATE INDEX idx_weight_rules_cycle     ON weight_rules(cycle_id, department_id);
