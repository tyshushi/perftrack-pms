import React, { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi, departmentsApi, api } from '../api/client';
import UserProfileDrawer from '../components/common/UserProfileDrawer';

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

function downloadCsv(filename: string, rows: string[][]) {
  const content = rows
    .map(r => r.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
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
    'Employee Code', 'Name', 'Email', 'Employment Unit', 'Department',
    'Division', 'Section', 'Position Title', 'Grade', 'Category',
    'Country', 'Work Location', 'Employee Type', 'Hire Date', 'Gender', 'ROLE',
  ];
  const example = [
    'EMP001', 'Ahmad bin Ali', 'ahmad.ali@company.com', 'Corporate', 'Finance',
    'Financial Control', 'Reporting', 'Finance Executive', 'G3', 'Permanent',
    'Malaysia', 'Kuala Lumpur HQ', 'Full Time', '01/01/2020', 'Male', 'STAFF',
  ];
  downloadCsv('employee_import_template.csv', [headers, example]);
}

function exportReportingLinesTemplate() {
  const headers = ['Employee Code', 'Name', 'Direct Manager Code', 'Reviewing Manager Code', 'HOD Code'];
  const example = ['EMP005', 'Aisha Rahman', 'EMP004', 'EMP003', 'EMP002'];
  downloadCsv('reporting_lines_template.csv', [headers, example]);
}

