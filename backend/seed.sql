-- ============================================================
-- Seed Data — Demo accounts and sample cycle
-- Passwords are all: demo1234
-- bcrypt hash of "demo1234"
-- ============================================================

-- Departments
INSERT INTO departments (id, code, name) VALUES
  ('11111111-0000-0000-0000-000000000001', 'FIN',  'Finance'),
  ('11111111-0000-0000-0000-000000000002', 'OPS',  'Operations'),
  ('11111111-0000-0000-0000-000000000003', 'TECH', 'Technology'),
  ('11111111-0000-0000-0000-000000000004', 'HR',   'Human Resources');

-- Users (password: demo1234)
INSERT INTO users (id, employee_id, email, full_name, role, job_grade, department_id, manager_id, hashed_password) VALUES
  ('22222222-0000-0000-0000-000000000001', 'EMP001', 'hradmin@pms.local',  'Siti Norzahra',   'HR_ADMIN', 'M3', '11111111-0000-0000-0000-000000000004', NULL,
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMaRFbEGWANZ3jGHm.PwYrKfMa'),
  ('22222222-0000-0000-0000-000000000002', 'EMP002', 'hod@pms.local',      'David Chong',     'HOD',      'D1', '11111111-0000-0000-0000-000000000001', NULL,
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMaRFbEGWANZ3jGHm.PwYrKfMa'),
  ('22222222-0000-0000-0000-000000000003', 'EMP003', 'mgr2@pms.local',     'Priya Lim',       'MGR2',     'M2', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMaRFbEGWANZ3jGHm.PwYrKfMa'),
  ('22222222-0000-0000-0000-000000000004', 'EMP004', 'manager@pms.local',  'Marcus Tan',      'MANAGER',  'M1', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMaRFbEGWANZ3jGHm.PwYrKfMa'),
  ('22222222-0000-0000-0000-000000000005', 'EMP005', 'staff@pms.local',    'Aisha Rahman',    'STAFF',    'G2', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMaRFbEGWANZ3jGHm.PwYrKfMa'),
  ('22222222-0000-0000-0000-000000000006', 'EMP006', 'staff2@pms.local',   'Raj Krishnan',    'STAFF',    'G1', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMaRFbEGWANZ3jGHm.PwYrKfMa');

-- Performance Cycle
INSERT INTO performance_cycles (id, name, year, status, kpi_setting_start, kpi_setting_end, self_eval_start, self_eval_end, mgr_eval_start, mgr_eval_end, mgr2_eval_start, mgr2_eval_end, hod_eval_start, hod_eval_end, calibration_start, calibration_end, created_by)
VALUES (
  '33333333-0000-0000-0000-000000000001',
  'FY2026 Annual Performance Review', 2026,
  'KPI_SETTING',
  '2026-01-15', '2026-02-14',
  '2026-03-01', '2026-03-31',
  '2026-04-01', '2026-04-30',
  '2026-05-01', '2026-05-15',
  '2026-05-16', '2026-05-31',
  '2026-06-01', '2026-06-15',
  '22222222-0000-0000-0000-000000000001'
);

-- Rating Scale
INSERT INTO rating_scales (cycle_id, score, label, description, color_hex) VALUES
  ('33333333-0000-0000-0000-000000000001', 1, 'Unsatisfactory',     'Consistently below expectations',       '#991b1b'),
  ('33333333-0000-0000-0000-000000000001', 2, 'Needs Improvement',  'Partially meets expectations',          '#854d0e'),
  ('33333333-0000-0000-0000-000000000001', 3, 'Meets Expectations', 'Consistently meets all expectations',   '#166534'),
  ('33333333-0000-0000-0000-000000000001', 4, 'Exceeds Expectations','Frequently exceeds expectations',      '#1d4ed8'),
  ('33333333-0000-0000-0000-000000000001', 5, 'Outstanding',        'Consistently far exceeds expectations', '#6b21a8');

-- Increment Bands
INSERT INTO increment_bands (cycle_id, band_name, min_score, max_score, increment_pct, description) VALUES
  ('33333333-0000-0000-0000-000000000001', 'Outstanding',          4.5, 5.0, 12.0, 'Top performers — 12% increment'),
  ('33333333-0000-0000-0000-000000000001', 'Exceeds Expectations', 3.5, 4.49, 8.0, 'Strong performers — 8% increment'),
  ('33333333-0000-0000-0000-000000000001', 'Meets Expectations',   2.5, 3.49, 5.0, 'Solid contributors — 5% increment'),
  ('33333333-0000-0000-0000-000000000001', 'Needs Improvement',    1.5, 2.49, 2.0, 'Development needed — 2% increment'),
  ('33333333-0000-0000-0000-000000000001', 'Unsatisfactory',       0.0, 1.49, 0.0, 'No increment — PIP required');

-- Bell Curve Targets
INSERT INTO bell_curve_targets (cycle_id, department_id, band_name, target_pct) VALUES
  ('33333333-0000-0000-0000-000000000001', NULL, 'Outstanding',          10.0),
  ('33333333-0000-0000-0000-000000000001', NULL, 'Exceeds Expectations', 25.0),
  ('33333333-0000-0000-0000-000000000001', NULL, 'Meets Expectations',   50.0),
  ('33333333-0000-0000-0000-000000000001', NULL, 'Needs Improvement',    10.0),
  ('33333333-0000-0000-0000-000000000001', NULL, 'Unsatisfactory',        5.0);

-- Weight Rules (Finance dept — G2 grade)
INSERT INTO weight_rules (cycle_id, department_id, job_grade, category, min_weight, max_weight, fixed_weight, created_by) VALUES
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'G2', 'Financial', 25, 40, NULL, '22222222-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'G2', 'Customer',  15, 30, NULL, '22222222-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'G2', 'Internal',  10, 25, NULL, '22222222-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'G2', 'Learning',   5, 15, NULL, '22222222-0000-0000-0000-000000000001');

-- KPI Templates (fixed KPIs cascaded by HR)
INSERT INTO kpi_templates (cycle_id, name, description, category, kpi_type, weight, target, department_id, cascaded_by) VALUES
  ('33333333-0000-0000-0000-000000000001', 'Revenue Target Achievement', 'Achieve annual revenue target for assigned portfolio', 'Financial', 'FIXED', 30, 'RM 2.5M', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001'),
  ('33333333-0000-0000-0000-000000000001', 'Compliance & Audit',         'Maintain zero major audit findings',                  'Internal',  'FIXED', 10, 'Zero major findings', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001');

-- Sample KPIs for Aisha (staff)
INSERT INTO kpis (id, cycle_id, user_id, name, category, kpi_type, weight, target, status, self_score, mgr_score, self_comment, mgr_comment) VALUES
  (uuid_generate_v4(), '33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000005',
   'Revenue Target Achievement', 'Financial', 'FIXED', 30, 'RM 2.5M', 'PENDING_MGR2',
   4, 3, 'Achieved 92% of target despite difficult market conditions in Q3.',
   'Good effort but fell short of target. Needs stronger pipeline management.'),
  (uuid_generate_v4(), '33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000005',
   'Customer Satisfaction Score', 'Customer', 'OPTIONAL', 25, '4.5 / 5.0', 'PENDING_MGR',
   5, NULL, 'NPS improved from 72 to 81. Implemented new feedback loop.', NULL),
  (uuid_generate_v4(), '33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000005',
   'Process Efficiency Improvement', 'Internal', 'OPTIONAL', 20, '15% cost reduction', 'APPROVED',
   4, 4, 'Automated 3 manual reports. Saved 12 hours/week team time.', 'Solid delivery. Good initiative.'),
  (uuid_generate_v4(), '33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000005',
   'Compliance & Audit', 'Internal', 'FIXED', 10, 'Zero major findings', 'LOCKED',
   5, 5, 'Zero audit findings across all 4 quarterly reviews.', 'Outstanding compliance record.'),
  (uuid_generate_v4(), '33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000005',
   'Professional Development', 'Learning', 'OPTIONAL', 15, '2 certifications completed', 'DRAFT',
   NULL, NULL, NULL, NULL);

-- Notifications
INSERT INTO notifications (user_id, title, body, type, is_read) VALUES
  ('22222222-0000-0000-0000-000000000005', 'KPI review reminder',
   '3 KPIs are awaiting your self-evaluation. Deadline: 31 March 2026.', 'EVAL_DUE', false),
  ('22222222-0000-0000-0000-000000000005', 'KPI approved',
   '"Process Efficiency Improvement" has been fully approved.', 'KPI_APPROVED', false),
  ('22222222-0000-0000-0000-000000000004', 'KPI Pending Your Review',
   'Aisha Rahman has submitted "Customer Satisfaction Score" for your review.', 'KPI_PENDING', false);
