import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { scorecardsApi, cyclesApi } from '../api/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function DashboardPage() {
  const [cycleId, setCycleId] = useState('');

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'], queryFn: () => cyclesApi.list().then(r => r.data),
    onSuccess: (d: any[]) => { if (d.length && !cycleId) setCycleId(d[0].id); }
  });

  const { data: scorecards = [] } = useQuery({
    queryKey: ['scorecards', cycleId],
    queryFn: () => scorecardsApi.list(cycleId).then(r => r.data),
    enabled: !!cycleId,
  });

  const bellCurveMutation = useMutation({
    mutationFn: () => scorecardsApi.bellCurve(cycleId),
  });

  const sc = scorecards as any[];
  const avgScore  = sc.length ? (sc.reduce((a: number, s: any) => a + (s.final_score || 0), 0) / sc.length).toFixed(2) : '—';
  const confirmed = sc.filter((s: any) => s.increment_status === 'CONFIRMED').length;

  // Band distribution for chart
  const bandCounts: Record<string, number> = {};
  sc.forEach((s: any) => { if (s.performance_band) bandCounts[s.performance_band] = (bandCounts[s.performance_band]||0)+1; });
  const chartData = Object.entries(bandCounts).map(([name, count]) => ({ name, count }));
  const COLORS = ['#166534','#1d4ed8','#854d0e','#991b1b'];

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20 }}>
        <div><h1 style={{ fontSize:20, fontWeight:500 }}>HOD / CxO Dashboard</h1><p style={{ fontSize:13, color:'#888' }}>Organisation-wide performance overview</p></div>
        <div style={{ display:'flex', gap:8 }}>
          <select style={S.select} value={cycleId} onChange={e => setCycleId(e.target.value)}>
            {(cycles as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => bellCurveMutation.mutate()} style={S.btnPrimary}>
            {bellCurveMutation.isPending ? 'Running...' : 'Run Bell Curve'}
          </button>
        </div>
      </div>

      <div style={S.grid4}>
        <div style={S.metric}><div style={S.ml}>Total Staff</div><div style={S.mv}>{sc.length}</div></div>
        <div style={S.metric}><div style={S.ml}>Avg Score</div><div style={S.mv}>{avgScore}</div></div>
        <div style={S.metric}><div style={S.ml}>Increments Confirmed</div><div style={{ ...S.mv, color:'#166534' }}>{confirmed}</div></div>
        <div style={S.metric}><div style={S.ml}>Pending</div><div style={{ ...S.mv, color:'#854d0e' }}>{sc.length - confirmed}</div></div>
      </div>

      {chartData.length > 0 && (
        <div style={S.card}>
          <div style={{ fontWeight:500, marginBottom:14 }}>Performance Band Distribution</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize:12 }} />
              <YAxis tick={{ fontSize:12 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[4,4,0,0]}>
                {chartData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={S.card}>
        <div style={{ fontWeight:500, marginBottom:12 }}>Scorecard Summary</div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr>{['Employee','Score','Band','Rank','Increment %','Status'].map(h => (
              <th key={h} style={{ textAlign:'left', padding:'6px 10px', borderBottom:'0.5px solid #e5e4df', fontSize:11, color:'#888' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {sc.map((s: any) => (
              <tr key={s.id}>
                <td style={{ padding:'10px', borderBottom:'0.5px solid #f0f0ee', fontWeight:500 }}>{s.full_name}</td>
                <td style={{ padding:'10px', borderBottom:'0.5px solid #f0f0ee' }}>{s.final_score ?? '—'}</td>
                <td style={{ padding:'10px', borderBottom:'0.5px solid #f0f0ee' }}>{s.performance_band ?? '—'}</td>
                <td style={{ padding:'10px', borderBottom:'0.5px solid #f0f0ee' }}>#{s.band_rank ?? '—'}</td>
                <td style={{ padding:'10px', borderBottom:'0.5px solid #f0f0ee', color:'#166534', fontWeight:500 }}>{s.increment_pct ? `${s.increment_pct}%` : '—'}</td>
                <td style={{ padding:'10px', borderBottom:'0.5px solid #f0f0ee' }}>
                  <span style={{ fontSize:11, padding:'2px 8px', borderRadius:10,
                    background: s.increment_status==='CONFIRMED'?'#dcfce7':s.increment_status==='FLAGGED'?'#fef9c3':'#f5f5f3',
                    color: s.increment_status==='CONFIRMED'?'#166534':s.increment_status==='FLAGGED'?'#854d0e':'#666' }}>
                    {s.increment_status || 'Pending'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sc.length === 0 && <div style={{ textAlign:'center', padding:30, color:'#888', fontSize:13 }}>No scorecards yet. Run the bell curve after evaluations are complete.</div>}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  grid4: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 },
  metric:{ background:'#fff', border:'0.5px solid #e5e4df', borderRadius:10, padding:14 },
  ml:    { fontSize:11, color:'#888', marginBottom:4 },
  mv:    { fontSize:24, fontWeight:500 },
  card:  { background:'#fff', border:'0.5px solid #e5e4df', borderRadius:10, padding:16, marginBottom:12 },
  select:{ padding:'7px 12px', border:'0.5px solid #d0d0cc', borderRadius:8, fontSize:13, background:'#fff', cursor:'pointer' },
  btnPrimary: { padding:'7px 14px', border:'none', borderRadius:8, background:'#1a1a18', color:'#fff', fontSize:12, cursor:'pointer' },
};
