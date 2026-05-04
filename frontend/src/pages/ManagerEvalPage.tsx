import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kpisApi, usersApi, cyclesApi } from '../api/client';
import { useAuthStore } from '../store/auth';

const PENDING_FOR_ROLE: Record<string, string> = {
  MANAGER: 'PENDING_MGR',
  MGR2: 'PENDING_MGR2',
  HOD: 'PENDING_HOD',
  HR_ADMIN: 'PENDING_HOD',
  SUPER_ADMIN: 'PENDING_HOD',
};

export default function ManagerEvalPage() {
  const { user } = useAuthStore();
  const role = user?.role || 'MANAGER';
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState('');
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'pending'|'done'>('pending');

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'], queryFn: () => cyclesApi.list().then(r => r.data),
    onSuccess: (d: any[]) => { if (d.length && !cycleId) setCycleId(d[0].id); }
  });

  const { data: reports = [] } = useQuery({
    queryKey: ['direct-reports'],
    queryFn: () => usersApi.directReports().then(r => r.data),
  });

  const { data: kpis = [] } = useQuery({
    queryKey: ['kpis', cycleId, selectedReport?.id],
    queryFn: () => kpisApi.list(cycleId, selectedReport?.id).then(r => r.data),
    enabled: !!cycleId && !!selectedReport,
  });

  const myPendingStatus = PENDING_FOR_ROLE[role] || 'PENDING_MGR';
  const pendingKpis = (kpis as any[]).filter(k => k.status === myPendingStatus);
  const doneKpis    = (kpis as any[]).filter(k => k.status !== myPendingStatus && k.status !== 'DRAFT');
  const displayKpis = tab === 'pending' ? pendingKpis : doneKpis;

  const evalMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      kpisApi.evaluate(id, scores[id], comments[id] || '', action),
    onSuccess: () => qc.invalidateQueries(['kpis']),
  });

  const RATINGS = [1,2,3,4,5];
  const LABELS  = ['','Unsatisfactory','Needs Improvement','Meets Expectations','Exceeds Expectations','Outstanding'];

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:500 }}>Team Evaluation</h1>
          <p style={{ fontSize:13, color:'#888' }}>Review and score your direct reports' KPIs</p>
        </div>
        <select style={S.select} value={cycleId} onChange={e => setCycleId(e.target.value)}>
          {(cycles as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Report selector */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {(reports as any[]).map((r: any) => (
          <button key={r.id} onClick={() => setSelectedReport(r)}
            style={{ padding:'7px 14px', borderRadius:8, border:`0.5px solid ${selectedReport?.id===r.id?'#1a1a18':'#d0d0cc'}`,
              background: selectedReport?.id===r.id ? '#1a1a18' : '#fff',
              color: selectedReport?.id===r.id ? '#fff' : '#444', fontSize:13, cursor:'pointer' }}>
            {r.full_name}
          </button>
        ))}
        {reports.length === 0 && <span style={{ color:'#888', fontSize:13 }}>No direct reports found.</span>}
      </div>

      {selectedReport && (
        <>
          <div style={{ display:'flex', gap:2, borderBottom:'0.5px solid #e5e4df', marginBottom:16 }}>
            {(['pending','done'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding:'8px 16px', border:'none', background:'transparent', cursor:'pointer', fontSize:13,
                  color: tab===t ? '#1a1a18' : '#888', fontWeight: tab===t ? 500 : 400,
                  borderBottom: tab===t ? '2px solid #1a1a18' : '2px solid transparent', marginBottom:-0.5 }}>
                {t === 'pending' ? `Pending Review (${pendingKpis.length})` : `Reviewed (${doneKpis.length})`}
              </button>
            ))}
          </div>

          {displayKpis.length === 0 && (
            <div style={{ textAlign:'center', padding:40, color:'#888', fontSize:13 }}>
              {tab === 'pending' ? 'No KPIs pending your review.' : 'No reviewed KPIs yet.'}
            </div>
          )}

          {displayKpis.map((kpi: any) => (
            <div key={kpi.id} style={S.card}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                <div>
                  <div style={{ fontWeight:500 }}>{kpi.name}</div>
                  <div style={{ fontSize:12, color:'#888' }}>Target: {kpi.target} · Weight: {kpi.weight}% · Self score: {kpi.self_score ?? '—'}/5</div>
                </div>
              </div>

              {kpi.self_comment && (
                <div style={S.evalNote}><strong>Staff comment:</strong> {kpi.self_comment}</div>
              )}

              {tab === 'pending' && (
                <>
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:12, fontWeight:500, color:'#666', marginBottom:6 }}>Your Rating</div>
                    <div style={{ display:'flex', gap:6 }}>
                      {RATINGS.map(n => (
                        <button key={n} onClick={() => setScores(p => ({...p, [kpi.id]:n}))}
                          style={{ width:34, height:34, borderRadius:'50%', border:`0.5px solid ${scores[kpi.id]===n?'#1a1a18':'#d0d0cc'}`,
                            background: scores[kpi.id]===n ? '#1a1a18' : 'transparent',
                            color: scores[kpi.id]===n ? '#fff' : '#444', fontSize:12, cursor:'pointer' }}>
                          {n}
                        </button>
                      ))}
                      {scores[kpi.id] && <span style={{ fontSize:11, color:'#888', alignSelf:'center' }}>{LABELS[scores[kpi.id]]}</span>}
                    </div>
                  </div>

                  <textarea placeholder="Provide your assessment and feedback..."
                    value={comments[kpi.id] || ''}
                    onChange={e => setComments(p => ({...p, [kpi.id]: e.target.value}))}
                    style={{ ...S.input, width:'100%', minHeight:70, resize:'vertical', marginBottom:10 }} />

                  <div style={{ display:'flex', gap:8 }}>
                    <button disabled={!scores[kpi.id]}
                      onClick={() => evalMutation.mutate({ id: kpi.id, action:'approve' })}
                      style={{ ...S.btnPrimary, opacity: !scores[kpi.id] ? 0.5 : 1 }}>
                      Approve &amp; Forward →
                    </button>
                    <button onClick={() => evalMutation.mutate({ id: kpi.id, action:'reject' })}
                      style={S.btnDanger}>
                      Reject
                    </button>
                  </div>
                </>
              )}

              {tab === 'done' && (
                <div style={S.evalNote}>
                  Score: {kpi.mgr_score ?? kpi.mgr2_score ?? kpi.hod_score ?? '—'}/5 — {kpi.status}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  card:      { background:'#fff', border:'0.5px solid #e5e4df', borderRadius:10, padding:16, marginBottom:12 },
  select:    { padding:'7px 12px', border:'0.5px solid #d0d0cc', borderRadius:8, fontSize:13, background:'#fff', cursor:'pointer' },
  input:     { padding:'7px 10px', border:'0.5px solid #d0d0cc', borderRadius:8, fontSize:13, background:'#fff', color:'#1a1a18', fontFamily:'inherit', outline:'none' },
  btnPrimary:{ padding:'6px 14px', border:'none', borderRadius:8, background:'#1a1a18', color:'#fff', fontSize:12, cursor:'pointer' },
  btnDanger: { padding:'6px 14px', border:'0.5px solid #fca5a5', borderRadius:8, background:'transparent', color:'#991b1b', fontSize:12, cursor:'pointer' },
  evalNote:  { fontSize:12, padding:'8px 10px', background:'#f9f9f7', borderRadius:6, color:'#555', marginBottom:10 },
};
