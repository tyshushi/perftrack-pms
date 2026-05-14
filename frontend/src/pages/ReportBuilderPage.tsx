import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { cyclesApi, departmentsApi, usersApi, groupsApi, reportsApi } from '../api/client';
import { generateCustomReport } from '../utils/excelExport';

// ── Palette & styles ──────────────────────────────────────────────────────────

const C = {
  bg:          '#ffffff',
  bgSecondary: '#f7f7f5',
  bgTertiary:  '#efefec',
  text:        '#1a1a1a',
  textSecond:  '#6b6b6b',
  textTert:    '#9a9a9a',
  border:      '#dcdcd6',
  borderLight: '#ececea',
  warn:        '#b45309',
  warnBg:      '#fef3c7',
  danger:      '#b91c1c',
  dangerBg:    '#fee2e2',
  info:        '#0369a1',
  infoBg:      '#e0f2fe',
  font:        '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
};

const S = {
  card: {
    background: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    marginBottom: 18,
  } as React.CSSProperties,

  cardHeader: {
    padding: '12px 20px',
    borderBottom: `1px solid ${C.borderLight}`,
    background: C.bgSecondary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: '10px 10px 0 0',
  } as React.CSSProperties,

  cardTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: C.textSecond,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  } as React.CSSProperties,

  cardBody: {
    padding: '20px',
  } as React.CSSProperties,

  label: {
    fontSize: 11,
    fontWeight: 500,
    color: C.textSecond,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    display: 'block',
    marginBottom: 6,
  } as React.CSSProperties,

  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  } as React.CSSProperties,

  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  } as React.CSSProperties,

  divider: {
    height: '0.5px',
    background: C.borderLight,
    margin: '16px 0',
  } as React.CSSProperties,

  badge: (color: string, bg: string) => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 500,
    color,
    background: bg,
  }) as React.CSSProperties,

  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontSize: 13,
    color: C.text,
    cursor: 'pointer',
    userSelect: 'none' as const,
    padding: '1px 0',
  } as React.CSSProperties,
};

function btn(variant: 'primary' | 'secondary' | 'ghost' = 'primary', extra?: React.CSSProperties): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '8px 18px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: C.font,
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'opacity 0.12s',
    ...extra,
  };
  if (variant === 'primary') return { ...base, background: C.text, color: '#fff' };
  if (variant === 'secondary') return { ...base, background: C.bgTertiary, color: C.text, border: `1px solid ${C.border}` };
  return { ...base, background: 'transparent', color: C.textSecond, padding: '4px 8px' };
}

// ── MultiSelect dropdown ──────────────────────────────────────────────────────

interface MSOption { value: string; label: string }

