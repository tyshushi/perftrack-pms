// temp
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth';
import { kpisApi, cyclesApi } from '../api/client';
import { useForm } from 'react-hook-form';

const STATUS_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  DRAFT:       { label: 'Draft',                    bg: '#f5f5f3', color: '#666' },
  PENDING_DM:  { label: 'Pending Direct Manager',   bg: '#fef9c3', color: '#854d0e' },
  PENDING_RM:  { label: 'Pending Reviewing Mgr',    bg: '#ffedd5', color: '#9a3412' },
  PENDING_HOD: { label: 'Pending HOD',              bg: '#fce7f3', color: '#9d174d' },
  APPROVED:    { label: 'Approved',                 bg: '#dcfce7', color: '#166534' },
  REJECTED:    { label: 'Rejected',                 bg: '#fee2e2', color: '#991b1b' },
  LOCKED:      { label: 'Locked',                   bg: '#e0f2fe', color: '#0c4a6e' },
};

const WORKFLOW_STEPS = ['DRAFT', 'PENDING_MGR', 'PENDING_MGR2', 'PENDING_HOD', 'APPROVED'];
const STEP_LABELS    = ['Draft', 'Mgr Review', 'Mgr² Review', 'HOD', 'Done'];

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.DRAFT;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 8px', borderRadius:12,
      fontSize:11, fontWeight:500, background:s.bg, color:s.color }}>
      {s.label}
    </span>
  );
}

