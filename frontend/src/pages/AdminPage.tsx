'Division', 'Section', 'Position Title', 'Grade', 'Category',
'Country', 'Work Location', 'Employee Type', 'Hire Date',
'Gender', 'ROLE',
    'Direct Manager Code', 'Reviewing Manager Code', 'HOD Code',
];
const example = [
'EMP001', 'Ahmad bin Ali', 'Corporate', 'Finance',
'Financial Control', 'Reporting', 'Finance Executive', 'G3', 'Permanent',
'Malaysia', 'Kuala Lumpur HQ', 'Full Time', '01/01/2020',
    'Male', 'STAFF', 'EMP010', 'EMP020', 'EMP030',
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
@@ -122,6 +155,9 @@ function UserListTab({ users, depts }: { users: any[]; depts: any[] }) {
const [deptFilter, setDept]     = useState('');
const [page,       setPage]     = useState(1);
const [selected,   setSelected] = useState<any>(null);
  const [rlResult,   setRlResult] = useState<any>(null);
  const [rlLoading,  setRlLoading] = useState(false);
  const rlFileRef = useRef<HTMLInputElement>(null);

const deptMap = Object.fromEntries(depts.map((d: any) => [d.id, d.name]));

@@ -140,9 +176,28 @@ function UserListTab({ users, depts }: { users: any[]; depts: any[] }) {
const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function handleRlUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRlResult(null);
    setRlLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/users/import/reporting-lines', fd,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      setRlResult(res.data);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Upload failed');
    } finally {
      setRlLoading(false);
      if (rlFileRef.current) rlFileRef.current.value = '';
    }
  }

