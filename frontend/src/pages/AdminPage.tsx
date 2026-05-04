import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cyclesApi, usersApi, departmentsApi } from '../api/client';
import { useForm } from 'react-hook-form';
import { useState } from 'react';

export default function AdminPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'cycles'|'users'|'depts'>('cycles');
  const { register: rc, handleSubmit: hc, reset: resetC } = useForm();
  const { register: ru, handleSubmit: hu, reset: resetU } = useForm();

  const { data: cycles = [] } = useQuery({ queryKey:['cycles'], queryFn:()=>cyclesApi.list().then(r=>r.data) });
  const { data: users  = [] } = useQuery({ queryKey:['users'],  queryFn:()=>usersApi.list().then(r=>r.data) });
  const { data: depts  = [] } = useQuery({ queryKey:['depts'],  queryFn:()=>departmentsApi.list().then(r=>r.data) });

  const createCycle = useMutation({ mutationFn:(d:any)=>cyclesApi.create(d), onSuccess:()=>{qc.invalidateQueries(['cycles']);resetC();} });
  const createUser  = useMutation({ mutationFn:(d:any)=>usersApi.create(d),  onSuccess:()=>{qc.invalidateQueries(['users']);resetU();} });

  const TABS = [['cycles','Cycles'],['users','Users'],['depts','Departments']] as const;

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
                <div style={S.fg}><label style={S.label}>Department</label>
                  <select style={S.input} {...ru('department_id')}>
                    <option value="">— None —</option>
                    {(depts as any[]).map((d:any)=><option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div style={S.fg}><label style={S.label}>Manager</label>
                  <select style={S.input} {...ru('manager_id')}>
                    <option value="">— None —</option>
                    {(users as any[]).filter((u:any)=>['MANAGER','MGR2','HOD'].includes(u.role)).map((u:any)=><option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
                <div style={S.fg}><label style={S.label}>Password</label><input style={S.input} type="password" {...ru('password',{required:true})} placeholder="Temporary password"/></div>
              </div>
              <button type="submit" style={S.btnPrimary}>Create User</button>
            </form>
          </div>
          <div style={S.card}>
            <div style={{ fontWeight:500, marginBottom:12 }}>Users ({(users as any[]).length})</div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr>{['Name','ID','Role','Grade','Dept'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>{(users as any[]).map((u:any)=>(
                <tr key={u.id}>
                  <td style={S.td}>{u.full_name}</td>
                  <td style={S.td}>{u.employee_id}</td>
                  <td style={S.td}>{u.role}</td>
                  <td style={S.td}>{u.job_grade || '—'}</td>
                  <td style={S.td}>{u.department_id ? (depts as any[]).find((d:any)=>d.id===u.department_id)?.name || '—' : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
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
  btnPrimary: { padding:'7px 16px', border:'none', borderRadius:8, background:'#1a1a18', color:'#fff', fontSize:12, cursor:'pointer' },
  th:     { textAlign:'left', padding:'6px 10px', borderBottom:'0.5px solid #e5e4df', fontSize:11, color:'#888' },
  td:     { padding:'10px', borderBottom:'0.5px solid #f0f0ee' },
};