function WorkflowBar({ status }: { status: string }) {
  const steps = ['DRAFT', 'PENDING_DM', 'PENDING_RM', 'PENDING_HOD', 'APPROVED'];
  const labels = ['Draft', 'Direct Mgr', 'Reviewing Mgr', 'HOD', 'Done'];
  const idx = steps.indexOf(status);
  const done = status === 'APPROVED' || status === 'LOCKED';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, margin: '10px 0 4px' }}>
      {steps.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center',
          flex: i < steps.length - 1 ? '1' : 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 600,
              background: i < idx || done ? '#166534' : i === idx ? '#1a1a18' : '#e5e4df',
              color: i <= idx || done ? '#fff' : '#888',
            }}>
              {i < idx || done ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 10, color: i === idx ? '#1a1a18' : '#888',
              fontWeight: i === idx ? 500 : 400, whiteSpace: 'nowrap' }}>
              {labels[i]}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 1, background: i < idx ? '#166534' : '#e5e4df',
              margin: '0 4px' }} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function KpiPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [activeCycleId, setActiveCycleId] = useState<string>('');

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'],
    queryFn: () => cyclesApi.list().then(r => r.data),
    onSuccess: (data: any[]) => { if (data.length && !activeCycleId) setActiveCycleId(data[0].id); }
  });

  const { data: kpis = [], isLoading } = useQuery({
    queryKey: ['kpis', activeCycleId],
    queryFn: () => kpisApi.list(activeCycleId).then(r => r.data),
    enabled: !!activeCycleId,
  });

  const { register, handleSubmit, reset } = useForm();

  const createMutation = useMutation({
    mutationFn: (data: any) => kpisApi.create({ ...data, cycle_id: activeCycleId, weight: Number(data.weight) }),
    onSuccess: () => { qc.invalidateQueries(['kpis']); reset(); setShowForm(false); },
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => kpisApi.submit(id),
    onSuccess: () => qc.invalidateQueries(['kpis']),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => kpisApi.delete(id),
    onSuccess: () => qc.invalidateQueries(['kpis']),
  });

  const totalWeight = kpis.reduce((a: number, k: any) => a + k.weight, 0);
  const pending = kpis.filter((k: any) => k.status.startsWith('PENDING')).length;
  const approved = kpis.filter((k: any) => ['APPROVED','LOCKED'].includes(k.status)).length;

  return (
    <div>
      <div style={S.header}>
        <div>
          <h1 style={S.h1}>KPI Setting</h1>
          <p style={S.sub}>Define, submit, and track your key performance indicators</p>
        </div>
        {cycles.length > 0 && (
          <select style={S.select} value={activeCycleId} onChange={e => setActiveCycleId(e.target.value)}>
            {cycles.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* Metrics */}
      <div style={S.grid3}>
        <div style={S.metric}>
          <div style={S.metricLabel}>Total Weight</div>
          <div style={{ ...S.metricVal, color: totalWeight === 100 ? '#166534' : totalWeight > 100 ? '#991b1b' : '#854d0e' }}>
            {totalWeight}%
          </div>
          <div style={S.metricSub}>{totalWeight === 100 ? 'Balanced ✓' : totalWeight < 100 ? `${100-totalWeight}% remaining` : 'Exceeds 100%!'}</div>
        </div>
        <div style={S.metric}>
          <div style={S.metricLabel}>Pending Review</div>
          <div style={S.metricVal}>{pending}</div>
        </div>
        <div style={S.metric}>
          <div style={S.metricLabel}>Approved</div>
          <div style={{ ...S.metricVal, color: '#166534' }}>{approved}</div>
        </div>
      </div>

      {/* KPI List */}
      {isLoading && <p style={{ color:'#888', padding:20 }}>Loading KPIs...</p>}
      {kpis.map((kpi: any) => (
        <div key={kpi.id} style={S.kpiRow} onClick={() => setExpandedId(expandedId === kpi.id ? null : kpi.id)}>
          <div style={S.kpiBody}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={S.kpiName}>{kpi.name}</span>
              <span style={S.chip}>{kpi.weight}%</span>
              <span style={{ ...S.chip, background:'#f0f9ff', color:'#0369a1' }}>{kpi.category}</span>
              <StatusPill status={kpi.status} />
              {kpi.kpi_type === 'FIXED' && <span style={{ ...S.chip, background:'#faf5ff', color:'#6b21a8' }}>Fixed</span>}
            </div>
            <div style={S.kpiMeta}>Target: {kpi.target}</div>
            {expandedId === kpi.id && (
              <div onClick={e => e.stopPropagation()}>
                <WorkflowBar status={kpi.status} />
                {kpi.self_comment && <p style={S.comment}>Self: {kpi.self_comment}</p>}
                {kpi.mgr_comment  && <p style={S.comment}>Manager: {kpi.mgr_comment}</p>}
                {kpi.mgr2_comment && <p style={S.comment}>Mgr²: {kpi.mgr2_comment}</p>}
                {kpi.hod_comment  && <p style={S.comment}>HOD: {kpi.hod_comment}</p>}
                <div style={{ display:'flex', gap:6, marginTop:8, alignItems:'center' }}>
                  {kpi.self_score  !== null && <span style={S.scoreChip}>Self: {kpi.self_score}</span>}
                  {kpi.mgr_score   !== null && <span style={S.scoreChip}>Mgr: {kpi.mgr_score}</span>}
                  {kpi.mgr2_score  !== null && <span style={S.scoreChip}>Mgr²: {kpi.mgr2_score}</span>}
                  {kpi.hod_score   !== null && <span style={S.scoreChip}>HOD: {kpi.hod_score}</span>}
                  {kpi.final_score !== null && <span style={{ ...S.scoreChip, fontWeight:600 }}>Final: {kpi.final_score}</span>}
                </div>
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }} onClick={e => e.stopPropagation()}>
            {kpi.status === 'DRAFT' && (
              <>
                <button style={S.btnPrimary} onClick={() => submitMutation.mutate(kpi.id)}>Submit →</button>
                <button style={S.btnDanger}  onClick={() => deleteMutation.mutate(kpi.id)}>✕</button>
              </>
            )}
          </div>
        </div>
      ))}

      {/* Add KPI Form */}
      {showForm ? (
        <div style={S.card}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
            <span style={{ fontWeight:500 }}>New KPI</span>
            <button style={S.btnSm} onClick={() => { setShowForm(false); reset(); }}>Cancel</button>
          </div>
          <form onSubmit={handleSubmit(data => createMutation.mutate(data))}>
            <div style={S.grid2}>
              <div style={S.fg}>
                <label style={S.label}>KPI Name *</label>
                <input style={S.input} {...register('name', { required: true })} placeholder="e.g. Revenue Target Achievement" />
              </div>
              <div style={S.fg}>
                <label style={S.label}>Category *</label>
                <select style={S.input} {...register('category', { required: true })}>
                  {['Financial','Customer','Internal','Learning','Innovation'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={S.fg}>
                <label style={S.label}>Weight (%) *</label>
                <input style={S.input} type="number" min={1} max={100} {...register('weight', { required: true })} placeholder="e.g. 25" />
              </div>
              <div style={S.fg}>
                <label style={S.label}>Target *</label>
                <input style={S.input} {...register('target', { required: true })} placeholder="e.g. RM 2.5M" />
              </div>
            </div>
            <div style={S.fg}>
              <label style={S.label}>Measurement / How to measure</label>
              <textarea style={{ ...S.input, minHeight:60, resize:'vertical' }} {...register('measurement')} placeholder="Describe how this KPI will be measured..." />
            </div>
            <button type="submit" style={{ ...S.btnPrimary, marginTop:10 }}>Add KPI</button>
          </form>
        </div>
      ) : (
        <button style={{ ...S.btnSm, marginTop:10 }} onClick={() => setShowForm(true)}>+ Add KPI</button>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  header:     { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 },
  h1:         { fontSize:20, fontWeight:500, marginBottom:4 },
  sub:        { fontSize:13, color:'#888' },
  grid3:      { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16 },
  grid2:      { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 },
  metric:     { background:'#fff', border:'0.5px solid #e5e4df', borderRadius:10, padding:14 },
  metricLabel:{ fontSize:11, color:'#888', marginBottom:4 },
  metricVal:  { fontSize:24, fontWeight:500 },
  metricSub:  { fontSize:11, color:'#888', marginTop:2 },
  kpiRow:     { background:'#fff', border:'0.5px solid #e5e4df', borderRadius:10, padding:14, marginBottom:8, display:'flex', gap:12, alignItems:'flex-start', cursor:'pointer' },
  kpiBody:    { flex:1 },
  kpiName:    { fontSize:14, fontWeight:500 },
  kpiMeta:    { fontSize:12, color:'#888', marginTop:2 },
  chip:       { background:'#f5f5f3', color:'#555', fontSize:11, fontWeight:500, padding:'2px 7px', borderRadius:10 },
  scoreChip:  { background:'#f0fdf4', color:'#166534', fontSize:11, padding:'2px 8px', borderRadius:8 },
  comment:    { fontSize:12, color:'#555', marginTop:6, padding:'6px 10px', background:'#f9f9f7', borderRadius:6 },
  card:       { background:'#fff', border:'0.5px solid #e5e4df', borderRadius:10, padding:16, marginTop:10 },
  fg:         { marginBottom:10 },
  label:      { fontSize:12, fontWeight:500, color:'#666', display:'block', marginBottom:4 },
  input:      { width:'100%', padding:'7px 10px', border:'0.5px solid #d0d0cc', borderRadius:8, fontSize:13, background:'#fff', color:'#1a1a18', fontFamily:'inherit', outline:'none' },
  select:     { padding:'7px 12px', border:'0.5px solid #d0d0cc', borderRadius:8, fontSize:13, background:'#fff', cursor:'pointer' },
  btnPrimary: { padding:'6px 14px', border:'none', borderRadius:8, background:'#1a1a18', color:'#fff', fontSize:12, cursor:'pointer', fontFamily:'inherit' },
  btnDanger:  { padding:'6px 10px', border:'0.5px solid #fca5a5', borderRadius:8, background:'transparent', color:'#991b1b', fontSize:12, cursor:'pointer' },
  btnSm:      { padding:'6px 12px', border:'0.5px solid #d0d0cc', borderRadius:8, background:'transparent', color:'#444', fontSize:12, cursor:'pointer', fontFamily:'inherit' },
};
