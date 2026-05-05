import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cyclesApi, usersApi, departmentsApi, api } from '../api/client';
import { useForm } from 'react-hook-form';
import { useState, useRef } from 'react';
import UserProfileDrawer, { ReportingChainModal, InitialsAvatar } from '../components/common/UserProfileDrawer';

const PAGE_SIZE = 20;

const ROLE_LABELS: Record<string, string> = {
  STAFF: 'Staff', MANAGER: 'Manager', MGR2: "Mgr's Manager",
  HOD: 'HOD/CxO', HR_ADMIN: 'HR Admin', SUPER_ADMIN: 'Super Admin',
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  NEW:       { bg: '#dcfce7', color: '#166534', label: 'New' },
  DUPLICATE: { bg: '#fef9c3', color: '#854d0e', label: 'Duplicate' },
  MISSING:   { bg: '#fee2e2', color: '#991b1b', label: 'Missing' },
  ERROR:     { bg: '#fce7f3', color: '#9d174d', label: 'Error' },
};

// ── CSV Export utilities ───────────────────────────────────────────────────

function downloadCsv(filename: string, rows: string[][]) {
  const content = rows.map(r =>
    r.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportUsersAudit(users: any[], depts: any[]) {
  const deptMap = Object.fromEntries(depts.map((d: any) => [d.id, d.name]));
  const userMap = Object.fromEntries(users.map((u: any) => [u.id, u]));
  const headers = [
    'Employee Code', 'Name', 'Email', 'Role', 'Grade',
    'Employment Unit', 'Department', 'Division', 'Section',
    'Position Title', 'Category', 'Country', 'Work Location',
    'Employee Type', 'Hire Date', 'Gender', 'Status',
    'Direct Manager Code', 'Direct Manager Name',
    'Reviewing Manager Code', 'Reviewing Manager Name',
    'HOD Code', 'HOD Name', 'Approval Levels',
  ];
  const rows = users.map((u: any) => {
    const dm  = userMap[u.direct_manager_id];
    const rm  = userMap[u.reviewing_manager_id];
    const hod = userMap[u.hod_id];
    return [
      u.employee_id, u.full_name, u.email, u.role, u.job_grade || '',
      u.employment_unit || '',
      u.department_id ? deptMap[u.department_id] || '' : '',
      u.division || '', u.section || '', u.position_title || '',
      u.category || '', u.country || '', u.work_location || '',
      u.employee_type || '', u.hire_date || '', u.gender || '',
      u.is_active !== false ? 'Active' : 'Inactive',
      dm  ? dm.employee_id  : '', dm  ? dm.full_name  : '',
      rm  ? rm.employee_id  : '', rm  ? rm.full_name  : '',
      hod ? hod.employee_id : '', hod ? hod.full_name : '',
      String(u.approval_levels || 3),
    ];
  });
  downloadCsv(`users_audit_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
}

function exportCsvTemplate() {
  const headers = [
    'Employee Code', 'Name', 'Employment Unit', 'Department',
    'Division', 'Section', 'Position Title', 'Grade', 'Category',
    'Country', 'Work Location', 'Employee Type', 'Hire Date',
    'Gender', 'ROLE',
  ];
  const example = [
    'EMP001', 'Ahmad bin Ali', 'Corporate', 'Finance',
    'Financial Control', 'Reporting', 'Finance Executive', 'G3', 'Permanent',
    'Malaysia', 'Kuala Lumpur HQ', 'Full Time', '01/01/2020',
    'Male', 'STAFF',
  ];
  downloadCsv('employee_import_template.csv', [headers, example]);
}

function exportReportingLinesTemplate() {
  const headers = [
    'Employee Code', 'Name',
    'Direct Manager Code', 'Reviewing Manager Code', 'HOD Code',
  ];
  const example = ['EMP005', 'Aisha Rahman', 'EMP004', 'EMP003', 'EMP002'];
  downloadCsv('reporting_lines_template.csv', [headers, example]);
}

function exportReportingLinesAudit(users: any[]) {
  const userMap = Object.fromEntries(users.map((u: any) => [u.id, u]));
  const headers = [
    'Employee Code', 'Name',
    'Direct Manager Code', 'Direct Manager Name',
    'Reviewing Manager Code', 'Reviewing Manager Name',
    'HOD Code', 'HOD Name',
    'Approval Levels',
  ];
  const rows = users.map((u: any) => {
    const dm  = userMap[u.direct_manager_id];
    const rm  = userMap[u.reviewing_manager_id];
    const hod = userMap[u.hod_id];
    return [
      u.employee_id, u.full_name,
      dm  ? dm.employee_id  : '', dm  ? dm.full_name  : '',
      rm  ? rm.employee_id  : '', rm  ? rm.full_name  : '',
      hod ? hod.employee_id : '', hod ? hod.full_name : '',
      String(u.approval_levels || 3),
    ];
  });
  downloadCsv(`reporting_lines_audit_${new Date().toISOString().slice(0, 10)}.csv`,
    [headers, ...rows]);
}

// ── Shared components ──────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#e8f1fb',
      color: '#185fa5', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

function RolePill({ role }: { role: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    STAFF:       { bg: '#f5f5f3', color: '#555' },
    MANAGER:     { bg: '#e0f2fe', color: '#0369a1' },
    MGR2:        { bg: '#ede9fe', color: '#6d28d9' },
    HOD:         { bg: '#fef3c7', color: '#92400e' },
    HR_ADMIN:    { bg: '#dcfce7', color: '#166534' },
    SUPER_ADMIN: { bg: '#fee2e2', color: '#991b1b' },
  };
  const c = colors[role] || colors.STAFF;
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px',
      borderRadius: 10, background: c.bg, color: c.color }}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

// ── User List Tab ──────────────────────────────────────────────────────────

function UserListTab({ users, depts }: { users: any[]; depts: any[] }) {
  const qc = useQueryClient();
  const [search,     setSearch]   = useState('');
  const [roleFilter, setRole]     = useState('');
  const [deptFilter, setDept]     = useState('');
  const [page,       setPage]     = useState(1);
  const [selected,   setSelected] = useState<any>(null);
  const [showChain,  setShowChain] = useState(false);
  const [rlResult,   setRlResult] = useState<any>(null);
  const [rlLoading,  setRlLoading] = useState(false);
  const rlFileRef = useRef<HTMLInputElement>(null);

  // Profile query — needed for the modal
  const { data: profile } = useQuery({
    queryKey: ['user-profile', selected?.id],
    queryFn:  () => userProfileApi.getProfile(selected!.id).then(r => r.data),
    enabled:  !!selected,
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => userProfileApi.updateManagers(selected!.id, data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['user-profile', selected?.id] });
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowChain(false);
    },
  });

  // ... (keep all existing filter/pagination/upload logic unchanged) ...

  return (
    <div>
      {/* ... all existing JSX unchanged ... */}

      {/* Profile drawer */}
      {selected && (
        <UserProfileDrawer
          user={selected}
          users={users}
          depts={depts}
          onClose={() => { setSelected(null); setShowChain(false); }}
          onEditChain={() => setShowChain(true)}
        />
      )}

      {/* Reporting chain modal — sibling to drawer, higher z-index */}
      {selected && showChain && profile && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowChain(false)}>
          <div style={{ width: 520, background: 'var(--color-background-primary)',
            borderRadius: 14, border: '0.5px solid var(--color-border-secondary)',
            overflow: 'hidden', maxHeight: '85vh',
            display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>
            <ReportingChainModal
              user={selected}
              profile={profile}
              managers={users.filter((u: any) => u.id !== selected.id)}
              onClose={() => setShowChain(false)}
              onSave={async (data) => { await updateMutation.mutateAsync(data); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── CSV Import Tab ─────────────────────────────────────────────────────────

function CsvImportTab() {
  const qc = useQueryClient();
  const fileRef                         = useRef<HTMLInputElement>(null);
  const [preview,   setPreview]         = useState<any[]>([]);
  const [summary,   setSummary]         = useState<any>(null);
  const [importing, setImporting]       = useState(false);
  const [result,    setResult]          = useState<any>(null);
  const [selected,  setSelected]        = useState<Record<string, string>>({});
  const [filter,    setFilter]          = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview([]); setSummary(null); setResult(null); setSelected({});
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/users/import/preview', fd,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(res.data.rows);
      setSummary(res.data.summary);
      const auto: Record<string, string> = {};
      res.data.rows.forEach((r: any) => {
        if (r.status === 'NEW') auto[r.employee_code] = 'create';
      });
      setSelected(auto);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Failed to parse CSV');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleConfirm() {
    const rows = preview
      .filter(r => selected[r.employee_code])
      .map(r => ({ ...r, action: selected[r.employee_code] }));
    if (!rows.length) { alert('No rows selected'); return; }
    setImporting(true);
    try {
      const res = await api.post('/users/import/confirm', { rows });
      setResult(res.data);
      qc.invalidateQueries({ queryKey: ['users'] });
      setPreview([]); setSummary(null); setSelected({});
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function toggle(code: string, action: string) {
    setSelected(p => {
      if (p[code] === action) { const n = { ...p }; delete n[code]; return n; }
      return { ...p, [code]: action };
    });
  }

  function selectAll(status: string, action: string) {
    const b = { ...selected };
    preview.filter(r => r.status === status).forEach(r => { b[r.employee_code] = action; });
    setSelected(b);
  }

  const filtered = filter ? preview.filter(r => r.status === filter) : preview;

  return (
    <div>
      <div style={S.card}>
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Upload Employee CSV</div>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
          Required columns: <code>Employee Code, Name, Employment Unit, Department, Division,
          Section, Position Title, Grade, Category, Country, Work Location, Employee Type,
          Hire Date, Gender, ROLE</code><br />
          Optional: <code>Direct Manager Code, Reviewing Manager Code, HOD Code</code>
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFile}
            style={{ display: 'none' }} />
          <button style={S.btnPrimary} onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? 'Analysing...' : '↑ Upload CSV'}
          </button>
          <button style={S.btnSm} onClick={exportCsvTemplate}>
            ↓ Download Template
          </button>
          {summary && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { label: `New: ${summary.new}`,              bg: '#dcfce7', color: '#166534', f: 'NEW' },
                { label: `Duplicate: ${summary.duplicates}`, bg: '#fef9c3', color: '#854d0e', f: 'DUPLICATE' },
                { label: `Missing: ${summary.missing}`,      bg: '#fee2e2', color: '#991b1b', f: 'MISSING' },
                ...(summary.errors > 0 ? [{ label: `Errors: ${summary.errors}`, bg: '#fce7f3', color: '#9d174d', f: 'ERROR' }] : []),
              ].map(s => (
                <button key={s.f}
                  onClick={() => setFilter(filter === s.f ? '' : s.f)}
                  style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10,
                    background: s.bg, color: s.color, cursor: 'pointer',
                    border: filter === s.f ? `1.5px solid ${s.color}` : '1.5px solid transparent' }}>
                  {s.label}
                </button>
              ))}
              {filter && (
                <button style={{ fontSize: 12, color: '#888', background: 'transparent',
                  border: 'none', cursor: 'pointer' }}
                  onClick={() => setFilter('')}>Clear ✕</button>
              )}
            </div>
          )}
        </div>
      </div>

      {result && (
        <div style={{ ...S.card, background: '#dcfce7', border: '0.5px solid #86efac' }}>
          <div style={{ fontWeight: 500, color: '#166534', marginBottom: 6 }}>Import Complete ✓</div>
          <div style={{ fontSize: 13, color: '#166534' }}>
            Created: {result.created} · Updated: {result.updated} ·
            Deactivated: {result.deactivated} · Skipped: {result.skipped}
          </div>
          <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>{result.message}</div>
        </div>
      )}

      {preview.length > 0 && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 500 }}>
                Preview — {filtered.length} of {preview.length} rows
              </div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                {Object.keys(selected).length} selected
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={S.btnSm} onClick={() => selectAll('NEW', 'create')}>All new</button>
              <button style={S.btnSm} onClick={() => selectAll('DUPLICATE', 'update')}>All updates</button>
              <button style={{ ...S.btnSm, color: '#991b1b', borderColor: '#fca5a5' }}
                onClick={() => selectAll('MISSING', 'deactivate')}>All missing</button>
              <button style={S.btnSm} onClick={() => setSelected({})}>Clear</button>
              <button
                onClick={handleConfirm}
                disabled={importing || Object.keys(selected).length === 0}
                style={S.btnPrimary}>
                {importing ? 'Importing...' : `Confirm (${Object.keys(selected).length})`}
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#fafaf8' }}>
                  {['', 'Status', 'Code', 'Name', 'Email', 'Dept',
                    'Grade', 'Role', 'DM Code', 'Notes'].map(h => (
                    <th key={h} style={{ ...S.th, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row: any, i: number) => {
                  const ss   = STATUS_STYLE[row.status] || STATUS_STYLE.ERROR;
                  const code = row.employee_code;
                  return (
                    <tr key={i} style={{
                      background: selected[code] ? '#f0fdf4' : i % 2 === 0 ? '#fff' : '#fafaf8'
                    }}>
                      <td style={{ ...S.td, width: 32 }}>
                        {row.status === 'NEW'       && <input type="checkbox" checked={selected[code] === 'create'}     onChange={() => toggle(code, 'create')} />}
                        {row.status === 'DUPLICATE' && <input type="checkbox" checked={selected[code] === 'update'}     onChange={() => toggle(code, 'update')} />}
                        {row.status === 'MISSING'   && <input type="checkbox" checked={selected[code] === 'deactivate'} onChange={() => toggle(code, 'deactivate')} />}
                      </td>
                      <td style={S.td}>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10,
                          background: ss.bg, color: ss.color, fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {ss.label}
                        </span>
                      </td>
                      <td style={S.td}>{code}</td>
                      <td style={{ ...S.td, fontWeight: 500 }}>{row.name}</td>
                      <td style={S.td}>{row.email}</td>
                      <td style={S.td}>{row.department || '—'}</td>
                      <td style={S.td}>{row.grade || '—'}</td>
                      <td style={S.td}>{row.role || '—'}</td>
                      <td style={S.td}>{row.dm_code || '—'}</td>
                      <td style={{ ...S.td, maxWidth: 180, color: '#888', fontSize: 11 }}>
                        {row.status === 'DUPLICATE' && row.changes && Object.keys(row.changes).length > 0
                          ? `Changes: ${Object.keys(row.changes).join(', ')}`
                          : row.message || ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reporting Lines Tab ────────────────────────────────────────────────────

function ReportingLinesTab({ users }: { users: any[] }) {
  const [search, setSearch] = useState('');

  function getReports(id: string) {
    return users.filter((u: any) => u.direct_manager_id === id);
  }

  function matchesSearch(u: any) {
    if (!search) return true;
    const q = search.toLowerCase();
    return [u.full_name, u.employee_id, u.role, u.position_title]
      .some(f => f?.toLowerCase().includes(q));
  }

  function hasMatch(u: any): boolean {
    return matchesSearch(u) || getReports(u.id).some(r => hasMatch(r));
  }

  function TreeNode({ user, depth }: { user: any; depth: number }) {
    const [open, setOpen] = useState(depth < 2);
    const reports = getReports(user.id).filter(r => hasMatch(r));
    const isMatch = matchesSearch(user);

    return (
      <div style={{ marginLeft: depth * 20 }}>
        <div
          onClick={() => reports.length > 0 && setOpen(!open)}
          style={{ display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', borderRadius: 8, marginBottom: 2,
            cursor: reports.length > 0 ? 'pointer' : 'default',
            background: isMatch && search ? '#fef9c3' : 'transparent' }}>
          <span style={{ fontSize: 10, color: '#888', width: 12, flexShrink: 0 }}>
            {reports.length > 0 ? (open ? '▼' : '▶') : ''}
          </span>
          <div style={{ width: 30, height: 30, borderRadius: '50%',
            background: '#e8f1fb', color: '#185fa5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
            {user.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{user.full_name}</div>
            <div style={{ fontSize: 11, color: '#888' }}>
              {user.employee_id} · {ROLE_LABELS[user.role] || user.role}
              {user.position_title ? ` · ${user.position_title}` : ''}
            </div>
          </div>
          {reports.length > 0 && (
            <span style={{ fontSize: 11, color: '#888', flexShrink: 0 }}>
              {reports.length} direct report{reports.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {open && reports.map((r: any) => (
          <TreeNode key={r.id} user={r} depth={depth + 1} />
        ))}
      </div>
    );
  }

  const roots = users
    .filter((u: any) => !u.direct_manager_id)
    .filter(r => hasMatch(r));

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <input
          style={{ ...S.input, maxWidth: 340 }}
          placeholder="Search by name, code, role, or position..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div style={{ background: '#fff', border: '0.5px solid #e5e4df',
        borderRadius: 10, padding: 16 }}>
        {roots.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: '#888', fontSize: 13 }}>
            {search ? 'No matches found' : 'No root employees — everyone has a direct manager assigned'}
          </div>
        )}
        {roots.map((u: any) => <TreeNode key={u.id} user={u} depth={0} />)}
      </div>
    </div>
  );
}

// ── Main Admin Page ────────────────────────────────────────────────────────

export default function AdminPage() {
  const qc = useQueryClient();
  const [tab,     setTab]     = useState<'cycles' | 'users' | 'depts'>('cycles');
  const [userTab, setUserTab] = useState<'list' | 'import' | 'reporting'>('list');
  const { register: rc, handleSubmit: hc, reset: resetC } = useForm();

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'],
    queryFn:  () => cyclesApi.list().then(r => r.data),
  });
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn:  () => usersApi.list().then(r => r.data),
  });
  const { data: depts = [] } = useQuery({
    queryKey: ['depts'],
    queryFn:  () => departmentsApi.list().then(r => r.data),
  });

  const createCycle = useMutation({
    mutationFn: (d: any) => cyclesApi.create(d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['cycles'] }); resetC(); },
  });

  const MAIN_TABS = [
    ['cycles', 'Cycles'],
    ['users',  'User Management'],
    ['depts',  'Departments'],
  ] as const;

  const USER_TABS = [
    ['list',      'User List'],
    ['import',    'CSV Import'],
    ['reporting', 'Reporting Lines'],
  ] as const;

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>HR Admin</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
        Manage cycles, users, and system configuration
      </p>

      {/* Main tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '0.5px solid #e5e4df', marginBottom: 20 }}>
        {MAIN_TABS.map(([t, l]) => (
          <button key={t} onClick={() => setTab(t as any)}
            style={{ padding: '8px 16px', border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: 13,
              color:      tab === t ? '#1a1a18' : '#888',
              fontWeight: tab === t ? 500 : 400,
              borderBottom: tab === t ? '2px solid #1a1a18' : '2px solid transparent',
              marginBottom: -0.5 }}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Cycles ── */}
      {tab === 'cycles' && (
        <div>
          <div style={S.card}>
            <div style={{ fontWeight: 500, marginBottom: 14 }}>Create Performance Cycle</div>
            <form onSubmit={hc(d => createCycle.mutate(d))}>
              <div style={S.grid2}>
                <div style={S.fg}><label style={S.label}>Cycle Name</label>
                  <input style={S.input} {...rc('name', { required: true })} placeholder="FY2026 Annual" /></div>
                <div style={S.fg}><label style={S.label}>Year</label>
                  <input style={S.input} type="number" {...rc('year', { required: true })} placeholder="2026" /></div>
                <div style={S.fg}><label style={S.label}>KPI Setting Start</label>
                  <input style={S.input} type="date" {...rc('kpi_setting_start', { required: true })} /></div>
                <div style={S.fg}><label style={S.label}>KPI Setting End</label>
                  <input style={S.input} type="date" {...rc('kpi_setting_end', { required: true })} /></div>
                <div style={S.fg}><label style={S.label}>Self Eval Start</label>
                  <input style={S.input} type="date" {...rc('self_eval_start', { required: true })} /></div>
                <div style={S.fg}><label style={S.label}>Self Eval End</label>
                  <input style={S.input} type="date" {...rc('self_eval_end', { required: true })} /></div>
                <div style={S.fg}><label style={S.label}>Manager Eval Start</label>
                  <input style={S.input} type="date" {...rc('mgr_eval_start', { required: true })} /></div>
                <div style={S.fg}><label style={S.label}>Manager Eval End</label>
                  <input style={S.input} type="date" {...rc('mgr_eval_end', { required: true })} /></div>
              </div>
              <button type="submit" style={S.btnPrimary}>
                {createCycle.isPending ? 'Creating...' : 'Create Cycle'}
              </button>
            </form>
          </div>

          <div style={S.card}>
            <div style={{ fontWeight: 500, marginBottom: 12 }}>Existing Cycles</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Name', 'Year', 'Status', 'KPI Window'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(cycles as any[]).length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#888' }}>
                    No cycles yet
                  </td></tr>
                )}
                {(cycles as any[]).map((c: any) => (
                  <tr key={c.id}>
                    <td style={S.td}>{c.name}</td>
                    <td style={S.td}>{c.year}</td>
                    <td style={S.td}>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10,
                        background: '#f0f9ff', color: '#0369a1' }}>{c.status}</span>
                    </td>
                    <td style={S.td}>{c.kpi_setting_start} → {c.kpi_setting_end}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── User Management ── */}
      {tab === 'users' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: '#888' }}>
              {(users as any[]).length} active users
            </span>
          </div>

          {/* User sub-tabs */}
          <div style={{ display: 'flex', gap: 2, borderBottom: '0.5px solid #e5e4df', marginBottom: 16 }}>
            {USER_TABS.map(([t, l]) => (
              <button key={t} onClick={() => setUserTab(t as any)}
                style={{ padding: '7px 14px', border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: 12,
                  color:      userTab === t ? '#1a1a18' : '#888',
                  fontWeight: userTab === t ? 500 : 400,
                  borderBottom: userTab === t ? '2px solid #1a1a18' : '2px solid transparent',
                  marginBottom: -0.5 }}>
                {l}
              </button>
            ))}
          </div>

          {userTab === 'list'      && <UserListTab users={users as any[]} depts={depts as any[]} />}
          {userTab === 'import'    && <CsvImportTab />}
          {userTab === 'reporting' && <ReportingLinesTab users={users as any[]} />}
        </div>
      )}

      {/* ── Departments ── */}
      {tab === 'depts' && (
        <div style={S.card}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>
            Departments ({(depts as any[]).length})
          </div>
          {(depts as any[]).map((d: any) => (
            <div key={d.id} style={{ padding: '8px 0', borderBottom: '0.5px solid #f0f0ee',
              fontSize: 13, display: 'flex', gap: 10 }}>
              <span style={{ fontWeight: 500 }}>{d.name}</span>
              <span style={{ color: '#888' }}>{d.code}</span>
            </div>
          ))}
          {(depts as any[]).length === 0 && (
            <div style={{ color: '#888', fontSize: 13 }}>No departments found.</div>
          )}
        </div>
      )}
    </div>
  );
}

const S: Record<string, any> = {
  card:      { background: '#fff', border: '0.5px solid #e5e4df', borderRadius: 10, padding: 16, marginBottom: 12 },
  grid2:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 },
  fg:        { marginBottom: 10 },
  label:     { fontSize: 12, fontWeight: 500, color: '#666', display: 'block', marginBottom: 4 },
  input:     { width: '100%', padding: '7px 10px', border: '0.5px solid #d0d0cc', borderRadius: 8, fontSize: 13, background: '#fff', color: '#1a1a18', fontFamily: 'inherit', outline: 'none' },
  btnPrimary:{ padding: '7px 16px', border: 'none', borderRadius: 8, background: '#1a1a18', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  btnSm:     { padding: '5px 10px', border: '0.5px solid #d0d0cc', borderRadius: 8, background: 'transparent', color: '#444', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  th:        { textAlign: 'left', padding: '8px 10px', borderBottom: '0.5px solid #e5e4df', fontSize: 11, color: '#888', fontWeight: 500 },
  td:        { padding: '10px', borderBottom: '0.5px solid #f0f0ee', fontSize: 13 },
};
