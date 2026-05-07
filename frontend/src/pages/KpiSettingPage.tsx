import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth';
import { kpisApi, cyclesApi } from '../api/client';

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

const CATEGORIES = [
  'Financials', 'Customer', 'Internal Process',
  'Learning & Growth', 'Leadership & Culture',
];

const CYCLE_STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  DRAFT:  { bg: '#f7f7f5', color: '#6b6b6b', label: 'Draft' },
  ACTIVE: { bg: '#dcfce7', color: '#166534', label: 'Active' },
  CLOSED: { bg: '#fee2e2', color: '#991b1b', label: 'Closed' },
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  DRAFT:       { bg: '#f5f5f3', color: '#555',    label: 'Draft' },
  PENDING_DM:  { bg: '#fef9c3', color: '#854d0e', label: 'Pending Manager' },
  APPROVED:    { bg: '#dcfce7', color: '#166534', label: 'Approved' },
  REJECTED:    { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
  LOCKED:      { bg: '#e0f2fe', color: '#0c4a6e', label: 'Locked' },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.DRAFT;
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function KpiCard({
  kpi, weightRules, onSubmit, onDelete, onAdjustWeight,
}: {
  kpi:            any;
  weightRules:    any[];
  onSubmit:       () => void;
  onDelete:       () => void;
  onAdjustWeight: (w: number) => void;
}) {
  const [editWeight, setEditWeight] = useState(false);
  const [newWeight,  setNewWeight]  = useState(kpi.weight);
  const rule      = weightRules.find((r: any) => r.kpi_dimension === kpi.kpi_dimension);
  const isFixed   = kpi.kpi_type === 'FIXED';
  const canSubmit = kpi.status === 'DRAFT' || kpi.status === 'REJECTED';
  const canDelete = kpi.status === 'DRAFT' && !isFixed;

  return (
    <div style={{ ...S.card, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 500, fontSize: 14, color: C.text }}>{kpi.name}</span>
            {isFixed && (
              <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: '#e0f2fe', color: '#0369a1', fontWeight: 500 }}>
                Cascaded
              </span>
            )}
          </div>
          {kpi.description && (
            <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 4 }}>{kpi.description}</div>
          )}
          <div style={{ fontSize: 12, color: C.textSecond }}>
            {kpi.kpi_dimension} · Target: {kpi.target}
            {kpi.measurement ? ` · ${kpi.measurement}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0, marginLeft: 12 }}>
          <StatusPill status={kpi.status} />
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text }}>{kpi.weight}%</div>
        </div>
      </div>

      {/* Weight adjustment for cascaded KPIs */}
      {isFixed && kpi.status !== 'LOCKED' && (
        <div style={{ marginTop: 8 }}>
          {!editWeight ? (
            <button onClick={() => { setEditWeight(true); setNewWeight(kpi.weight); }}
              style={{ fontSize: 11, padding: '3px 8px', border: `0.5px solid ${C.border}`, borderRadius: 6, background: 'transparent', cursor: 'pointer', color: C.textSecond, fontFamily: C.font }}>
              Adjust weight
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="number"
                min={rule?.min_weight || 0} max={rule?.max_weight || 100}
                style={{ ...S.input, width: 70 }}
                value={newWeight}
                onChange={e => setNewWeight(Number(e.target.value))} />
              <span style={{ fontSize: 12, color: C.textSecond }}>%</span>
              {rule && (
                <span style={{ fontSize: 11, color: C.textTertiary }}>
                  ({rule.min_weight}–{rule.max_weight}%)
                </span>
              )}
              <button onClick={() => { onAdjustWeight(newWeight); setEditWeight(false); }} style={S.btnPrimary}>
                Save
              </button>
              <button onClick={() => setEditWeight(false)} style={S.btnSm}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* Actions for optional KPIs */}
      {!isFixed && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {canSubmit && (
            <button onClick={onSubmit} style={S.btnPrimary}>Submit for Approval</button>
          )}
          {canDelete && (
            <button onClick={onDelete} style={{ ...S.btnSm, color: '#991b1b', borderColor: '#fca5a5' }}>
              Delete
            </button>
          )}
          {kpi.status === 'REJECTED' && kpi.mgr_comment && (
            <div style={{ fontSize: 12, color: '#991b1b', padding: '3px 8px', background: '#fee2e2', borderRadius: 6, alignSelf: 'center' }}>
              Rejected: {kpi.mgr_comment}
            </div>
          )}
        </div>
      )}

      {kpi.status === 'PENDING_DM' && (
        <div style={{ marginTop: 8, fontSize: 12, color: C.textSecond, fontStyle: 'italic' }}>
          Awaiting manager approval...
        </div>
      )}
    </div>
  );
}

export default function KpiSettingPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState('');
  const [adding,  setAdding]  = useState(false);
  const [name,    setName]    = useState('');
  const [desc,    setDesc]    = useState('');
  const [cat,     setCat]     = useState('Financials');
  const [weight,  setWeight]  = useState(0);
  const [target,  setTarget]  = useState('');
  const [meas,    setMeas]    = useState('');

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'],
    queryFn:  () => cyclesApi.list().then(r => r.data),
  });

  const sortedCycles = useMemo(() =>
    [...(cycles as any[])].sort((a, b) => b.name.localeCompare(a.name)),
    [cycles]
  );

  if (sortedCycles.length && !cycleId) setCycleId(sortedCycles[0].id);

  const currentCycle = sortedCycles.find((c: any) => c.id === cycleId) ?? null;

  const { data: kpis = [] } = useQuery({
    queryKey: ['kpis', cycleId, user?.id],
    queryFn:  () => kpisApi.list(cycleId, user?.id).then(r => r.data),
    enabled:  !!cycleId && !!user,
  });

  const { data: weightRules = [] } = useQuery({
    queryKey: ['weight-rules', cycleId],
    queryFn:  () => kpisApi.getWeightRules(cycleId).then(r => r.data),
    enabled:  !!cycleId,
  });

  const createMutation = useMutation({
    mutationFn: () => kpisApi.create({
      cycle_id: cycleId, name, description: desc,
      kpi_dimension: cat, weight, target, measurement: meas,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kpis', cycleId, user?.id] });
      setAdding(false);
      setName(''); setDesc(''); setTarget(''); setMeas(''); setWeight(0);
    },
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => kpisApi.submit(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['kpis', cycleId, user?.id] }),
  });

  const adjustMutation = useMutation({
    mutationFn: ({ id, weight }: { id: string; weight: number }) =>
      kpisApi.adjustWeight(id, weight),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kpis', cycleId, user?.id] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => kpisApi.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['kpis', cycleId, user?.id] }),
  });

  const totalWeight = (kpis as any[]).reduce((sum, k) => sum + k.weight, 0);

  const bykpi_dimension = CATEGORIES.map(c => ({
    cat: c,
    total: (kpis as any[]).filter(k => k.kpi_dimension === c).reduce((s, k) => s + k.weight, 0),
    rule:  (weightRules as any[]).find((r: any) => r.kpi_dimension === c),
  }));

  const rule = (weightRules as any[]).find((r: any) => r.kpi_dimension === cat);

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: C.text }}>My Scorecard</h1>
        <p style={{ fontSize: 13, color: C.textSecond }}>
          Set your KPIs for this performance cycle
        </p>
      </div>

      {/* Cycle selector */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: C.textSecond }}>◈</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.textSecond, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Performance Cycle
          </span>
          {currentCycle?.status && (() => {
            const st = CYCLE_STATUS_STYLE[currentCycle.status] || { bg: '#f7f7f5', color: '#6b6b6b', label: currentCycle.status };
            return (
              <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.color, marginLeft: 2 }}>
                {st.label}
              </span>
            );
          })()}
        </div>
        <select
          value={cycleId}
          onChange={e => setCycleId(e.target.value)}
          style={{ width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 15, fontWeight: 600, background: C.bg, color: cycleId ? C.text : C.textTertiary, fontFamily: C.font, outline: 'none', cursor: 'pointer' }}>
          <option value="">Select a performance cycle to begin…</option>
          {sortedCycles.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {cycleId && (
        <div>
          {/* Weight summary */}
          <div style={{ ...S.card, marginBottom: 12 }}>
            <div style={{ fontWeight: 500, marginBottom: 10, color: C.text }}>Weight Summary</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 10 }}>
              {bykpi_dimension.map(({ cat, total, rule }) => {
                const ok = !rule || (total >= (rule.min_weight || 0) && total <= (rule.max_weight || 100));
                return (
                  <div key={cat} style={{ padding: '10px 12px', borderRadius: 8, background: ok ? C.bgSecondary : '#fee2e2', border: `0.5px solid ${ok ? C.borderLight : '#fca5a5'}` }}>
                    <div style={{ fontSize: 11, color: C.textSecond, marginBottom: 4 }}>{cat}</div>
                    <div style={{ fontSize: 20, fontWeight: 500, color: ok ? C.text : '#991b1b' }}>{total}%</div>
                    {rule && (
                      <div style={{ fontSize: 10, color: ok ? C.textTertiary : '#991b1b' }}>
                        Range: {rule.min_weight}–{rule.max_weight}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `0.5px solid ${C.borderLight}` }}>
              <span style={{ fontSize: 13, color: C.textSecond }}>Total</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: totalWeight === 100 ? '#166534' : '#991b1b' }}>
                {totalWeight}%
                {totalWeight !== 100 && (
                  <span style={{ fontSize: 11, marginLeft: 6 }}>(must equal 100%)</span>
                )}
              </span>
            </div>
          </div>

          {/* KPI list */}
          {(kpis as any[]).map((kpi: any) => (
            <KpiCard
              key={kpi.id}
              kpi={kpi}
              weightRules={weightRules as any[]}
              onSubmit={() => submitMutation.mutate(kpi.id)}
              onDelete={() => deleteMutation.mutate(kpi.id)}
              onAdjustWeight={w => adjustMutation.mutate({ id: kpi.id, weight: w })}
            />
          ))}

          {(kpis as any[]).length === 0 && !adding && (
            <div style={{ textAlign: 'center', padding: 32, color: C.textSecond, fontSize: 13, border: `0.5px dashed ${C.border}`, borderRadius: 10 }}>
              No KPIs yet. Add your first KPI or wait for your manager to cascade KPIs to you.
            </div>
          )}

          {/* Add optional KPI form */}
          {adding && (
            <div style={S.card}>
              <div style={{ fontWeight: 500, marginBottom: 12, color: C.text }}>Add Optional KPI</div>
              <div style={S.grid2}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={S.label}>KPI Name</label>
                  <input style={S.input} value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Complete AWS certification" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={S.label}>Description</label>
                  <textarea style={{ ...S.input, minHeight: 54, resize: 'vertical' }}
                    value={desc} onChange={e => setDesc(e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>KPI Dimension</label>
                  <select style={S.input} value={cat} onChange={e => setCat(e.target.value)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>
                    Weight %
                    {rule && (
                      <span style={{ fontWeight: 400, color: C.textTertiary, marginLeft: 6 }}>
                        (allowed: {rule.min_weight}–{rule.max_weight}%)
                      </span>
                    )}
                  </label>
                  <input style={S.input} type="number" min={0} max={100}
                    value={weight} onChange={e => setWeight(Number(e.target.value))} />
                </div>
                <div>
                  <label style={S.label}>Target</label>
                  <input style={S.input} value={target}
                    onChange={e => setTarget(e.target.value)}
                    placeholder="e.g. Pass exam by Q3" />
                </div>
                <div>
                  <label style={S.label}>Measurement</label>
                  <input style={S.input} value={meas}
                    onChange={e => setMeas(e.target.value)}
                    placeholder="e.g. Certificate obtained" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => createMutation.mutate()}
                  disabled={!name || !target || createMutation.isPending}
                  style={{ ...S.btnPrimary, opacity: (!name || !target) ? 0.5 : 1 }}>
                  {createMutation.isPending ? 'Adding...' : 'Add KPI'}
                </button>
                <button onClick={() => setAdding(false)} style={S.btnSm}>Cancel</button>
              </div>
            </div>
          )}

          {!adding && (
            <button onClick={() => setAdding(true)}
              style={{ ...S.btnSm, width: '100%', padding: '10px', borderStyle: 'dashed', marginTop: 8 }}>
              + Add Optional KPI
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const S: Record<string, any> = {
  card:       { background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12 },
  grid2:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 },
  label:      { fontSize: 12, fontWeight: 500, color: C.textSecond, display: 'block', marginBottom: 4 },
  input:      { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none' },
  btnPrimary: { padding: '8px 16px', border: 'none', borderRadius: 8, background: C.text, color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font },
  btnSm:      { padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.textSecond, fontSize: 12, cursor: 'pointer', fontFamily: C.font },
};
