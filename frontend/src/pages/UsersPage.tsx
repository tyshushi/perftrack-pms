import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, departmentsApi, api } from '../api/client';
import { useForm } from 'react-hook-form';
const C = {
  bg:           '#ffffff',
  bgSecondary:  '#f7f7f5',
  bgTertiary:   '#efefec',
  bgInfo:       '#e0f2fe',
  bgWarning:    '#fef9c3',
  text:         '#1a1a1a',
  textSecond:   '#6b6b6b',
  textTertiary: '#9a9a9a',
  textInfo:     '#0369a1',
  textDanger:   '#b91c1c',
  border:       '#dcdcd6',
  borderLight:  '#ececea',
  font:         '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
};

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

// ── User List Tab ─────────────────────────────────────────────────────────

function UserListTab({ users, depts }: { users: any[]; depts: any[] }) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<any>(null);
  const qc = useQueryClient();

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || [u.full_name, u.employee_id, u.email, u.role, u.job_grade]
      .some(f => f?.toLowerCase().includes(q));
    const matchRole = !roleFilter || u.role === roleFilter;
    const matchDept = !deptFilter || u.department_id === deptFilter;
    return matchSearch && matchRole && matchDept;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const deptMap = Object.fromEntries(depts.map((d: any) => [d.id, d.name]));

  function handleSearch(val: string) { setSearch(val); setPage(1); }
  function handleRole(val: string)   { setRoleFilter(val); setPage(1); }
  function handleDept(val: string)   { setDeptFilter(val); setPage(1); }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          style={{ ...S.input, flex: 1, minWidth: 200 }}
          placeholder="Search name, code, email, role, grade..."
          value={search}
          onChange={e => handleSearch(e.target.value)}
        />
        <select style={{ ...S.input, width: 160 }} value={roleFilter} onChange={e => handleRole(e.target.value)}>
          <option value="">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select style={{ ...S.input, width: 180 }} value={deptFilter} onChange={e => handleDept(e.target.value)}>
          <option value="">All Departments</option>
          {depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div style={{ fontSize: 12, color: '#888', alignSelf: 'center', whiteSpace: 'nowrap' }}>
          {filtered.length} user{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '0.5px solid #e5e4df', borderRadius: 10, overflow: 'hidden' }}>
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
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#888', fontSize: 13 }}>No users found</td></tr>
            )}
            {paginated.map((u: any) => (
              <tr key={u.id} onClick={() => setSelected(u)}
                style={{ cursor: 'pointer', transition: 'background 0.1s' }}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14 }}>
          <button style={S.btnSm} disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
            .map((p, i, arr) => (
              <span key={p}>
                {i > 0 && arr[i - 1] !== p - 1 && <span style={{ padding: '0 4px', color: '#888' }}>...</span>}
                <button onClick={() => setPage(p)} style={{
                  ...S.btnSm,
                  background: p === page ? '#1a1a18' : 'transparent',
                  color: p === page ? '#fff' : '#444',
                }}>{p}</button>
              </span>
            ))}
          <button style={S.btnSm} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {/* User Detail Drawer */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}
          onClick={() => setSelected(null)}>
          <div style={{ width: 380, background: '#fff', height: '100%', overflowY: 'auto', padding: 24, boxShadow: '-4px 0 20px rgba(0,0,0,0.1)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{ fontWeight: 500, fontSize: 15 }}>User Details</span>
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
              ['Department', selected.department_id ? deptMap[selected.department_id] : '—'],
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

// ── Add User Tab ──────────────────────────────────────────────────────────

function AddUserTab({ depts, users }: { depts: any[]; users: any[] }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm();
  const [success, setSuccess] = useState('');

  const createUser = useMutation({
    mutationFn: (d: any) => usersApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      reset();
      setSuccess('User created successfully. Temporary password: Welcome@1234');
      setTimeout(() => setSuccess(''), 5000);
    },
  });

  const managers = users.filter((u: any) => ['MANAGER', 'HOD', 'HR_ADMIN', 'SUPER_ADMIN'].includes(u.role));

  return (
    <div style={S.card}>
      <div style={{ fontWeight: 500, marginBottom: 4 }}>Add New User</div>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>New users will receive a temporary password: <code>Welcome@1234</code></p>
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

// ── CSV Import Tab ────────────────────────────────────────────────────────

function CsvImportTab() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState('');

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview([]); setSummary(null); setImportResult(null); setSelected({});
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/users/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(res.data.rows);
      setSummary(res.data.summary);
      const autoSelected: Record<string, string> = {};
      res.data.rows.forEach((r: any) => {
        if (r.status === 'NEW') autoSelected[r.employee_code] = 'create';
      });
      setSelected(autoSelected);
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
    if (rows.length === 0) { alert('No rows selected'); return; }
    setImporting(true);
    try {
      const res = await api.post('/users/import/confirm', { rows });
      setImportResult(res.data);
      qc.invalidateQueries({ queryKey: ['users'] });
      setPreview([]); setSummary(null); setSelected({});
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function toggleSelect(code: string, action: string) {
    setSelected(prev => {
      if (prev[code] === action) { const n = { ...prev }; delete n[code]; return n; }
      return { ...prev, [code]: action };
    });
  }

  function selectAll(status: string, action: string) {
    const batch: Record<string, string> = { ...selected };
    preview.filter(r => r.status === status).forEach(r => { batch[r.employee_code] = action; });
    setSelected(batch);
  }

  function deselectAll(status: string) {
    const batch = { ...selected };
    preview.filter(r => r.status === status).forEach(r => { delete batch[r.employee_code]; });
    setSelected(batch);
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
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
          <button style={S.btnPrimary} onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? 'Analysing...' : '↑ Upload CSV'}
          </button>
          {summary && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { label: `New: ${summary.new}`,          bg: '#dcfce7', color: '#166534', filter: 'NEW' },
                { label: `Duplicate: ${summary.duplicates}`, bg: '#fef9c3', color: '#854d0e', filter: 'DUPLICATE' },
                { label: `Missing: ${summary.missing}`,  bg: '#fee2e2', color: '#991b1b', filter: 'MISSING' },
                ...(summary.errors > 0 ? [{ label: `Errors: ${summary.errors}`, bg: '#fce7f3', color: '#9d174d', filter: 'ERROR' }] : []),
              ].map(s => (
                <button key={s.filter} onClick={() => setStatusFilter(statusFilter === s.filter ? '' : s.filter)}
                  style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, background: s.bg, color: s.color,
                    border: statusFilter === s.filter ? `1.5px solid ${s.color}` : '1.5px solid transparent', cursor: 'pointer' }}>
                  {s.label}
                </button>
              ))}
              {statusFilter && <button style={{ fontSize: 12, color: '#888', background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={() => setStatusFilter('')}>Clear filter</button>}
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
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{Object.keys(selected).length} selected for import</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <button style={S.btnSm} onClick={() => selectAll('NEW', 'create')}>All New</button>
                <button style={S.btnSm} onClick={() => selectAll('DUPLICATE', 'update')}>All Updates</button>
                <button style={{ ...S.btnSm, color: '#991b1b', borderColor: '#fca5a5' }} onClick={() => selectAll('MISSING', 'deactivate')}>All Missing</button>
                <button style={S.btnSm} onClick={() => setSelected({})}>Clear</button>
              </div>
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
                  const isSelected = !!selected[code];
                  return (
                    <tr key={i} style={{ background: isSelected ? '#f0fdf4' : i % 2 === 0 ? '#fff' : '#fafaf8' }}>
                      <td style={{ ...S.td, width: 32 }}>
                        {row.status === 'NEW' && (
                          <input type="checkbox" checked={selected[code] === 'create'} onChange={() => toggleSelect(code, 'create')} />
                        )}
                        {row.status === 'DUPLICATE' && (
                          <input type="checkbox" checked={selected[code] === 'update'} onChange={() => toggleSelect(code, 'update')} />
                        )}
                        {row.status === 'MISSING' && (
                          <input type="checkbox" checked={selected[code] === 'deactivate'} onChange={() => toggleSelect(code, 'deactivate')} />
                        )}
                      </td>
                      <td style={S.td}>
                        <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: ss.bg, color: ss.color, fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {ss.label}
                        </span>
                      </td>
                      <td style={S.td}>{code}</td>
                      <td style={{ ...S.td, fontWeight: 500 }}>{row.name}</td>
                      <td style={S.td}>{row.email}</td>
                      <td style={S.td}>{row.department || '—'}</td>
                      <td style={S.td}>{row.division || '—'}</td>
                      <td style={S.td}>{row.section || '—'}</td>
                      <td style={S.td}>{row.grade || '—'}</td>
                      <td style={S.td}>{row.role || '—'}</td>
                      <td style={{ ...S.td, maxWidth: 200, color: '#888' }}>
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

// ── Reporting Lines Tab ───────────────────────────────────────────────────

function ReportingLinesTab({ users }: { users: any[] }) {
  const [search, setSearch] = useState('');

  const byId = Object.fromEntries(users.map((u: any) => [u.id, u]));
  const roots = users.filter((u: any) => !u.manager_id);

  function getReports(managerId: string): any[] {
    return users.filter((u: any) => u.manager_id === managerId);
  }

  function matchesSearch(u: any): boolean {
    if (!search) return true;
    const q = search.toLowerCase();
    return [u.full_name, u.employee_id, u.email, u.role].some(f => f?.toLowerCase().includes(q));
  }

  function hasMatch(u: any): boolean {
    if (matchesSearch(u)) return true;
    return getReports(u.id).some(r => hasMatch(r));
  }

  function TreeNode({ user, depth }: { user: any; depth: number }) {
    const [open, setOpen] = useState(depth < 2);
    const reports = getReports(user.id).filter(r => hasMatch(r));
    const isMatch = matchesSearch(user);

    return (
      <div style={{ marginLeft: depth * 20 }}>
        <div onClick={() => reports.length > 0 && setOpen(!open)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
            background: isMatch && search ? '#fef9c3' : 'transparent',
            cursor: reports.length > 0 ? 'pointer' : 'default',
            marginBottom: 2 }}>
          {reports.length > 0 && (
            <span style={{ fontSize: 10, color: '#888', width: 12 }}>{open ? '▼' : '▶'}</span>
          )}
          {reports.length === 0 && <span style={{ width: 12 }} />}
          <Avatar name={user.full_name} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{user.full_name}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{user.employee_id} · {ROLE_LABELS[user.role] || user.role}</div>
          </div>
          {reports.length > 0 && (
            <span style={{ fontSize: 11, color: '#888' }}>{reports.length} report{reports.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        {open && reports.map((r: any) => <TreeNode key={r.id} user={r} depth={depth + 1} />)}
      </div>
    );
  }

  const visibleRoots = roots.filter(r => hasMatch(r));

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <input style={{ ...S.input, maxWidth: 320 }} placeholder="Search by name, code, or role..."
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div style={{ background: '#fff', border: '0.5px solid #e5e4df', borderRadius: 10, padding: 16 }}>
        {visibleRoots.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: '#888', fontSize: 13 }}>
            {search ? 'No matches found' : 'No users without a manager (no root nodes)'}
          </div>
        )}
        {visibleRoots.map((u: any) => <TreeNode key={u.id} user={u} depth={0} />)}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [tab, setTab] = useState<'list' | 'add' | 'import' | 'reporting'>('list');

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then(r => r.data),
  });

  const { data: depts = [] } = useQuery({
    queryKey: ['depts'],
    queryFn: () => departmentsApi.list().then(r => r.data),
  });

  const TABS = [
    ['list',      'User List'],
    ['add',       'Add User'],
    ['import',    'CSV Import'],
    ['reporting', 'Reporting Lines'],
  ] as const;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>User Management</h1>
        <p style={{ fontSize: 13, color: '#888' }}>{(users as any[]).length} active users</p>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: '0.5px solid #e5e4df', marginBottom: 20 }}>
        {TABS.map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 13, color: tab === t ? '#1a1a18' : '#888', fontWeight: tab === t ? 500 : 400,
            borderBottom: tab === t ? '2px solid #1a1a18' : '2px solid transparent', marginBottom: -0.5,
          }}>{l}</button>
        ))}
      </div>

      {tab === 'list'      && <UserListTab users={users as any[]} depts={depts as any[]} />}
      {tab === 'add'       && <AddUserTab  users={users as any[]} depts={depts as any[]} />}
      {tab === 'import'    && <CsvImportTab />}
      {tab === 'reporting' && <ReportingLinesTab users={users as any[]} />}
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
