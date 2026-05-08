import { useState, useMemo, useEffect } from 'react';
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

function scorecardStatusSummary(kpis: any[]): { label: string; bg: string; color: string } | null {
  if (!kpis.length) return null;
  const statuses = new Set(kpis.map((k: any) => k.status));
  if (statuses.size === 1) {
    const s = [...statuses][0];
    if (s === 'LOCKED')     return { label: 'Approved & Locked', bg: '#e0f2fe', color: '#0c4a6e' };
    if (s === 'PENDING_DM') return { label: 'Pending Manager Approval', bg: '#fef9c3', color: '#854d0e' };
    if (s === 'APPROVED')   return { label: 'Approved', bg: '#dcfce7', color: '#166534' };
  }
  if ([...statuses].every(s => s === 'LOCKED' || s === 'APPROVED')) {
    return { label: 'Approved & Locked', bg: '#e0f2fe', color: '#0c4a6e' };
  }
  if ([...statuses].some(s => s === 'REJECTED')) {
    return { label: 'Rejected — please revise and resubmit', bg: '#fee2e2', color: '#991b1b' };
  }
  if ([...statuses].some(s => s === 'PENDING_DM')) {
    return { label: 'Pending Manager Approval', bg: '#fef9c3', color: '#854d0e' };
  }
  const total = kpis.reduce((s: number, k: any) => s + k.weight, 0);
  return { label: `Draft — ${total}% set`, bg: '#f5f5f3', color: '#555' };
}

function buildEmptyTargetRows(cycle: any) {
  const ratingType = cycle?.rating_type || 'NUMERIC';
  const scaleMax   = cycle?.rating_scale_max || 5;
  const levels: any[] = cycle?.rating_levels || [];
  if (ratingType === 'NUMERIC') {
    const ordered = levels.length
      ? [...levels].sort((a, b) => Number(b.value) - Number(a.value))
      : Array.from({ length: scaleMax }, (_, i) => ({ value: scaleMax - i, label: `Level ${scaleMax - i}`, description: '' }));
    return ordered.map((lv: any) => ({ value: lv.value, label: lv.label, target: '' }));
  }
  if (ratingType === 'MET_NOT_MET') {
    const ordered = levels.length
      ? levels
      : [{ value: 'Met', label: 'Met' }, { value: 'Not Met', label: 'Not Met' }];
    return ordered.map((lv: any) => ({ value: lv.value, label: lv.label || lv.value, target: '' }));
  }
  return [{ value: 'OKR', label: 'OKR', target: '' }];
}

function hasCompleteTargets(rawTargets: any, cycle: any): boolean {
  const targets = Array.isArray(rawTargets) ? rawTargets : [];
  if (targets.length === 0) return false;
  const ratingType = cycle?.rating_type || 'NUMERIC';
  const scaleMax   = cycle?.rating_scale_max || 5;
  if (ratingType === 'NUMERIC') {
    if (targets.length !== scaleMax) return false;
  } else if (ratingType === 'MET_NOT_MET') {
    if (targets.length !== 2) return false;
  } else {
    if (targets.length !== 1) return false;
  }
  return targets.every((t: any) => typeof t.target === 'string' && t.target.trim().length > 0);
}