function exportReportingLinesAudit(users: any[]) {
  const userMap = Object.fromEntries(users.map((u: any) => [u.id, u]));
  const headers = [
    'Employee Code', 'Name',
    'Direct Manager Code', 'Direct Manager Name',
    'Reviewing Manager Code', 'Reviewing Manager Name',
    'HOD Code', 'HOD Name', 'Approval Levels',
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
  downloadCsv(`reporting_lines_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows]);
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#e8f1fb', color: '#185fa5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
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

function UserListTab({ users, depts }: { users: any[]; depts: any[] }) {
  const [search,     setSearch]   = useState('');
  const [roleFilter, setRole]     = useState('');
  const [deptFilter, setDept]     = useState('');
  const [page,       setPage]     = useState(1);
  const [selected,   setSelected] = useState<any>(null);
  const [rlResult,   setRlResult] = useState<any>(null);
  const [rlLoading,  setRlLoading] = useState(false);
  const rlFileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const deptMap = Object.fromEntries(depts.map((d: any) => [d.id, d.name]));

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const match = !q || [
      u.full_name, u.employee_id, u.email, u.role,
      u.job_grade, u.position_title, u.division, u.section,
      u.department_id ? deptMap[u.department_id] : '',
    ].some(f => f?.toLowerCase().includes(q));
    return match &&
      (!roleFilter || u.role === roleFilter) &&
      (!deptFilter || u.department_id === deptFilter);
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleDeactivate(u: any, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`Deactivate ${u.full_name}? They will lose access immediately.`)) return;
    try {
      await usersApi.deactivate(u.id);
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to deactivate user');
    }
  }

  async function handleReactivate(u: any, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await usersApi.reactivate(u.id);
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to reactivate user');
    }
  }

  async function handleRlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRlResult(null); setRlLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/users/import/reporting-lines', fd,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      setRlResult(res.data);
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Upload failed');
    } finally {
      setRlLoading(false);
      if (rlFileRef.current) rlFileRef.current.value = '';
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          style={{ ...S.input, flex: 1, minWidth: 200 }}
          placeholder="Search name, code, email, grade, position..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <select style={{ ...S.input, width: 148 }} value={roleFilter}
          onChange={e => { setRole(e.target.value); setPage(1); }}>
          <option value="">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select style={{ ...S.input, width: 168 }} value={deptFilter}
          onChange={e => { setDept(e.target.value); setPage(1); }}>
          <option value="">All Departments</option>
          {depts.map((d: any) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: C.textSecond, alignSelf: 'center', whiteSpace: 'nowrap' }}>
          {filtered.length} user{filtered.length !== 1 ? 's' : ''}
        </span>
        <button style={S.btnSm} onClick={() => exportUsersAudit(users, depts)}>↓ Full Audit CSV</button>
      </div>

      <div style={{ ...S.card, background: C.bgSecondary, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, color: C.text }}>Upload Reporting Lines</div>
            <div style={{ fontSize: 12, color: C.textSecond }}>
              CSV: Employee Code, Name, Direct Manager Code, Reviewing Manager Code, HOD Code. Blank = keep existing.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
            <button style={S.btnSm} onClick={() => exportReportingLinesAudit(users)}>↓ Current Lines</button>
            <button style={S.btnSm} onClick={exportReportingLinesTemplate}>↓ Template</button>
            <input ref={rlFileRef} type="file" accept=".csv" onChange={handleRlUpload} style={{ display: 'none' }} />
            <button style={S.btnPrimary}
              onClick={() => { setRlResult(null); rlFileRef.current?.click(); }}
              disabled={rlLoading}>
              {rlLoading ? 'Uploading...' : '↑ Upload'}
            </button>
          </div>
        </div>
        {rlResult && (
          <div style={{ marginTop: 12, padding: 12, background: C.bg, borderRadius: 8, border: `1px solid ${C.borderLight}` }}>
            <div style={{ fontWeight: 600, color: '#166534', marginBottom: 4 }}>✓ {rlResult.message}</div>
            <div style={{ display: 'flex', gap: 14, fontSize: 13, flexWrap: 'wrap', color: C.textSecond }}>
              <span>Updated: <strong>{rlResult.updated}</strong></span>
              <span>Skipped: <strong>{rlResult.skipped}</strong></span>
              {rlResult.not_found?.length > 0 && (
                <span style={{ color: '#991b1b' }}>
                  Not found: <strong>{rlResult.not_found.length}</strong>
                  {' '}({rlResult.not_found.slice(0, 3).join(', ')}{rlResult.not_found.length > 3 ? '...' : ''})
                </span>
              )}
            </div>
            {rlResult.warnings?.slice(0, 3).map((w: string, i: number) => (
              <div key={i} style={{ fontSize: 11, color: '#854d0e', marginTop: 4 }}>• {w}</div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: C.bgSecondary }}>
              {['Employee', 'Code', 'Position', 'Department', 'Grade', 'Role', 'Status', 'Actions'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 32, textAlign: 'center', color: C.textSecond }}>No users found</td>
              </tr>
            )}
            {paginated.map((u: any) => (
              <tr key={u.id} onClick={() => setSelected(u)} style={{ cursor: 'pointer', background: C.bg }}
                onMouseEnter={e => (e.currentTarget.style.background = C.bgSecondary)}
                onMouseLeave={e => (e.currentTarget.style.background = C.bg)}>
                <td style={S.td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name={u.full_name} />
                    <div>
                      <div style={{ fontWeight: 500, color: C.text }}>{u.full_name}</div>
                      <div style={{ fontSize: 11, color: C.textSecond }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={S.td}>{u.employee_id}</td>
                <td style={S.td}>{u.position_title || '—'}</td>
                <td style={S.td}>{u.department_id ? (Object.fromEntries(depts.map((d: any) => [d.id, d.name]))[u.department_id] || '—') : '—'}</td>
                <td style={S.td}>{u.job_grade || '—'}</td>
                <td style={S.td}><RolePill role={u.role} /></td>
                <td style={S.td}>
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: u.is_active !== false ? '#dcfce7' : '#fee2e2', color: u.is_active !== false ? '#166534' : '#991b1b' }}>
                    {u.is_active !== false ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={S.td}>
                  {u.is_active !== false ? (
                    <button
                      style={{ ...S.btnSm, color: '#991b1b', borderColor: '#fca5a5' }}
                      onClick={(e) => handleDeactivate(u, e)}
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      style={{ ...S.btnSm, color: '#166534', borderColor: '#86efac' }}
                      onClick={(e) => handleReactivate(u, e)}
                    >
                      Reactivate
                    </button>
                  )}
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
                {i > 0 && arr[i - 1] !== p - 1 && (
                  <span style={{ padding: '0 4px', color: C.textSecond }}>...</span>
                )}
                <button onClick={() => setPage(p)} style={{ ...S.btnSm, background: p === page ? C.text : C.bg, color: p === page ? '#ffffff' : C.textSecond, borderColor: p === page ? C.text : C.border }}>
                  {p}
                </button>
              </span>
            ))}
          <button style={S.btnSm} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {selected && (
        <UserProfileDrawer user={selected} users={users} depts={depts} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function CsvImportTab() {
  const qc = useQueryClient();
  const fileRef                     = useRef<HTMLInputElement>(null);
  const [preview,   setPreview]     = useState<any[]>([]);
  const [summary,   setSummary]     = useState<any>(null);
  const [importing, setImporting]   = useState(false);
  const [result,    setResult]      = useState<any>(null);
  const [selected,  setSelected]    = useState<Record<string, string>>({});
  const [filter,    setFilter]      = useState('');

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
    const BATCH_SIZE = 20;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalDeactivated = 0;
    let totalSkipped = 0;

    try {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const res = await api.post('/users/import/confirm', { rows: batch });
        totalCreated     += res.data.created     || 0;
        totalUpdated     += res.data.updated      || 0;
        totalDeactivated += res.data.deactivated  || 0;
        totalSkipped     += res.data.skipped      || 0;
      }
      setResult({
        created:     totalCreated,
        updated:     totalUpdated,
        deactivated: totalDeactivated,
        skipped:     totalSkipped,
        message:     `Import complete. New users get temporary password: Welcome@1234`,
      });
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
        <div style={{ fontWeight: 600, marginBottom: 6, color: C.text }}>Upload Employee CSV</div>
        <p style={{ fontSize: 12, color: C.textSecond, marginBottom: 14 }}>
          Required columns: <code>Employee Code, Name, Employment Unit, Department, Division, Section, Position Title, Grade, Category, Country, Work Location, Employee Type, Hire Date, Gender, ROLE</code>
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} style={{ display: 'none' }} />
          <button style={S.btnPrimary} onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? 'Analysing...' : '↑ Upload CSV'}
          </button>
          <button style={S.btnSm} onClick={exportCsvTemplate}>↓ Download Template</button>
          {summary && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { label: `New: ${summary.new}`,         bg: '#dcfce7', color: '#166534', f: 'NEW' },
                { label: `Duplicate: ${summary.duplicates}`, bg: '#fef9c3', color: '#854d0e', f: 'DUPLICATE' },
                { label: `Missing: ${summary.missing}`, bg: '#fee2e2', color: '#991b1b', f: 'MISSING' },
                ...(summary.errors > 0 ? [{ label: `Errors: ${summary.errors}`, bg: '#fce7f3', color: '#9d174d', f: 'ERROR' }] : []),
              ].map(s => (
                <button key={s.f} onClick={() => setFilter(filter === s.f ? '' : s.f)}
                  style={{ fontSize: 12, padding: '3px 10px', borderRadius: 10, background: s.bg, color: s.color, cursor: 'pointer', border: filter === s.f ? `1.5px solid ${s.color}` : '1.5px solid transparent' }}>
                  {s.label}
                </button>
              ))}
              {filter && (
                <button onClick={() => setFilter('')} style={{ fontSize: 12, color: C.textSecond, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                  Clear ✕
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {result && (
        <div style={{ ...S.card, background: '#dcfce7', border: '1px solid #86efac' }}>
          <div style={{ fontWeight: 600, color: '#166534', marginBottom: 6 }}>Import Complete ✓</div>
          <div style={{ fontSize: 13, color: '#166534' }}>
            Created: {result.created} · Updated: {result.updated} · Deactivated: {result.deactivated} · Skipped: {result.skipped}
          </div>
        </div>
      )}

      {preview.length > 0 && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 600, color: C.text }}>Preview — {filtered.length} of {preview.length} rows</div>
              <div style={{ fontSize: 12, color: C.textSecond, marginTop: 2 }}>{Object.keys(selected).length} selected</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={S.btnSm} onClick={() => selectAll('NEW', 'create')}>All new</button>
              <button style={S.btnSm} onClick={() => selectAll('DUPLICATE', 'update')}>All updates</button>
              <button style={{ ...S.btnSm, color: '#991b1b', borderColor: '#fca5a5' }} onClick={() => selectAll('MISSING', 'deactivate')}>All missing</button>
              <button style={S.btnSm} onClick={() => setSelected({})}>Clear</button>
              <button onClick={handleConfirm} disabled={importing || Object.keys(selected).length === 0} style={S.btnPrimary}>
                {importing ? 'Importing...' : `Confirm (${Object.keys(selected).length})`}
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto', border: `1px solid ${C.borderLight}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: C.bgSecondary }}>
                  {['', 'Status', 'Code', 'Name', 'Email', 'Dept', 'Grade', 'Role', 'Notes'].map(h => (
                    <th key={h} style={{ ...S.th, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row: any, i: number) => {
                  const ss = STATUS_STYLE[row.status] || STATUS_STYLE.ERROR;
                  const code = row.employee_code;
                  return (
                    <tr key={i} style={{ background: selected[code] ? '#f0fdf4' : i % 2 === 0 ? C.bg : C.bgSecondary }}>
                      <td style={{ ...S.td, width: 32 }}>
                        {row.status === 'NEW' && <input type="checkbox" checked={selected[code] === 'create'} onChange={() => toggle(code, 'create')} />}
                        {row.status === 'DUPLICATE' && <input type="checkbox" checked={selected[code] === 'update'} onChange={() => toggle(code, 'update')} />}
                        {row.status === 'MISSING' && <input type="checkbox" checked={selected[code] === 'deactivate'} onChange={() => toggle(code, 'deactivate')} />}
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
                      <td style={S.td}>{row.grade || '—'}</td>
                      <td style={S.td}>{row.role || '—'}</td>
                      <td style={{ ...S.td, maxWidth: 180, color: C.textSecond, fontSize: 11 }}>
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

function ReportingLinesTab({ users }: { users: any[] }) {
  const [search, setSearch] = useState('');

  function getReports(id: string) {
    return users.filter((u: any) => u.direct_manager_id === id);
  }

  function matchesSearch(u: any) {
    if (!search) return true;
    const q = search.toLowerCase();
    return [u.full_name, u.employee_id, u.role, u.position_title].some(f => f?.toLowerCase().includes(q));
  }

  function hasMatch(u: any): boolean {
    return matchesSearch(u) || getReports(u.id).some(r => hasMatch(r));
  }

  function TreeNode({ user, depth }: { user: any; depth: number }) {
    const [open, setOpen] = useState(depth < 2);
    const reports  = getReports(user.id).filter(r => hasMatch(r));
    const isMatch  = matchesSearch(user);
    const highlight = isMatch && search;

    return (
      <div style={{ marginLeft: depth * 20 }}>
        <div onClick={() => reports.length > 0 && setOpen(!open)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, marginBottom: 2, cursor: reports.length > 0 ? 'pointer' : 'default', background: highlight ? C.bgWarning : 'transparent' }}
          onMouseEnter={e => { if (!highlight) e.currentTarget.style.background = C.bgSecondary; }}
          onMouseLeave={e => { e.currentTarget.style.background = highlight ? C.bgWarning : 'transparent'; }}>
          <span style={{ fontSize: 10, color: C.textSecond, width: 12, flexShrink: 0 }}>
            {reports.length > 0 ? (open ? '▼' : '▶') : ''}
          </span>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e8f1fb', color: '#185fa5', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600 }}>
            {user.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{user.full_name}</div>
            <div style={{ fontSize: 11, color: C.textSecond }}>
              {user.employee_id} · {ROLE_LABELS[user.role] || user.role}
              {user.position_title ? ` · ${user.position_title}` : ''}
            </div>
          </div>
          {reports.length > 0 && (
            <span style={{ fontSize: 11, color: C.textSecond, flexShrink: 0 }}>
              {reports.length} report{reports.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {open && reports.map((r: any) => <TreeNode key={r.id} user={r} depth={depth + 1} />)}
      </div>
    );
  }

  const roots = users.filter((u: any) => !u.direct_manager_id).filter(r => hasMatch(r));

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
      <div style={{ background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16 }}>
        {roots.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: C.textSecond, fontSize: 13 }}>
            {search ? 'No matches found' : 'No root employees — everyone has a direct manager assigned'}
          </div>
        )}
        {roots.map((u: any) => <TreeNode key={u.id} user={u} depth={0} />)}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [userTab, setUserTab] = useState<'list' | 'import' | 'reporting'>('list');

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn:  () => usersApi.list().then(r => r.data),
  });
  const { data: depts = [] } = useQuery({
    queryKey: ['depts'],
    queryFn:  () => departmentsApi.list().then(r => r.data),
  });

  const USER_TABS = [
    ['list',      'User List'],
    ['import',    'CSV Import'],
    ['reporting', 'Reporting Lines'],
  ] as const;

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: C.text }}>User Management</h1>
        <p style={{ fontSize: 13, color: C.textSecond }}>
          {(users as any[]).length} active users
        </p>
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.borderLight}`, marginBottom: 16 }}>
        {USER_TABS.map(([t, l]) => (
          <button key={t} onClick={() => setUserTab(t as any)}
            style={{ padding: '7px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12, color: userTab === t ? C.text : C.textSecond, fontWeight: userTab === t ? 600 : 400, borderBottom: userTab === t ? `2px solid ${C.text}` : '2px solid transparent', marginBottom: -1, fontFamily: C.font }}>
            {l}
          </button>
        ))}
      </div>

      {userTab === 'list' && <UserListTab users={users as any[]} depts={depts as any[]} />}
      {userTab === 'import' && <CsvImportTab />}
      {userTab === 'reporting' && <ReportingLinesTab users={users as any[]} />}
    </div>
  );
}

const S: Record<string, any> = {
  card:       { background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12 },
  label:      { fontSize: 12, fontWeight: 500, color: C.textSecond, display: 'block', marginBottom: 4 },
  input:      { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none' },
  btnPrimary: { padding: '8px 16px', border: 'none', borderRadius: 8, background: C.text, color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font },
  btnSm:      { padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.textSecond, fontSize: 12, cursor: 'pointer', fontFamily: C.font },
  th:         { textAlign: 'left', padding: '10px', borderBottom: `1px solid ${C.borderLight}`, fontSize: 11, color: C.textSecond, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' },
  td:         { padding: '10px', fontSize: 13, color: C.text },
};
