import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cyclesApi, usersApi, departmentsApi, api } from '../api/client';
import { useForm } from 'react-hook-form';
import { useState, useRef } from 'react';

export default function AdminPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'cycles'|'users'|'import'|'depts'>('cycles');
  const { register: rc, handleSubmit: hc, reset: resetC } = useForm();
  const { register: ru, handleSubmit: hu, reset: resetU } = useForm();

  // Import state
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});

  const { data: cycles = [] } = useQuery({ queryKey:['cycles'], queryFn:()=>cyclesApi.list().then(r=>r.data) });
  const { data: users  = [] } = useQuery({ queryKey:['users'],  queryFn:()=>usersApi.list().then(r=>r.data) });
  const { data: depts  = [] } = useQuery({ queryKey:['depts'],  queryFn:()=>departmentsApi.list().then(r=>r.data) });

  const createCycle = useMutation({ mutationFn:(d:any)=>cyclesApi.create(d), onSuccess:()=>{ qc.invalidateQueries({queryKey:['cycles']}); resetC(); } });
  const createUser  = useMutation({ mutationFn:(d:any)=>usersApi.create(d),  onSuccess:()=>{ qc.invalidateQueries({queryKey:['users']}); resetU(); } });

  const TABS = [['cycles','Cycles'],['users','Users'],['import','CSV Import'],['depts','Departments']] as const;

  const STATUS_STYLE: Record<string, {bg:string;color:string;label:string}> = {
    NEW:       { bg:'#dcfce7', color:'#166534', label:'New' },
    DUPLICATE: { bg:'#fef9c3', color:'#854d0e', label:'Duplicate' },
    MISSING:   { bg:'#fee2e2', color:'#991b1b', label:'Missing' },
    ERROR:     { bg:'#fce7f3', color:'#9d174d', label:'Error' },
  };

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(null); setSummary(null); setImportResult(null); setSelected({});
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/users/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setPreview(res.data.rows);
      setSummary(res.data.summary);
      // Auto-select NEW rows for creation
      const autoSelected: Record<string, string> = {};
      res.data.rows.forEach((r: any) => {
        if (r.status === 'NEW') autoSelected[r.employee_code] = 'create';
      });
      setSelected(autoSelected);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Failed to parse CSV');
    } finally {
      setImporting(false);
    }
  }

  async function handleConfirm() {
    const rows = (preview || [])
      .filter((r: any) => selected[r.employee_code])
      .map((r: any) => ({ ...r, action: selected[r.employee_code] }));

    if (rows.length === 0) {
      alert('No rows selected for import');
      return;
    }
    setImporting(true);
    try {
      const res = await api.post('/users/import/confirm', { rows });
      setImportResult(res.data);
      qc.invalidateQueries({queryKey:['users']});
      setPreview(null);
      setSummary(null);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  function toggleSelect(code: string, status: string, action: string) {
    setSelected(prev => {
      if (prev[code] === action) {
        const next = { ...prev };
        delete next[code];
        return next;
      }
      return { ...prev, [code]: action };
    });
  }

  return (
    <div>
      <h1 style={{ fontSize:20, fontWeight:500, marginBottom:4 }}>HR Admin</h1>
      <p style={{ fontSize:13, color:'#888', marginBottom:20 }}>Manage cycles, users, and system configuration</p>

      <div style={{ display:'flex', gap:2, borderBottom:'0.5px solid #e5e4df', marginBottom:20 }}>
        {TABS.map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{ padding:'8px 16px', border:'none', background:'transparent', cursor:'pointer',
            fontSize:13, color:tab===t?'#1a1a18':'#888', fontWeight:tab===t?500:400,
            borderBottom:tab===t?'2px solid #1a1a18':'2px solid transparent', marginBottom:-0.5 }}>{l}</button>
        ))}
      </div>

      {tab === 'cycles' && (
        <div>
          <div style={S.card}>
            <div style={{ fontWeight:500, marginBottom:14 }}>Create Performance Cycle</div>
            <form onSubmit={hc(d=>createCycle.mutate(d))}>
              <div style={S.grid2}>
                <div style={S.fg}><label style={S.label}>Cycle Name</label><input style={S.input} {...rc('name',{required:true})} placeholder="FY2026 Annual"/></div>
                <div style={S.fg}><label style={S.label}>Year</label><input style={S.input} type="number" {...rc('year',{required:true})} placeholder="2026"/></div>
                <div style={S.fg}><label style={S.label}>KPI Setting Start</label><input style={S.input} type="date" {...rc('kpi_setting_start',{required:true})}/></div>
                <div style={S.fg}><label style={S.label}>KPI Setting End</label><input style={S.input} type="date" {...rc('kpi_setting_end',{required:true})}/></div>
                <div style={S.fg}><label style={S.label}>Self Eval Start</label><input style={S.input} type="date" {...rc('self_eval_start',{required:true})}/></div>
                <div style={S.fg}><label style={S.label}>Self Eval End</label><input style={S.input} type="date" {...rc('self_eval_end',{required:true})}/></div>
                <div style={S.fg}><label style={S.label}>Manager Eval Start</label><input style={S.input} type="date" {...rc('mgr_eval_start',{required:true})}/></div>
                <div style={S.fg}><label style={S.label}>Manager Eval End</label><input style={S.input} type="date" {...rc('mgr_eval_end',{required:true})}/></div>
              </div>
              <button type="submit" style={S.btnPrimary}>Create Cycle</button>
            </form>
          </div>
          <div style={S.card}>
            <div style={{ fontWeight:500, marginBottom:12 }}>Existing Cycles</div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr>{['Name','Year','Status','KPI Window'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>{(cycles as any[]).map((c:any)=>(
                <tr key={c.id}>
                  <td style={S.td}>{c.name}</td>
                  <td style={S.td}>{c.year}</td>
                  <td style={S.td}><span style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'#f0f9ff', color:'#0369a1' }}>{c.status}</span></td>
                  <td style={S.td}>{c.kpi_setting_start} → {c.kpi_setting_end}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div>
          <div style={S.card}>
            <div style={{ fontWeight:500, marginBottom:14 }}>Add User</div>
            <form onSubmit={hu(d=>createUser.mutate(d))}>
              <div style={S.grid2}>
                <div style={S.fg}><label style={S.label}>Employee ID</label><input style={S.input} {...ru('employee_id',{required:true})} placeholder="EMP001"/></div>
                <div style={S.fg}><label style={S.label}>Full Name</label><input style={S.input} {...ru('full_name',{required:true})} placeholder="Aisha Rahman"/></div>
                <div style={S.fg}><label style={S.label}>Email</label><input style={S.input} type="email" {...ru('email',{required:true})} placeholder="aisha@company.com"/></div>
                <div style={S.fg}><label style={S.label}>Role</label>
                  <select style={S.input} {...ru('role',{required:true})}>
                    {['STAFF','MANAGER','MGR2','HOD','HR_ADMIN'].map(r=><option key={r}>{r}</option>)}
                  </select>
                </div>
                <div style={S.fg}><label style={S.label}>Job Grade</label><input style={S.input} {...ru('job_grade')} placeholder="G1"/></div>
                <div style={S.fg}><label style={S.label}>Password</label><input style={S.input} type="password" {...ru('password',{required:true})} placeholder="Temporary password"/></div>
              </div>
              <button type="submit" style={S.btnPrimary}>Create User</button>
            </form>
          </div>
          <div style={S.card}>
            <div style={{ fontWeight:500, marginBottom:12 }}>Users ({(users as any[]).length})</div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr>{['Name','ID','Role','Grade'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>{(users as any[]).map((u:any)=>(
                <tr key={u.id}>
                  <td style={S.td}>{u.full_name}</td>
                  <td style={S.td}>{u.employee_id}</td>
                  <td style={S.td}>{u.role}</td>
                  <td style={S.td}>{u.job_grade || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'import' && (
        <div>
          <div style={S.card}>
            <div style={{ fontWeight:500, marginBottom:6 }}>Upload Employee CSV</div>
            <p style={{ fontSize:12, color:'#888', marginBottom:14 }}>
              Required columns: Employee Code, Name, Employment Unit, Department, Division, Section, Position Title, Grade, Category, Country, Work Location, Employee Type, Hire Date, Gender, ROLE
            </p>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleFileUpload} style={{ display:'none' }} />
              <button style={S.btnPrimary} onClick={()=>fileRef.current?.click()} disabled={importing}>
                {importing ? 'Analysing...' : 'Upload CSV'}
              </button>
              {summary && (
                <div style={{ display:'flex', gap:8 }}>
                  <span style={{ fontSize:12, padding:'3px 10px', borderRadius:10, background:'#dcfce7', color:'#166534' }}>New: {summary.new}</span>
                  <span style={{ fontSize:12, padding:'3px 10px', borderRadius:10, background:'#fef9c3', color:'#854d0e' }}>Duplicate: {summary.duplicates}</span>
                  <span style={{ fontSize:12, padding:'3px 10px', borderRadius:10, background:'#fee2e2', color:'#991b1b' }}>Missing: {summary.missing}</span>
                  {summary.errors > 0 && <span style={{ fontSize:12, padding:'3px 10px', borderRadius:10, background:'#fce7f3', color:'#9d174d' }}>Errors: {summary.errors}</span>}
                </div>
              )}
            </div>
          </div>

          {importResult && (
            <div style={{ ...S.card, background:'#dcfce7', border:'0.5px solid #86efac' }}>
              <div style={{ fontWeight:500, color:'#166534', marginBottom:6 }}>Import Complete ✓</div>
              <div style={{ fontSize:13, color:'#166534' }}>
                Created: {importResult.created} · Updated: {importResult.updated} · Deactivated: {importResult.deactivated} · Skipped: {importResult.skipped}
              </div>
              <div style={{ fontSize:12, color:'#166534', marginTop:4 }}>{importResult.message}</div>
            </div>
          )}

          {preview && preview.length > 0 && (
            <div style={S.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <div>
                  <div style={{ fontWeight:500 }}>Preview — {preview.length} rows</div>
                  <div style={{ fontSize:12, color:'#888', marginTop:2 }}>
                    Select actions for each row then click Confirm Import
                  </div>
                </div>
                <button onClick={handleConfirm} disabled={importing} style={S.btnPrimary}>
                  {importing ? 'Importing...' : `Confirm Import (${Object.keys(selected).length} selected)`}
                </button>
              </div>

              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr>
                      {['Status','Employee Code','Name','Email','Dept','Division','Grade','Role','Action'].map(h=>(
                        <th key={h} style={{ ...S.th, fontSize:11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row: any, i: number) => {
                      const ss = STATUS_STYLE[row.status] || STATUS_STYLE.ERROR;
                      const code = row.employee_code;
                      return (
                        <tr key={i} style={{ background: i%2===0 ? '#fff' : '#fafaf8' }}>
                          <td style={S.td}>
                            <span style={{ fontSize:10, padding:'2px 7px', borderRadius:10, background:ss.bg, color:ss.color, fontWeight:500 }}>
                              {ss.label}
                            </span>
                          </td>
                          <td style={S.td}>{code}</td>
                          <td style={S.td}>{row.name}</td>
                          <td style={S.td}>{row.email}</td>
                          <td style={S.td}>{row.department || '—'}</td>
                          <td style={S.td}>{row.division || '—'}</td>
                          <td style={S.td}>{row.grade || '—'}</td>
                          <td style={S.td}>{row.role || '—'}</td>
                          <td style={S.td}>
                            {row.status === 'NEW' && (
                              <label style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer', fontSize:11 }}>
                                <input type="checkbox" checked={selected[code]==='create'} onChange={()=>toggleSelect(code,'NEW','create')}/>
                                Create
                              </label>
                            )}
                            {row.status === 'DUPLICATE' && (
                              <label style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer', fontSize:11 }}>
                                <input type="checkbox" checked={selected[code]==='update'} onChange={()=>toggleSelect(code,'DUPLICATE','update')}/>
                                Update {row.changes && Object.keys(row.changes).length > 0 && `(${Object.keys(row.changes).join(', ')})`}
                              </label>
                            )}
                            {row.status === 'MISSING' && (
                              <label style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer', fontSize:11, color:'#991b1b' }}>
                                <input type="checkbox" checked={selected[code]==='deactivate'} onChange={()=>toggleSelect(code,'MISSING','deactivate')}/>
                                Deactivate
                              </label>
                            )}
                            {row.status === 'ERROR' && <span style={{ color:'#888', fontSize:11 }}>{row.message}</span>}
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
      )}

      {tab === 'depts' && (
        <div style={S.card}>
          <div style={{ fontWeight:500, marginBottom:12 }}>Departments</div>
          {(depts as any[]).map((d:any)=>(
            <div key={d.id} style={{ padding:'8px 0', borderBottom:'0.5px solid #f0f0ee', fontSize:13, display:'flex', gap:10 }}>
              <span style={{ fontWeight:500 }}>{d.name}</span>
              <span style={{ color:'#888' }}>{d.code}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const S: Record<string,React.CSSProperties> = {
  card:   { background:'#fff', border:'0.5px solid #e5e4df', borderRadius:10, padding:16, marginBottom:12 },
  grid2:  { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 },
  fg:     { marginBottom:8 },
  label:  { fontSize:12, fontWeight:500, color:'#666', display:'block', marginBottom:4 },
  input:  { width:'100%', padding:'7px 10px', border:'0.5px solid #d0d0cc', borderRadius:8, fontSize:13, background:'#fff', color:'#1a1a18', fontFamily:'inherit', outline:'none' },
  btnPrimary: { padding:'7px 16px', border:'none', borderRadius:8, background:'#1a1a18', color:'#fff', fontSize:12, cursor:'pointer', fontFamily:'inherit' },
  th:     { textAlign:'left', padding:'6px 10px', borderBottom:'0.5px solid #e5e4df', fontSize:11, color:'#888' },
  td:     { padding:'8px 10px', borderBottom:'0.5px solid #f0f0ee' },
};