function RatingTargetsEditor({ kpi, cycle, onSave }: {
  kpi: any;
  cycle: any;
  onSave: (targets: any[]) => void;
}) {
  const ratingType = cycle?.rating_type || 'NUMERIC';
  const scaleMax   = cycle?.rating_scale_max || 5;
  const levels: any[] = cycle?.rating_levels || [];

  const initial = (() => {
    const existing: any[] = Array.isArray(kpi.rating_targets) ? kpi.rating_targets : [];
    if (ratingType === 'NUMERIC') {
      const ordered = levels.length
        ? [...levels].sort((a, b) => b.value - a.value)
        : Array.from({ length: scaleMax }, (_, i) => ({ value: scaleMax - i, label: `Level ${scaleMax - i}`, description: '' }));
      return ordered.map((lv: any) => {
        const found = existing.find(t => Number(t.value) === Number(lv.value));
        return { value: lv.value, label: lv.label, target: found?.target || '' };
      });
    }
    if (ratingType === 'MET_NOT_MET') {
      const ordered = levels.length
        ? levels
        : [{ value: 'Met', label: 'Met' }, { value: 'Not Met', label: 'Not Met' }];
      return ordered.map((lv: any) => {
        const found = existing.find(t => t.value === lv.value);
        return { value: lv.value, label: lv.label || lv.value, target: found?.target || '' };
      });
    }
    // OKR
    const found = existing[0];
    return [{ value: 'OKR', label: 'OKR', target: found?.target || '' }];
  })();

  const [rows, setRows] = useState(initial);

  const updateRow = (idx: number, val: string) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, target: val } : r));
  };

  return (
    <div style={{ marginTop: 10, padding: 12, background: '#f7f7f5', borderRadius: 8, border: `0.5px solid ${C.borderLight}` }}>
      <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 8 }}>
        Define what achievement looks like for each rating level
      </div>
      {ratingType === 'OKR' ? (
        <div>
          <label style={S.label}>Describe how 0-100% achievement will be measured</label>
          <input style={S.input} value={rows[0].target}
            onChange={e => updateRow(0, e.target.value)}
            placeholder="e.g. % of project milestones completed" />
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.textSecond, fontWeight: 600, width: 180 }}>Rating</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.textSecond, fontWeight: 600 }}>Target Description</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={String(r.value)}>
                <td style={{ padding: '6px 8px', fontSize: 13, color: C.text }}>
                  <strong>{r.value}</strong> — {r.label}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <input style={S.input} value={r.target}
                    onChange={e => updateRow(i, e.target.value)}
                    placeholder="What achievement looks like for this rating" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ marginTop: 10 }}>
        <button onClick={() => onSave(rows)} style={S.btnPrimary}>Save Targets</button>
      </div>
    </div>
  );
}