return (
<div>
      {/* Filters + export */}
      {/* Filters + exports */}
<div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
<input
style={{ ...S.input, flex: 1, minWidth: 200 }}
@@ -153,7 +208,9 @@ function UserListTab({ users, depts }: { users: any[]; depts: any[] }) {
<select style={{ ...S.input, width: 150 }} value={roleFilter}
onChange={e => { setRole(e.target.value); setPage(1); }}>
<option value="">All Roles</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
</select>
<select style={{ ...S.input, width: 170 }} value={deptFilter}
onChange={e => { setDept(e.target.value); setPage(1); }}>
@@ -164,17 +221,101 @@ function UserListTab({ users, depts }: { users: any[]; depts: any[] }) {
{filtered.length} user{filtered.length !== 1 ? 's' : ''}
</span>
<button style={S.btnSm} onClick={() => exportUsersAudit(users, depts)}>
          ↓ Export Audit CSV
          ↓ Full Audit CSV
</button>
</div>

      {/* Reporting line upload section */}
      <div style={{ ...S.card, background: '#f9f9f7' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 2 }}>
              Upload Reporting Lines
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>
              CSV with: Employee Code, Name, Direct Manager Code,
              Reviewing Manager Code, HOD Code.
              Blank = keep existing.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button style={S.btnSm} onClick={exportReportingLinesAudit.bind(null, users)}>
              ↓ Current Reporting Lines
            </button>
            <button style={S.btnSm} onClick={exportReportingLinesTemplate}>
              ↓ Template
            </button>
            <input ref={rlFileRef} type="file" accept=".csv"
              onChange={handleRlUpload} style={{ display: 'none' }} />
            <button style={S.btnPrimary}
              onClick={() => { setRlResult(null); rlFileRef.current?.click(); }}
              disabled={rlLoading}>
              {rlLoading ? 'Uploading...' : '↑ Upload Reporting Lines'}
            </button>
          </div>
        </div>

        {/* Result summary */}
        {rlResult && (
          <div style={{ marginTop: 14, padding: 14, background: '#fff',
            borderRadius: 8, border: '0.5px solid #e5e4df' }}>
            <div style={{ fontWeight: 500, color: '#166534', marginBottom: 8 }}>
              ✓ {rlResult.message}
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
              <span>Updated: <strong>{rlResult.updated}</strong></span>
              <span>Skipped: <strong>{rlResult.skipped}</strong></span>
              {rlResult.not_found?.length > 0 && (
                <span style={{ color: '#991b1b' }}>
                  Not found: <strong>{rlResult.not_found.length}</strong>
                  {' '}({rlResult.not_found.slice(0, 5).join(', ')}
                  {rlResult.not_found.length > 5 ? '...' : ''})
                </span>
              )}
              {rlResult.name_mismatches?.length > 0 && (
                <span style={{ color: '#854d0e' }}>
                  Name mismatches: <strong>{rlResult.name_mismatches.length}</strong>
                </span>
              )}
            </div>
            {rlResult.warnings?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#888',
                  marginBottom: 4 }}>Warnings:</div>
                {rlResult.warnings.slice(0, 5).map((w: string, i: number) => (
                  <div key={i} style={{ fontSize: 11, color: '#854d0e' }}>• {w}</div>
                ))}
                {rlResult.warnings.length > 5 && (
                  <div style={{ fontSize: 11, color: '#888' }}>
                    ...and {rlResult.warnings.length - 5} more
                  </div>
                )}
              </div>
            )}
            {rlResult.name_mismatches?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#888',
                  marginBottom: 4 }}>Name mismatches (updated anyway):</div>
                {rlResult.name_mismatches.slice(0, 3).map((m: any, i: number) => (
                  <div key={i} style={{ fontSize: 11, color: '#854d0e' }}>
                    • {m.code}: expected "{m.expected}", got "{m.got}"
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

{/* Table */}
<div style={{ background: '#fff', border: '0.5px solid #e5e4df',
borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
<thead>
<tr style={{ background: '#fafaf8' }}>
              {['Employee', 'Code', 'Position', 'Department', 'Grade', 'Role', 'Status'].map(h => (
              {['Employee', 'Code', 'Position', 'Department',
                'Grade', 'Role', 'Status'].map(h => (
<th key={h} style={S.th}>{h}</th>
))}
</tr>
@@ -188,7 +329,8 @@ function UserListTab({ users, depts }: { users: any[]; depts: any[] }) {
</tr>
)}
{paginated.map((u: any) => (
              <tr key={u.id} onClick={() => setSelected(u)} style={{ cursor: 'pointer' }}
              <tr key={u.id} onClick={() => setSelected(u)}
                style={{ cursor: 'pointer' }}
onMouseEnter={e => (e.currentTarget.style.background = '#fafaf8')}
onMouseLeave={e => (e.currentTarget.style.background = '')}>
<td style={S.td}>
@@ -202,7 +344,9 @@ function UserListTab({ users, depts }: { users: any[]; depts: any[] }) {
</td>
<td style={S.td}>{u.employee_id}</td>
<td style={S.td}>{u.position_title || '—'}</td>
                <td style={S.td}>{u.department_id ? deptMap[u.department_id] || '—' : '—'}</td>
                <td style={S.td}>
                  {u.department_id ? deptMap[u.department_id] || '—' : '—'}
                </td>
<td style={S.td}>{u.job_grade || '—'}</td>
<td style={S.td}><RolePill role={u.role} /></td>
<td style={S.td}>
@@ -221,7 +365,8 @@ function UserListTab({ users, depts }: { users: any[]; depts: any[] }) {
{/* Pagination */}
{totalPages > 1 && (
<div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
          <button style={S.btnSm} disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <button style={S.btnSm} disabled={page === 1}
            onClick={() => setPage(p => p - 1)}>← Prev</button>
{Array.from({ length: totalPages }, (_, i) => i + 1)
.filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
.map((p, i, arr) => (
@@ -236,10 +381,12 @@ function UserListTab({ users, depts }: { users: any[]; depts: any[] }) {
}}>{p}</button>
</span>
))}
          <button style={S.btnSm} disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          <button style={S.btnSm} disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}>Next →</button>
</div>
)}

      {/* Profile drawer */}
{selected && (
<UserProfileDrawer
user={selected}
