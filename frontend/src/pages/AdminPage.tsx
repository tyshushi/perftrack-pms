import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cyclesApi, usersApi, departmentsApi, api } from '../api/client';
import { useForm } from 'react-hook-form';
import { useState, useRef } from 'react';

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

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#e8f1fb', color: '#185fa5',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
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
    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: c.bg, color: c.color }}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

// ── User List ─────────────────────────────────────────────────────────────

function UserListTab({ users, depts }: { users: any[]; depts: any[] }) {
  const [search, setSearch]     = useState('');
  const [roleFilter, setRole]   = useState('');
  const [deptFilter, setDept]   = useState('');
  const [page, setPage]         = useState(1);
  const [selected, setSelected] = useState<any>(null);

  const deptMap = Object.fromEntries(depts.map((d: any) => [d.id, d.name]));

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || [u.full_name, u.employee_id, u.email, u.role, u.job_grade]
      .some(f => f?.toLowerCase().includes(q));
    return matchSearch &&
      (!roleFilter || u.role === roleFilter) &&
      (!deptFilter || u.department_id === deptFilter);
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input style={{ ...S.input, flex: 1, minWidth: 200 }}
          placeholder="Search name, code, email, role, grade..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <select style={{ ...S.input, width: 150 }} value={roleFilter} onChange={e => { setRole(e.target.value); setPage(1); }}>
          <option value="">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select style={{ ...S.input, width: 170 }} value={deptFilter} onChange={e => { setDept(e.target.value); setPage(1); }}>
          <option value="">All Departments</option>
          {depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#888', alignSelf: 'center' }}>{filtered.length} users</span>
      </div>

      <div style={{ background: '#fff', border: '0.5px solid #e5e4df', borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#fafaf8' }}>
              {['Employee', 'Code', 'Email', 'Department', 'Grade', 'Role', 'Status'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#888' }}>No users found</td></tr>
            )}
            {paginated.map((u: any) => (
              <tr key={u.id} onClick={() => setSelected(u)} style={{ cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fafaf8')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <td style={S.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name={u.full_name} />
                    <span style={{ fontWeight: 500 }}>{u.full_name}</span>
                  </div>
                </td>
                <td style={S.td}>{u.employee_id}</td>
                <td style={S.td}>{u.email}</td>
                <td style={S.td}>{u.department_id ? deptMap[u.department_id] || '—' : '—'}</td>
                <td style={S.td}>{u.job_grade || '—'}</td>
                <td style={S.td}><RolePill role={u.role} /></td>
                <td style={S.td}>
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10,
                    background: u.is_active !== false ? '#dcfce7' : '#fee2e2',
                    color: u.is_active !== false ? '#166534' : '#991b1b' }}>
                    {u.is_active !== false ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
          <button style={S.btnSm} disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .map((p, i, arr) => (
              <span key={p}>
                {i > 0 && arr[i-1] !== p-1 && <span style={{ padding: '0 4px', color: '#888' }}>...</span>}
                <button onClick={() => setPage(p)} style={{ ...S.btnSm,
                  background: p === page ? '#1a1a18' : 'transparent',
                  color: p === page ? '#fff' : '#444' }}>{p}</button>
              </span>
            ))}
          <button style={S.btnSm} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}
          onClick={() => setSelected(null)}>
          <div style={{ width: 360, background: '#fff', height: '100%', overflowY: 'auto', padding: 24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ fontWeight: 500 }}>User Details</span>
              <button onClick={() => setSelected(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: '#888' }}>✕</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: 16, background: '#f9f9f7', borderRadius: 10 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#e8f1fb', color: '#185fa5',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600 }}>
                {selected.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{selected.full_name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{selected.email}</div>
              </div>
            </div>
            {[
              ['Employee Code', selected.employee_id],
              ['Role', ROLE_LABELS[selected.role] || selected.role],
              ['Grade', selected.job_grade || '—'],
              ['Department', selected.department_id ? Object.fromEntries(depts.map((d:any)=>[d.id,d.name]))[selected.department_id] : '—'],
              ['Status', selected.is_active !== false ? 'Active' : 'Inactive'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid #f0f0ee', fontSize: 13 }}>
                <span style={{ color: '#888' }}>{label}</span>
                <span style={{ fontWeight: 500 }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add User ──────────────────────────────────────────────────────────────

function AddUserTab({ depts, users }: { depts: any[]; users: any[] }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();
  const [success, setSuccess] = useState('');
  const managers = users.filter((u: any) => ['MANAGER','MGR2','HOD','HR_ADMIN','SUPER_ADMIN'].includes(u.role));

  const createUser = useMutation({
    mutationFn: (d: any) => usersApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      reset();
      setSuccess('User created. Temporary password: Welcome@1234');
      setTimeout(() => setSuccess(''), 5000);
    },
  });

  return (
    <div style={S.card}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>Add New User</div>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>New users get temporary password: <code>Welcome@1234</code></p>
      {success && <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{success}</div>}
      <form onSubmit={handleSubmit(d => createUser.mutate({ ...d, password: 'Welcome@1234' }))}>
        <div style={S.grid2}>
          <div style={S.fg}><label style={S.label}>Employee Code *</label><input style={S.input} {...register('employee_id', { required: true })} placeholder="EMP001" /></div>
          <div style={S.fg}><label style={S.label}>Full Name *</label><input style={S.input} {...register('full_name', { required: true })} placeholder="Aisha Rahman" /></div>
          <div style={S.fg}><label style={S.label}>Email *</label><input style={S.input} type="email" {...register('email', { required: true })} placeholder="aisha@company.com" /></div>
          <div style={S.fg}><label style={S.label}>Role *</label>
            <select style={S.input} {...register('role', { required: true })}>
              {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={S.fg}><label style={S.label}>Job Grade</label><input style={S.input} {...register('job_grade')} placeholder="G1" /></div>
          <div style={S.fg}><label style={S.label}>Department</label>
            <select style={S.input} {...register('department_id')}>
              <option value="">— None —</option>
              {depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div style={S.fg}><label style={S.label}>Direct Manager</label>
            <select style={S.input} {...register('manager_id')}>
              <option value="">— None —</option>
              {managers.map((u: any) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
            </select>
          </div>
        </div>
        <button type="submit" disabled={isSubmitting} style={S.btnPrimary}>
          {isSubmitting ? 'Creating...' : 'Create User'}
        </button>
      </form>
    </div>
  );
}

// ── CSV Import ────────────────────────────────────────────────────────────

function CsvImportTab() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview]       = useState<any[]>([]);
  const [summary, setSummary]       = useState<any>(null);
  const [importing, setImporting]   = useState(false);
  const [importResult, setResult]   = useState<any>(null);
  const [selected, setSelected]     = useState<Record<string, string>>({});
  const [statusFilter, setFilter]   = useState('');

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview([]); setSummary(null); setResult(null); setSelected({});
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/users/import/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(res.data.rows);
      setSummary(res.data.summary);
      const auto: Record<string, string> = {};
      res.data.rows.forEach((r: any) => { if (r.status === 'NEW') auto[r.employee_code] = 'create'; });
      setSelected(auto);
    } catch (e: any) { alert(e.response?.data?.detail || 'Failed to parse CSV'); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function handleConfirm() {
    const rows = preview.filter(r => selected[r.employee_code]).map(r => ({ ...r, action: selected[r.employee_code] }));
    if (!rows.length) { alert('No rows selected'); return; }
    setImporting(true);
    try {
      const res = await api.post('/users/import/confirm', { rows });
      setResult(res.data);
      qc.invalidateQueries({ queryKey: ['users'] });
      setPreview([]); setSummary(null); setSelected({});
    } catch (e: any) { alert(e.response?.data?.detail || 'Import failed'); }
    finally { setImporting(false); }
  }

  function toggle(code: string, action: string) {
    setSelected(p => { if (p[code] === action) { const n = {...p}; delete n[code]; return n; } return {...p, [code]: action}; });
  }
  function selectAll(status: string, action: string) {
    const b = {...selected}; preview.filter(r => r.status === status).forEach(r => { b[r.employee_code] = action; }); setSelected(b);
  }
  function deselectAll(status: string) {
    const b = {...selected}; preview.filter(r => r.status === status).forEach(r => { delete b[r.employee_code]; }); setSelected(b);
  }

  const filtered = statusFilter ? preview.filter(r => r.status === statusFilter) : preview;

  return (
    <div>
      <div style={S.card}>
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Upload Employee CSV</div>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
          Required columns: <code>Employee Code, Name, Employment Unit, Department, Division, Section, Position Title, Grade, Category, Country, Work Location, Employee Type, Hire Date, Gender, ROLE</code>
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
          <button style={S.btnPrimary} onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? 'Analysing...' : '↑ Upload CSV'}
          </button>
          {summary && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { label: `New: ${summary.new}`,              bg: '#dcfce7', color: '#166534', f: 'NEW' },
                { label: `Duplicate: ${summary.duplicates}`, bg: '#fef9c3', color: '#854d0e', f: 'DUPLICATE' },
                { label: `Missing: ${summary.missing}`,      bg: '#fee2e2', color: '#991b1b', f: 'MISSING' },
                ...(summary.errors > 0 ? [{ label: `Errors: ${summary.errors}`, bg: '#fce7f3', color: '#9d174d', f: 'ERROR' }] : []),
              ].map(s => (
                <button key={s.f} onClick={() => setFilter(statusFilter === s.f ? '' : s.f)}
                  style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, background: s.bg, color: s.color,
                    border: statusFilter === s.f ? `1.5px solid ${s.color}` : '1.5px solid transparent', cursor: 'pointer' }}>
                  {s.label}
                </button>
              ))}
              {statusFilter && <button style={{ fontSize: 12, color: '#888', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={() => setFilter('')}>Clear filter ✕</button>}
            </div>
          )}
        </div>
      </div>

      {importResult && (
        <div style={{ ...S.card, background: '#dcfce7', border: '0.5px solid #86efac' }}>
          <div style={{ fontWeight: 500, color: '#166534', marginBottom: 6 }}>Import Complete ✓</div>
          <div style={{ fontSize: 13, color: '#166534' }}>
            Created: {importResult.created} · Updated: {importResult.updated} · Deactivated: {importResult.deactivated} · Skipped: {importResult.skipped}
          </div>
          <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>{importResult.message}</div>
        </div>
      )}

      {preview.length > 0 && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 500 }}>Preview — {filtered.length} of {preview.length} rows</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{Object.keys(selected).length} selected</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={S.btnSm} onClick={() => selectAll('NEW', 'create')}>Select all new</button>
              <button style={S.btnSm} onClick={() => selectAll('DUPLICATE', 'update')}>Select all updates</button>
              <button style={{ ...S.btnSm, color: '#991b1b', borderColor: '#fca5a5' }} onClick={() => selectAll('MISSING', 'deactivate')}>Select all missing</button>
              <button style={S.btnSm} onClick={() => setSelected({})}>Clear all</button>
              <button onClick={handleConfirm} disabled={importing || Object.keys(selected).length === 0} style={S.btnPrimary}>
                {importing ? 'Importing...' : `Confirm (${Object.keys(selected).length})`}
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#fafaf8' }}>
                  {['', 'Status', 'Code', 'Name', 'Email', 'Dept', 'Division', 'Section', 'Grade', 'Role', 'Notes'].map(h => (
                    <th key={h} style={{ ...S.th, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row: any, i: number) => {
                  const ss = STATUS_STYLE[row.status] || STATUS_STYLE.ERROR;
                  const code = row.employee_code;
                  return (
                    <tr key={i} style={{ background: selected[code] ? '#f0fdf4' : i % 2 === 0 ? '#fff' : '#fafaf8' }}>
                      <td style={{ ...S.td, width: 32 }}>
                        {row.status === 'NEW'       && <input type="checkbox" checked={selected[code] === 'create'}     onChange={() => toggle(code, 'create')} />}
                        {row.status === 'DUPLICATE' && <input type="checkbox" checked={selected[code] === 'update'}     onChange={() => toggle(code, 'update')} />}
                        {row.status === 'MISSING'   && <input type="checkbox" checked={selected[code] === 'deactivate'} onChange={() => toggle(code, 'deactivate')} />}
                      </td>
                      <td style={S.td}><span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: ss.bg, color: ss.color, fontWeight: 500, whiteSpace: 'nowrap' }}>{ss.label}</span></td>
                      <td style={S.td}>{code}</td>
                      <td style={{ ...S.td, fontWeight: 500 }}>{row.name}</td>
                      <td style={S.td}>{row.email}</td>
                      <td style={S.td}>{row.department || '—'}</td>
                      <td style={S.td}>{row.division || '—'}</td>
                      <td style={S.td}>{row.section || '—'}</td>
                      <td style={S.td}>{row.grade || '—'}</td>
                      <td style={S.td}>{row.role || '—'}</td>
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

// ── Reporting Lines ───────────────────────────────────────────────────────

function ReportingLinesTab({ users }: { users: any[] }) {
  const [search, setSearch] = useState('');

  function getReports(id: string) { return users.filter((u: any) => u.manager_id === id); }
  function matchesSearch(u: any) {
    if (!search) return true;
    const q = search.toLowerCase();
    return [u.full_name, u.employee_id, u.role].some(f => f?.toLowerCase().includes(q));
  }
  function hasMatch(u: any): boolean {
    return matchesSearch(u) || getReports(u.id).some(r => hasMatch(r));
  }

  function TreeNode({ user, depth }: { user: any; depth: number }) {
    const [open, setOpen] = useState(depth < 2);
    const reports = getReports(user.id).filter(r => hasMatch(r));
    return (
      <div style={{ marginLeft: depth * 20 }}>
        <div onClick={() => reports.length > 0 && setOpen(!open)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8,
            background: matchesSearch(user) && search ? '#fef9c3' : 'transparent',
            cursor: reports.length > 0 ? 'pointer' : 'default', marginBottom: 2 }}>
          <span style={{ fontSize: 10, color: '#888', width: 12 }}>
            {reports.length > 0 ? (open ? '▼' : '▶') : ''}
          </span>
          <Avatar name={user.full_name} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{user.full_name}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{user.employee_id} · {ROLE_LABELS[user.role] || user.role}</div>
          </div>
          {reports.length > 0 && <span style={{ fontSize: 11, color: '#888' }}>{reports.length} report{reports.length !== 1 ? 's' : ''}</span>}
        </div>
        {open && reports.map((r: any) => <TreeNode key={r.id} user={r} depth={depth + 1} />)}
      </div>
    );
  }

  const roots = users.filter((u: any) => !u.manager_id).filter(r => hasMatch(r));

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <input style={{ ...S.input, maxWidth: 320 }} placeholder="Search by name, code, or role..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div style={{ background: '#fff', border: '0.5px solid #e5e4df', borderRadius: 10, padding: 16 }}>
        {roots.length === 0 && <div style={{ textAlign: 'center', padding: 32, color: '#888', fontSize: 13 }}>No results</div>}
        {roots.map((u: any) => <TreeNode key={u.id} user={u} depth={0} />)}
      </div>
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────

export default function AdminPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'cycles'|'users'|'depts'>('cycles');
  const [userTab, setUserTab] = useState<'list'|'add'|'import'|'reporting'>('list');
  const { register: rc, handleSubmit: hc, reset: resetC } = useForm();

  const { data: cycles = [] } = useQuery({ queryKey: ['cycles'], queryFn: () => cyclesApi.list().then(r => r.data) });
  const { data: users  = [] } = useQuery({ queryKey: ['users'],  queryFn: () => usersApi.list().then(r => r.data) });
  const { data: depts  = [] } = useQuery({ queryKey: ['depts'],  queryFn: () => departmentsApi.list().then(r => r.data) });

  const createCycle = useMutation({
    mutationFn: (d: any) => cyclesApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cycles'] }); resetC(); },
  });

  const MAIN_TABS = [['cycles','Cycles'],['users','User Management'],['depts','Departments']] as const;
  const USER_TABS = [['list','User List'],['add','Add User'],['import','CSV Import'],['reporting','Reporting Lines']] as const;

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>HR Admin</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Manage cycles, users, and system configuration</p>

      {/* Main tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '0.5px solid #e5e4df', marginBottom: 20 }}>
        {MAIN_TABS.map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 13, color: tab === t ? '#1a1a18' : '#888', fontWeight: tab === t ? 500 : 400,
            borderBottom: tab === t ? '2px solid #1a1a18' : '2px solid transparent', marginBottom: -0.5 }}>{l}</button>
        ))}
      </div>

      {/* Cycles Tab */}
      {tab === 'cycles' && (
        <div>
          <div style={S.card}>
            <div style={{ fontWeight: 500, marginBottom: 14 }}>Create Performance Cycle</div>
            <form onSubmit={hc(d => createCycle.mutate(d))}>
              <div style={S.grid2}>
                <div style={S.fg}><label style={S.label}>Cycle Name</label><input style={S.input} {...rc('name', { required: true })} placeholder="FY2026 Annual" /></div>
                <div style={S.fg}><label style={S.label}>Year</label><input style={S.input} type="number" {...rc('year', { required: true })} placeholder="2026" /></div>
                <div style={S.fg}><label style={S.label}>KPI Setting Start</label><input style={S.input} type="date" {...rc('kpi_setting_start', { required: true })} /></div>
                <div style={S.fg}><label style={S.label}>KPI Setting End</label><input style={S.input} type="date" {...rc('kpi_setting_end', { required: true })} /></div>
                <div style={S.fg}><label style={S.label}>Self Eval Start</label><input style={S.input} type="date" {...rc('self_eval_start', { required: true })} /></div>
                <div style={S.fg}><label style={S.label}>Self Eval End</label><input style={S.input} type="date" {...rc('self_eval_end', { required: true })} /></div>
                <div style={S.fg}><label style={S.label}>Manager Eval Start</label><input style={S.input} type="date" {...rc('mgr_eval_start', { required: true })} /></div>
                <div style={S.fg}><label style={S.label}>Manager Eval End</label><input style={S.input} type="date" {...rc('mgr_eval_end', { required: true })} /></div>
              </div>
              <button type="submit" style={S.btnPrimary}>Create Cycle</button>
            </form>
          </div>
          <div style={S.card}>
            <div style={{ fontWeight: 500, marginBottom: 12 }}>Existing Cycles</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr>{['Name','Year','Status','KPI Window'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>{(cycles as any[]).map((c: any) => (
                <tr key={c.id}>
                  <td style={S.td}>{c.name}</td>
                  <td style={S.td}>{c.year}</td>
                  <td style={S.td}><span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#f0f9ff', color: '#0369a1' }}>{c.status}</span></td>
                  <td style={S.td}>{c.kpi_setting_start} → {c.kpi_setting_end}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* User Management Tab */}
      {tab === 'users' && (
        <div>
          {/* User sub-tabs */}
          <div style={{ display: 'flex', gap: 2, borderBottom: '0.5px solid #e5e4df', marginBottom: 16 }}>
            {USER_TABS.map(([t, l]) => (
              <button key={t} onClick={() => setUserTab(t as any)} style={{ padding: '7px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 12, color: userTab === t ? '#1a1a18' : '#888', fontWeight: userTab === t ? 500 : 400,
                borderBottom: userTab === t ? '2px solid #1a1a18' : '2px solid transparent', marginBottom: -0.5 }}>{l}</button>
            ))}
          </div>
          {userTab === 'list'      && <UserListTab users={users as any[]} depts={depts as any[]} />}
          {userTab === 'add'       && <AddUserTab  users={users as any[]} depts={depts as any[]} />}
          {userTab === 'import'    && <CsvImportTab />}
          {userTab === 'reporting' && <ReportingLinesTab users={users as any[]} />}
        </div>
      )}

      {/* Departments Tab */}
      {tab === 'depts' && (
        <div style={S.card}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Departments ({(depts as any[]).length})</div>
          {(depts as any[]).map((d: any) => (
            <div key={d.id} style={{ padding: '8px 0', borderBottom: '0.5px solid #f0f0ee', fontSize: 13, display: 'flex', gap: 10 }}>
              <span style={{ fontWeight: 500 }}>{d.name}</span>
              <span style={{ color: '#888' }}>{d.code}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
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