function KpiCard({
  kpi, weightRules, cycle, onDelete, onAdjustWeight, onSaveTargets,
}: {
  kpi:            any;
  weightRules:    any[];
  cycle:          any;
  onDelete:       () => void;
  onAdjustWeight: (w: number) => void;
  onSaveTargets:  (targets: any[]) => void;
}) {
  const targetsComplete = hasCompleteTargets(kpi.rating_targets, cycle);
  const needsTargets = !targetsComplete && (kpi.status === 'DRAFT' || kpi.status === 'REJECTED' || kpi.status === 'APPROVED');
  const [editWeight, setEditWeight] = useState(false);
  const [newWeight,  setNewWeight]  = useState(kpi.weight);
  const [showTargets, setShowTargets] = useState(needsTargets);
  const rule    = weightRules.find((r: any) => r.kpi_dimension === kpi.kpi_dimension);
  const isFixed = kpi.kpi_type === 'FIXED';
  const canDelete = kpi.status === 'DRAFT' && !isFixed;
  const canSetTargets = (kpi.status === 'DRAFT' || kpi.status === 'REJECTED' || kpi.status === 'APPROVED') && !!cycle;

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

      {/* Delete for optional DRAFT KPIs */}
      {canDelete && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={onDelete} style={{ ...S.btnSm, color: '#991b1b', borderColor: '#fca5a5' }}>
            Delete
          </button>
        </div>
      )}

      {/* Rejection comment */}
      {kpi.status === 'REJECTED' && kpi.mgr_comment && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b', padding: '6px 10px', background: '#fee2e2', borderRadius: 6 }}>
          Manager comment: {kpi.mgr_comment}
        </div>
      )}

      {kpi.status === 'PENDING_DM' && (
        <div style={{ marginTop: 8, fontSize: 12, color: C.textSecond, fontStyle: 'italic' }}>
          Awaiting manager approval…
        </div>
      )}

      {canSetTargets && (
        <div style={{ marginTop: 10 }}>
          {needsTargets && (
            <div style={{ fontSize: 12, padding: '6px 10px', background: '#fef2f2', color: '#991b1b', borderRadius: 6, marginBottom: 6, fontWeight: 500 }}>
              ⚠ Rating targets not set — required before submission
            </div>
          )}
          <button onClick={() => setShowTargets(s => !s)}
            style={{ ...S.btnSm, fontSize: 11 }}>
            {showTargets ? '▾ Hide Rating Targets' : '▸ Set Rating Targets'}
            {targetsComplete && (
              <span style={{ marginLeft: 6, color: '#166534' }}>✓ defined</span>
            )}
          </button>
          {showTargets && (
            <RatingTargetsEditor
              kpi={kpi}
              cycle={cycle}
              onSave={onSaveTargets} />
          )}
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
  const [inlineTargets, setInlineTargets] = useState<any[]>([]);

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
    enabled:  !!cycleId && !!user?.id,
  });

  const { data: weightRules = [] } = useQuery({
    queryKey: ['weight-rules', cycleId],
    queryFn:  () => kpisApi.getWeightRules(cycleId).then(r => r.data),
    enabled:  !!cycleId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await kpisApi.create({
        cycle_id: cycleId, name, description: desc,
        kpi_dimension: cat, weight, target, measurement: meas,
      });
      const newId = res.data?.id;
      if (newId && inlineTargets.length > 0) {
        await kpisApi.updateRatingTargets(newId, inlineTargets);
      }
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kpis', cycleId, user?.id] });
      setAdding(false);
      setName(''); setDesc(''); setTarget(''); setMeas(''); setWeight(0);
      setInlineTargets(buildEmptyTargetRows(currentCycle));
    },
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

  const submitScorecardMutation = useMutation({
    mutationFn: () => kpisApi.submitScorecard(cycleId),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['kpis', cycleId, user?.id] }),
  });

  useEffect(() => {
    if (adding) setInlineTargets(buildEmptyTargetRows(currentCycle));
  }, [adding, cycleId]);

  const ratingTargetsMutation = useMutation({
    mutationFn: ({ id, targets }: { id: string; targets: any[] }) =>
      kpisApi.updateRatingTargets(id, targets),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kpis', cycleId, user?.id] }),
  });

  const totalWeight = (kpis as any[]).reduce((sum, k) => sum + k.weight, 0);
  const hasSubmittable = (kpis as any[]).some(k => k.status === 'DRAFT' || k.status === 'REJECTED');
  const allTargetsSet = (kpis as any[]).length > 0 &&
    (kpis as any[]).every(k => hasCompleteTargets(k.rating_targets, currentCycle));

  const bykpi_dimension = CATEGORIES.map(c => ({
    cat:   c,
    total: (kpis as any[]).filter(k => k.kpi_dimension === c).reduce((s, k) => s + k.weight, 0),
    rule:  (weightRules as any[]).find((r: any) => r.kpi_dimension === c),
  }));

  const rule = (weightRules as any[]).find((r: any) => r.kpi_dimension === cat);

  const statusSummary = scorecardStatusSummary(kpis as any[]);

  const submitDisabledReason = totalWeight !== 100
    ? `Total weight is ${totalWeight}% — must equal 100%`
    : !hasSubmittable
    ? 'No KPIs in Draft or Rejected status to submit'
    : !allTargetsSet
    ? 'All KPIs must have rating targets defined before submitting'
    : null;

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
          {/* Scorecard status summary */}
          {statusSummary && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: statusSummary.bg, color: statusSummary.color, fontSize: 13, fontWeight: 500, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Status:</span>
              <span>{statusSummary.label}</span>
            </div>
          )}

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

          {/* Rating framework reference */}
          {currentCycle && (
            <div style={{ ...S.card, background: C.bgInfo, borderColor: '#bae6fd' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textInfo, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Rating Framework
              </div>
              <div style={{ fontSize: 13, color: C.text, marginBottom: 6 }}>
                This cycle uses{' '}
                <strong>
                  {currentCycle.rating_type === 'NUMERIC'
                    ? `Numeric 1–${currentCycle.rating_scale_max || 5}`
                    : currentCycle.rating_type === 'MET_NOT_MET'
                    ? 'Met / Not Met'
                    : currentCycle.rating_type === 'OKR'
                    ? 'OKR (0-100%)'
                    : 'Numeric'}
                </strong>
              </div>
              {Array.isArray(currentCycle.rating_levels) && currentCycle.rating_levels.length > 0 && (
                <div style={{ fontSize: 12, color: C.textSecond }}>
                  {currentCycle.rating_levels.map((lv: any, idx: number) => (
                    <span key={String(lv.value)}>
                      <strong>{lv.value}</strong>={lv.label}
                      {lv.description ? ` (${lv.description})` : ''}
                      {idx < currentCycle.rating_levels.length - 1 ? ' · ' : ''}
                    </span>
                  ))}
                </div>
              )}
              {currentCycle.rating_type === 'OKR' && (
                <div style={{ fontSize: 12, color: C.textSecond }}>
                  Staff will enter 0-100% achievement against each KPI
                </div>
              )}
            </div>
          )}

          {/* KPI list */}
          {(kpis as any[]).map((kpi: any) => (
            <KpiCard
              key={kpi.id}
              kpi={kpi}
              weightRules={weightRules as any[]}
              cycle={currentCycle}
              onDelete={() => deleteMutation.mutate(kpi.id)}
              onAdjustWeight={w => adjustMutation.mutate({ id: kpi.id, weight: w })}
              onSaveTargets={targets => ratingTargetsMutation.mutate({ id: kpi.id, targets })}
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

              {/* Inline rating targets */}
              {currentCycle && (
                <div style={{ marginTop: 8, padding: 12, background: C.bgSecondary, borderRadius: 8, border: `0.5px solid ${C.borderLight}` }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: C.text, marginBottom: 4 }}>
                    Rating Targets <span style={{ color: C.textDanger }}>*</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 8 }}>
                    Define what achievement looks like for each rating level. Required before this KPI can be added.
                  </div>
                  {(currentCycle.rating_type || 'NUMERIC') === 'OKR' ? (
                    <div>
                      <label style={S.label}>Describe how 0-100% achievement will be measured</label>
                      <input style={S.input}
                        value={inlineTargets[0]?.target || ''}
                        onChange={e => setInlineTargets(prev => prev.length
                          ? prev.map((r, i) => i === 0 ? { ...r, target: e.target.value } : r)
                          : [{ value: 'OKR', label: 'OKR', target: e.target.value }])}
                        placeholder="e.g. % of project milestones completed" />
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.textSecond, fontWeight: 600, width: 180 }}>Rating</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.textSecond, fontWeight: 600 }}>Target Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inlineTargets.map((r, i) => (
                          <tr key={String(r.value)}>
                            <td style={{ padding: '6px 8px', fontSize: 13, color: C.text }}>
                              <strong>{r.value}</strong>{r.label ? ` — ${r.label}` : ''}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input style={S.input} value={r.target}
                                onChange={e => setInlineTargets(prev => prev.map((row, idx) => idx === i ? { ...row, target: e.target.value } : row))}
                                placeholder="What achievement looks like for this rating" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => createMutation.mutate()}
                  disabled={!name || !target || !hasCompleteTargets(inlineTargets, currentCycle) || createMutation.isPending}
                  style={{ ...S.btnPrimary, opacity: (!name || !target || !hasCompleteTargets(inlineTargets, currentCycle)) ? 0.5 : 1 }}>
                  {createMutation.isPending ? 'Adding...' : 'Add KPI'}
                </button>
                <button onClick={() => setAdding(false)} style={S.btnSm}>Cancel</button>
              </div>
              {!hasCompleteTargets(inlineTargets, currentCycle) && (
                <div style={{ marginTop: 6, fontSize: 12, color: C.textDanger }}>
                  Fill in all rating target descriptions before adding the KPI.
                </div>
              )}
            </div>
          )}

          {!adding && (
            <button onClick={() => setAdding(true)}
              style={{ ...S.btnSm, width: '100%', padding: '10px', borderStyle: 'dashed', marginTop: 8 }}>
              + Add Optional KPI
            </button>
          )}

          {/* Submit Scorecard */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `0.5px solid ${C.borderLight}` }}>
            <button
              onClick={() => submitScorecardMutation.mutate()}
              disabled={!!submitDisabledReason || submitScorecardMutation.isPending}
              style={{ ...S.btnPrimary, opacity: submitDisabledReason ? 0.5 : 1, cursor: submitDisabledReason ? 'not-allowed' : 'pointer' }}>
              {submitScorecardMutation.isPending ? 'Submitting…' : 'Submit Scorecard for Approval'}
            </button>
            {submitDisabledReason && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#991b1b' }}>{submitDisabledReason}</div>
            )}
            {submitScorecardMutation.isSuccess && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#166534', fontWeight: 500 }}>
                ✓ Scorecard submitted for manager approval
              </div>
            )}
            {submitScorecardMutation.isError && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#991b1b' }}>
                {(submitScorecardMutation.error as any)?.response?.data?.detail || 'Submission failed'}
              </div>
            )}
          </div>
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
