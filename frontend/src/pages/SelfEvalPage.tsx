import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kpisApi, cyclesApi } from '../api/client';

export default function SelfEvalPage() {
  const [cycleId, setCycleId] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'], queryFn: () => cyclesApi.list().then(r => r.data),
    onSuccess: (d: any[]) => { if (d.length && !cycleId) setCycleId(d[0].id); }
  });

  const { data: kpis = [] } = useQuery({
    queryKey: ['kpis', cycleId],
    queryFn: () => kpisApi.list(cycleId).then(r => r.data),
    enabled: !!cycleId,
    select: (d: any[]) => d.filter(k => k.status !== 'DRAFT'),
  });

  const evalMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      kpisApi.selfEvaluate(id, scores[id], comments[id] || ''),
    onSuccess: () => qc.invalidateQueries(['kpis']),
  });

  const RATINGS = [1,2,3,4,5];
  const LABELS  = ['','Unsatisfactory','Needs Improvement','Meets Expectations','Exceeds Expectations','Outstanding'];

  const done    = kpis.filter((k: any) => k.self_score !== null).length;
  const total   = kpis.length;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20 }}>
        <div><h1 style={{ fontSize:20, fontWeight:500 }}>Self Evaluation</h1><p style={{ fontSize:13, color:'#888' }}>Rate your own performance against each KPI</p></div>
        <select style={S.select} value={cycleId} onChange={e => setCycleId(e.target.value)}>
          {(cycles as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div style={{ background:'#fff', border:'0.5px solid #e5e4df', borderRadius:10, padding:14, marginBottom:16 }}>
        <div style={{ fontSize:12, color:'#888', marginBottom:6 }}>Completion</div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1, height:6, background:'#f0f0ee', borderRadius:3, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${total ? done/total*100 : 0}%`, background:'#166534', borderRadius:3 }} />
          </div>
          <span style={{ fontSize:13, fontWeight:500 }}>{done} / {total}</span>
        </div>
      </div>

      {(kpis as any[]).map((kpi: any) => (
        <div key={kpi.id} style={S.card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
            <div>
              <div style={{ fontWeight:500, fontSize:14 }}>{kpi.name}</div>
              <div style={{ fontSize:12, color:'#888', marginTop:2 }}>Target: {kpi.target} · Weight: {kpi.weight}%</div>
            </div>
            {kpi.self_score !== null && <span style={{ fontSize:12, background:'#dcfce7', color:'#166534', padding:'3px 8px', borderRadius:8 }}>Saved: {kpi.self_score} — {LABELS[kpi.self_score]}</span>}
          </div>

          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:12, fontWeight:500, color:'#666', marginBottom:6 }}>Your Rating</div>
            <div style={{ display:'flex', gap:6 }}>
              {RATINGS.map(n => (
                <button key={n} disabled={kpi.status === 'LOCKED'} onClick={() => setScores(p => ({...p, [kpi.id]: n}))}
                  style={{ width:34, height:34, borderRadius:'50%', border:`0.5px solid ${scores[kpi.id]===n||kpi.self_score===n?'#1a1a18':'#d0d0cc'}`,
                    background: scores[kpi.id]===n ? '#1a1a18' : 'transparent',
                    color: scores[kpi.id]===n ? '#fff' : '#444', fontSize:12, cursor:'pointer' }}>
                  {n}
                </button>
              ))}
              {scores[kpi.id] && <span style={{ fontSize:11, color:'#888', alignSelf:'center' }}>{LABELS[scores[kpi.id]]}</span>}
            </div>
          </div>

          <textarea placeholder="Describe your achievements, evidence, and context..."
            value={comments[kpi.id] ?? kpi.self_comment ?? ''}
            onChange={e => setComments(p => ({...p, [kpi.id]: e.target.value}))}
            disabled={kpi.status === 'LOCKED'}
            style={{ ...S.input, minHeight:70, resize:'vertical', width:'100%', marginBottom:10 }} />

          {kpi.mgr_score !== null && (
            <div style={S.evalNote}>Manager's score: {kpi.mgr_score}/5 — {kpi.mgr_comment || 'No comment'}</div>
          )}

          <button disabled={!scores[kpi.id] || kpi.status === 'LOCKED'}
            onClick={() => evalMutation.mutate({ id: kpi.id })}
            style={{ ...S.btnPrimary, opacity: !scores[kpi.id] ? 0.5 : 1 }}>
            Save Self Evaluation
          </button>
        </div>
      ))}

      {total === 0 && (
        <div style={{ textAlign:'center', padding:40, color:'#888' }}>
          No KPIs ready for self-evaluation. Submit your KPIs first.
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  card:      { background:'#fff', border:'0.5px solid #e5e4df', borderRadius:10, padding:16, marginBottom:12 },
  select:    { padding:'7px 12px', border:'0.5px solid #d0d0cc', borderRadius:8, fontSize:13, background:'#fff', cursor:'pointer' },
  input:     { padding:'7px 10px', border:'0.5px solid #d0d0cc', borderRadius:8, fontSize:13, background:'#fff', color:'#1a1a18', fontFamily:'inherit', outline:'none' },
  btnPrimary:{ padding:'6px 14px', border:'none', borderRadius:8, background:'#1a1a18', color:'#fff', fontSize:12, cursor:'pointer' },
  evalNote:  { fontSize:12, padding:'8px 10px', background:'#f9f9f7', borderRadius:6, color:'#555', marginBottom:10 },
};