function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  searchable = false,
  maxHeight = 220,
}: {
  options: MSOption[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  maxHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = searchable
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = (val: string) => {
    if (selected.includes(val)) onChange(selected.filter(v => v !== val));
    else onChange([...selected, val]);
  };

  const label = selected.length
    ? `${selected.length} selected`
    : (placeholder ?? 'Select…');

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '7px 10px',
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          background: C.bg,
          cursor: 'pointer',
          fontSize: 13,
          color: selected.length ? C.text : C.textTert,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none',
        }}
      >
        <span>{label}</span>
        <span style={{ fontSize: 9, color: C.textTert, marginLeft: 6 }}>▼</span>
      </div>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          width: '100%',
          zIndex: 1000,
          background: '#ffffff',
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          maxHeight: maxHeight ?? 240,
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}>
          {searchable && (
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 10px',
                border: 'none',
                borderBottom: `1px solid ${C.borderLight}`,
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
                fontFamily: C.font,
              }}
            />
          )}
          {filtered.length === 0 && (
            <div style={{ padding: '10px 12px', color: C.textTert, fontSize: 13 }}>No options</div>
          )}
          {filtered.map(o => (
            <div
              key={o.value}
              onClick={() => toggle(o.value)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 12px',
                cursor: 'pointer',
                fontSize: 13,
                background: selected.includes(o.value) ? C.bgSecondary : 'transparent',
                color: C.text,
              }}
            >
              <input
                type="checkbox"
                readOnly
                checked={selected.includes(o.value)}
                style={{ cursor: 'pointer', flexShrink: 0 }}
              />
              <span>{o.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Column group checkbox panel ───────────────────────────────────────────────

interface ColDef { key: string; label: string }

function ColumnGroup({
  title,
  columns,
  selected,
  onChange,
  requiresBm,
  bmEnabled,
}: {
  title: string;
  columns: ColDef[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  requiresBm?: boolean;
  bmEnabled: boolean;
}) {
  const disabled = !!requiresBm && !bmEnabled;

  const selectAll = () => {
    const next = new Set(selected);
    columns.forEach(c => next.add(c.key));
    onChange(next);
  };

  const clearAll = () => {
    const next = new Set(selected);
    columns.forEach(c => next.delete(c.key));
    onChange(next);
  };

  return (
    <div style={{ marginBottom: 22 }}>
      {/* Group header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: disabled ? C.textTert : C.text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </span>
        {requiresBm && (
          <span style={S.badge(C.warn, C.warnBg)}>Requires KPI Breakdown Mode</span>
        )}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button
            onClick={selectAll}
            disabled={disabled}
            style={{ ...btn('ghost'), fontSize: 12, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            Select All
          </button>
          <button
            onClick={clearAll}
            disabled={disabled}
            style={{ ...btn('ghost'), fontSize: 12, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Column checkboxes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
        gap: '5px 12px',
        opacity: disabled ? 0.4 : 1,
      }}>
        {columns.map(col => (
          <label key={col.key} style={S.checkRow}>
            <input
              type="checkbox"
              checked={selected.has(col.key)}
              disabled={disabled}
              onChange={e => {
                const next = new Set(selected);
                if (e.target.checked) next.add(col.key);
                else next.delete(col.key);
                onChange(next);
              }}
              style={{ cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, color: disabled ? C.textTert : C.text }}>{col.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Column definitions ────────────────────────────────────────────────────────

const DEMO_COLS: ColDef[] = [
  { key: 'employee_id',    label: 'Employee ID' },
  { key: 'full_name',      label: 'Full Name' },
  { key: 'email',          label: 'Email' },
  { key: 'department',     label: 'Department' },
  { key: 'division',       label: 'Division' },
  { key: 'section',        label: 'Section' },
  { key: 'position_title', label: 'Position' },
  { key: 'job_grade',      label: 'Grade' },
  { key: 'category',       label: 'Category' },
  { key: 'employee_type',  label: 'Employee Type' },
  { key: 'country',        label: 'Country' },
  { key: 'work_location',  label: 'Location' },
  { key: 'hire_date',      label: 'Hire Date' },
  { key: 'gender',         label: 'Gender' },
];

const REPORTING_COLS: ColDef[] = [
  { key: 'direct_manager',    label: 'Direct Manager' },
  { key: 'reviewing_manager', label: 'Reviewing Manager' },
  { key: 'hod',               label: 'HOD' },
];

const SCORECARD_COLS: ColDef[] = [
  { key: 'cycle_name',          label: 'Cycle' },
  { key: 'cycle_year',          label: 'Year' },
  { key: 'scorecard_status',    label: 'Status' },
  { key: 'is_late',             label: 'Is Late' },
  { key: 'kpi_count',           label: 'KPI Count' },
  { key: 'self_rating_overall', label: 'Self Rating Overall' },
  { key: 'mgr_rating_overall',  label: 'Manager Rating Overall' },
  { key: 'fin_weight',          label: 'Financials %' },
  { key: 'cust_weight',         label: 'Customer %' },
  { key: 'ip_weight',           label: 'Internal Process %' },
  { key: 'lg_weight',           label: 'Learning & Growth %' },
  { key: 'lc_weight',           label: 'Leadership & Culture %' },
];

const KPI_DETAIL_COLS: ColDef[] = [
  { key: 'kpi_name',        label: 'KPI Name' },
  { key: 'kpi_dimension',   label: 'Dimension' },
  { key: 'kpi_weight',      label: 'Weight' },
  { key: 'kpi_measurement', label: 'Measurement' },
  { key: 'kpi_type',        label: 'KPI Type' },
  { key: 'rating_target_1', label: 'Rating 1 (Target)' },
  { key: 'rating_target_2', label: 'Rating 2 (Target)' },
  { key: 'rating_target_3', label: 'Rating 3 (Target)' },
  { key: 'rating_target_4', label: 'Rating 4 (Target)' },
  { key: 'rating_target_5', label: 'Rating 5 (Target)' },
];

const KPI_SCORE_COLS: ColDef[] = [
  { key: 'kpi_self_rating',           label: 'Self Rating' },
  { key: 'kpi_self_rating_label',     label: 'Self Rating Label' },
  { key: 'kpi_mgr_rating',            label: 'Manager Rating' },
  { key: 'kpi_mgr_rating_label',      label: 'Manager Rating Label' },
  { key: 'kpi_weighted_contribution', label: 'Weighted Contribution' },
  { key: 'kpi_actual_achievement',    label: 'Actual Achievement' },
  { key: 'kpi_self_remarks',          label: 'Self Remarks' },
  { key: 'kpi_mgr_comment',           label: 'Manager Comment' },
  { key: 'kpi_status',                label: 'KPI Status' },
  { key: 'kpi_is_late',               label: 'KPI Is Late' },
];

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', fontSize: 13 }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 38,
          height: 22,
          borderRadius: 11,
          background: checked ? C.text : C.bgTertiary,
          border: `1px solid ${checked ? C.text : C.border}`,
          position: 'relative',
          transition: 'background 0.15s',
          flexShrink: 0,
          cursor: 'pointer',
        }}
      >
        <div style={{
          position: 'absolute',
          top: 2,
          left: checked ? 17 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.15s',
        }} />
      </div>
      <span style={{ color: C.text }}>{label}</span>
    </label>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReportBuilderPage() {
  // ─ Scope state ─
  const [cycleIds, setCycleIds]       = useState<string[]>([]);
  const [deptIds, setDeptIds]         = useState<string[]>([]);
  const [divisions, setDivisions]     = useState<string[]>([]);
  const [jobGrades, setJobGrades]     = useState<string[]>([]);
  const [categories, setCategories]   = useState<string[]>([]);
  const [groupIds, setGroupIds]       = useState<string[]>([]);
  const [dmIds, setDmIds]             = useState<string[]>([]);
  const [hodIds, setHodIds]           = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ─ Column state ─
  const [selectedCols, setSelectedCols] = useState<Set<string>>(
    new Set(['employee_id', 'full_name', 'email', 'department', 'cycle_name', 'cycle_year', 'scorecard_status', 'self_rating_overall', 'mgr_rating_overall'])
  );
  const [bmMode, setBmMode] = useState(false);

  // ─ Preview state ─
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewing, setPreviewing]     = useState(false);

  // ─ Data fetches ─
  const { data: cycles = [] }      = useQuery({ queryKey: ['cycles'], queryFn: () => cyclesApi.list().then(r => r.data) });
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: () => departmentsApi.list().then(r => r.data) });
  const { data: allUsers = [] }    = useQuery({ queryKey: ['users-all'], queryFn: () => usersApi.list().then(r => r.data) });
  const { data: filterOpts }       = useQuery({ queryKey: ['report-filter-opts'], queryFn: () => reportsApi.filterOptions().then(r => r.data) });
  const { data: groups = [] }      = useQuery({ queryKey: ['groups'], queryFn: () => groupsApi.list().then(r => r.data) });

  // ─ Build mutation ─
  const buildMut = useMutation({
    mutationFn: (payload: any) => reportsApi.build(payload),
    onSuccess: (res: any) => {
      const data = res.data as any[];
      const columns = Array.from(selectedCols) as string[];
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      generateCustomReport(data, columns, `custom_report_${date}.xlsx`);
    },
  });

  // ─ Helpers ─
  function buildPayload() {
    return {
      cycle_ids: cycleIds,
      scope: {
        department_ids:     deptIds.length     ? deptIds     : null,
        divisions:          divisions.length   ? divisions   : null,
        job_grades:         jobGrades.length   ? jobGrades   : null,
        categories:         categories.length  ? categories  : null,
        group_ids:          groupIds.length    ? groupIds    : null,
        direct_manager_ids: dmIds.length       ? dmIds       : null,
        hod_ids:            hodIds.length      ? hodIds      : null,
        employee_ids:       employeeIds.length ? employeeIds : null,
      },
      columns: Array.from(selectedCols),
      kpi_breakdown_mode: bmMode,
    };
  }

  async function handlePreview() {
    if (!cycleIds.length) return;
    setPreviewing(true);
    try {
      const res = await reportsApi.preview(buildPayload());
      setPreviewCount(res.data.count);
    } catch {
      setPreviewCount(null);
    } finally {
      setPreviewing(false);
    }
  }

  function handleGenerate() {
    if (!cycleIds.length || !selectedCols.size) return;
    buildMut.mutate(buildPayload());
  }

  // ─ Options ─
  const fo = filterOpts as any;
  const cycleOpts: MSOption[]  = (cycles as any[]).map((c: any) => ({ value: c.id, label: `${c.name} (${c.year})` }));
  const deptOpts: MSOption[]   = (departments as any[]).map((d: any) => ({ value: d.id, label: d.name }));
  const divOpts: MSOption[]    = (fo?.divisions ?? []).map((d: string) => ({ value: d, label: d }));
  const gradeOpts: MSOption[]  = (fo?.job_grades ?? []).map((g: string) => ({ value: g, label: g }));
  const catOpts: MSOption[]    = (fo?.categories ?? []).map((c: string) => ({ value: c, label: c }));
  const groupOpts: MSOption[]  = (groups as any[]).map((g: any) => ({ value: g.id, label: g.name }));
  const userOpts: MSOption[]   = (allUsers as any[]).map((u: any) => ({ value: u.id, label: `${u.full_name} (${u.employee_id})` }));

  const canGenerate = cycleIds.length > 0 && selectedCols.size > 0 && !buildMut.isPending;
  const canPreview  = cycleIds.length > 0 && !previewing;

  // ─ Render ─
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', fontFamily: C.font, color: C.text }}>

      {/* Page title */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 21, fontWeight: 600, marginBottom: 3 }}>Report Builder</div>
        <div style={{ fontSize: 13, color: C.textSecond }}>
          Build a custom export across one or more performance cycles with full column control.
        </div>
      </div>

      {/* ── SECTION 1: SCOPE ─────────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>Section 1 — Scope</span>
          {previewCount !== null && (
            <span style={S.badge(C.info, C.infoBg)}>
              Will include {previewCount} employee{previewCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={S.cardBody}>

          {/* Cycle selector */}
          <div style={{ marginBottom: 16 }}>
            <span style={S.label}>Performance Cycle(s) *</span>
            <MultiSelect
              options={cycleOpts}
              selected={cycleIds}
              onChange={v => { setCycleIds(v); setPreviewCount(null); }}
              placeholder="Select one or more cycles…"
            />
          </div>

          {/* Filters toggle */}
          <div
            onClick={() => setFiltersOpen(o => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              color: C.textSecond,
              fontSize: 13,
              userSelect: 'none',
              marginBottom: filtersOpen ? 14 : 0,
            }}
          >
            <span style={{ fontSize: 9 }}>{filtersOpen ? '▼' : '▶'}</span>
            <span>Scope filters (department, division, grade, manager…)</span>
            {[deptIds, divisions, jobGrades, categories, groupIds, dmIds, hodIds, employeeIds].some(a => a.length > 0) && (
              <span style={S.badge(C.warn, C.warnBg)}>
                {[deptIds, divisions, jobGrades, categories, groupIds, dmIds, hodIds, employeeIds].filter(a => a.length > 0).length} active
              </span>
            )}
          </div>

          {filtersOpen && (
            <div>
              <div style={S.grid2}>
                <div>
                  <span style={S.label}>Department</span>
                  <MultiSelect options={deptOpts} selected={deptIds} onChange={v => { setDeptIds(v); setPreviewCount(null); }} placeholder="All departments" />
                </div>
                <div>
                  <span style={S.label}>Division</span>
                  <MultiSelect options={divOpts} selected={divisions} onChange={v => { setDivisions(v); setPreviewCount(null); }} placeholder="All divisions" />
                </div>
                <div>
                  <span style={S.label}>Job Grade</span>
                  <MultiSelect options={gradeOpts} selected={jobGrades} onChange={v => { setJobGrades(v); setPreviewCount(null); }} placeholder="All grades" />
                </div>
                <div>
                  <span style={S.label}>Category</span>
                  <MultiSelect options={catOpts} selected={categories} onChange={v => { setCategories(v); setPreviewCount(null); }} placeholder="All categories" />
                </div>
                <div>
                  <span style={S.label}>Group</span>
                  <MultiSelect options={groupOpts} selected={groupIds} onChange={v => { setGroupIds(v); setPreviewCount(null); }} placeholder="All groups" />
                </div>
              </div>

              <div style={S.divider} />

              <div style={S.grid2}>
                <div>
                  <span style={S.label}>Direct Manager</span>
                  <MultiSelect options={userOpts} selected={dmIds} onChange={v => { setDmIds(v); setPreviewCount(null); }} placeholder="Any manager" searchable />
                </div>
                <div>
                  <span style={S.label}>HOD</span>
                  <MultiSelect options={userOpts} selected={hodIds} onChange={v => { setHodIds(v); setPreviewCount(null); }} placeholder="Any HOD" searchable />
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <span style={S.label}>Specific Employees</span>
                <MultiSelect options={userOpts} selected={employeeIds} onChange={v => { setEmployeeIds(v); setPreviewCount(null); }} placeholder="All employees" searchable />
              </div>
            </div>
          )}

          {/* Preview button */}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={handlePreview}
              disabled={!canPreview}
              style={{ ...btn('secondary'), opacity: canPreview ? 1 : 0.5, cursor: canPreview ? 'pointer' : 'not-allowed' }}
            >
              {previewing ? 'Counting…' : 'Preview Employee Count'}
            </button>
            {!cycleIds.length && (
              <span style={{ fontSize: 12, color: C.textTert }}>Select at least one cycle to preview</span>
            )}
          </div>
        </div>
      </div>

      {/* ── SECTION 2: COLUMNS ───────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>Section 2 — Columns</span>
          <span style={{ fontSize: 12, color: C.textSecond }}>{selectedCols.size} selected</span>
        </div>
        <div style={S.cardBody}>

          {/* KPI Breakdown Mode toggle */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 14,
            padding: '12px 14px',
            borderRadius: 8,
            background: bmMode ? '#f0fdf4' : C.bgSecondary,
            border: `1px solid ${bmMode ? '#86efac' : C.borderLight}`,
            marginBottom: 20,
          }}>
            <Toggle checked={bmMode} onChange={v => setBmMode(v)} label="KPI Breakdown Mode" />
            <div style={{ fontSize: 12, color: C.textSecond, lineHeight: 1.5 }}>
              {bmMode
                ? <span style={{ color: '#166534' }}>Each row will represent one KPI, not one employee.</span>
                : 'Each row will represent one employee per cycle. Enable to get per-KPI rows and unlock KPI Detail / KPI Scoring columns.'}
            </div>
          </div>

          <ColumnGroup
            title="Demographics"
            columns={DEMO_COLS}
            selected={selectedCols}
            onChange={setSelectedCols}
            bmEnabled={bmMode}
          />
          <div style={S.divider} />
          <ColumnGroup
            title="Reporting Chain"
            columns={REPORTING_COLS}
            selected={selectedCols}
            onChange={setSelectedCols}
            bmEnabled={bmMode}
          />
          <div style={S.divider} />
          <ColumnGroup
            title="Scorecard Summary"
            columns={SCORECARD_COLS}
            selected={selectedCols}
            onChange={setSelectedCols}
            bmEnabled={bmMode}
          />
          <div style={S.divider} />
          <ColumnGroup
            title="KPI Details"
            columns={KPI_DETAIL_COLS}
            selected={selectedCols}
            onChange={setSelectedCols}
            requiresBm
            bmEnabled={bmMode}
          />
          <div style={S.divider} />
          <ColumnGroup
            title="KPI Scoring"
            columns={KPI_SCORE_COLS}
            selected={selectedCols}
            onChange={setSelectedCols}
            requiresBm
            bmEnabled={bmMode}
          />
        </div>
      </div>

      {/* ── SECTION 3: GENERATE ──────────────────────────────────────────── */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>Section 3 — Generate</span>
        </div>
        <div style={S.cardBody}>

          {/* Validation hints */}
          {!cycleIds.length && (
            <div style={{ ...S.badge(C.warn, C.warnBg), marginBottom: 12, display: 'block', padding: '8px 12px' }}>
              Select at least one cycle before generating.
            </div>
          )}
          {!selectedCols.size && (
            <div style={{ ...S.badge(C.warn, C.warnBg), marginBottom: 12, display: 'block', padding: '8px 12px' }}>
              Select at least one column before generating.
            </div>
          )}

          {buildMut.isError && (
            <div style={{ ...S.badge(C.danger, C.dangerBg), marginBottom: 12, display: 'block', padding: '8px 12px' }}>
              {(buildMut.error as any)?.response?.data?.detail ?? 'Failed to generate report. Please try again.'}
            </div>
          )}

          {buildMut.isPending && (
            <div style={{ ...S.badge(C.info, C.infoBg), marginBottom: 14, display: 'block', padding: '8px 12px' }}>
              Generating report… please wait.
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              style={{ ...btn('primary'), opacity: canGenerate ? 1 : 0.5, cursor: canGenerate ? 'pointer' : 'not-allowed' }}
            >
              {buildMut.isPending ? 'Generating…' : 'Generate Report'}
            </button>

            <span style={{ fontSize: 12, color: C.textTert }}>
              Downloads as&nbsp;<code style={{ background: C.bgTertiary, padding: '1px 5px', borderRadius: 3, fontSize: 11 }}>custom_report_[date].xlsx</code>
            </span>
          </div>

          {/* Summary of what will be generated */}
          {cycleIds.length > 0 && selectedCols.size > 0 && (
            <div style={{ marginTop: 14, fontSize: 12, color: C.textSecond, lineHeight: 1.7 }}>
              <strong>Summary:</strong> {cycleIds.length} cycle{cycleIds.length !== 1 ? 's' : ''} ·{' '}
              {selectedCols.size} column{selectedCols.size !== 1 ? 's' : ''} ·{' '}
              {bmMode ? 'one row per KPI' : 'one row per employee per cycle'}
              {previewCount !== null && ` · ~${previewCount} employee${previewCount !== 1 ? 's' : ''}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
