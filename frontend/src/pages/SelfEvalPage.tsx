import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

const S: Record<string, React.CSSProperties> = {
  card:       { background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12 },
  label:      { fontSize: 12, fontWeight: 500, color: C.textSecond, display: 'block', marginBottom: 4 },
  input:      { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none' },
  textarea:   { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none', minHeight: 70, resize: 'vertical' as const },
  btnPrimary: { padding: '10px 18px', border: 'none', borderRadius: 8, background: C.text, color: '#ffffff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: C.font },
  pillBtn:    { padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.text, fontSize: 12, cursor: 'pointer', fontFamily: C.font },
  dimBadge:   { fontSize: 11, padding: '2px 8px', borderRadius: 10, background: C.bgInfo, color: C.textInfo, fontWeight: 500 },
};

type Eval = { actual_achievement: string; self_rating: number | string | null; self_remarks: string };

export default function SelfEvalPage() {
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState('');
  const [evals, setEvals] = useState<Record<string, Eval>>({});

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'],
    queryFn:  () => cyclesApi.list().then(r => r.data),
  });

  const sortedCycles = useMemo(
    () => [...(cycles as any[])].sort((a, b) => (b.year || 0) - (a.year || 0)),
    [cycles]
  );

  useEffect(() => {
    if (!cycleId && sortedCycles.length) setCycleId(sortedCycles[0].id);
  }, [sortedCycles, cycleId]);

  const currentCycle = sortedCycles.find((c: any) => c.id === cycleId) || null;
  const ratingType   = currentCycle?.rating_type || 'NUMERIC';
  const scaleMax     = currentCycle?.rating_scale_max || 5;
  const cycleLevels: any[] = currentCycle?.rating_levels || [];

  const { data: allKpis = [] } = useQuery({
    queryKey: ['kpis', cycleId],
    queryFn:  () => kpisApi.list(cycleId).then(r => r.data),
    enabled:  !!cycleId,
  });

  const lockedKpis = useMemo(
    () => (allKpis as any[]).filter(k => k.status === 'LOCKED' || k.status === 'SELF_EVALUATED'),
    [allKpis]
  );

  // Initialize eval state when KPIs change
  useEffect(() => {
    setEvals(prev => {
      const next: Record<string, Eval> = { ...prev };
      lockedKpis.forEach((k: any) => {
        if (!next[k.id]) {
          next[k.id] = {
            actual_achievement: k.actual_achievement || '',
            self_rating:        k.self_rating ?? null,
            self_remarks:       k.self_remarks || '',
          };
        }
      });
      return next;
    });
  }, [lockedKpis]);

  const submitMutation = useMutation({
    mutationFn: (payload: any) => kpisApi.selfEvaluateAll(payload),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['kpis', cycleId] }),
  });

  const updateEval = (id: string, patch: Partial<Eval>) => {
    setEvals(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const numericLevels = useMemo(() => {
    if (cycleLevels.length) return [...cycleLevels].sort((a, b) => Number(a.value) - Number(b.value));
    return Array.from({ length: scaleMax }, (_, i) => ({ value: i + 1, label: `Level ${i + 1}`, description: '' }));
  }, [cycleLevels, scaleMax]);

  const metLevels = useMemo(() => {
    if (cycleLevels.length) return cycleLevels;
    return [
      { value: 'Met',     label: 'Met',     description: 'Achievement meets the target' },
      { value: 'Not Met', label: 'Not Met', description: 'Achievement does not meet the target' },
    ];
  }, [cycleLevels]);

  const allValid = lockedKpis.length > 0 && lockedKpis.every((k: any) => {
    const e = evals[k.id];
    if (!e) return false;
    if (!e.actual_achievement || e.actual_achievement.trim() === '') return false;
    if (e.self_rating === null || e.self_rating === undefined || e.self_rating === '') return false;
    return true;
  });

  const handleSubmit = () => {
    const payload = {
      cycle_id: cycleId,
      evaluations: lockedKpis.map((k: any) => ({
        kpi_id:             k.id,
        actual_achievement: evals[k.id].actual_achievement,
        self_rating:        ratingType === 'MET_NOT_MET'
          ? (evals[k.id].self_rating === 'Met' ? 1 : 0)
          : Number(evals[k.id].self_rating),
        self_remarks:       evals[k.id].self_remarks || '',
      })),
    };
    submitMutation.mutate(payload);
  };

  const numericLabelFor = (val: number | null | string) => {
    if (val === null || val === '' || val === undefined) return '';
    const lv = numericLevels.find(l => Number(l.value) === Number(val));
    return lv?.label || '';
  };

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: C.text }}>Self Evaluation</h1>
        <p style={{ fontSize: 13, color: C.textSecond }}>Rate your own performance against each KPI</p>
      </div>

      {/* Cycle selector */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: C.textSecond }}>◈</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.textSecond, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Performance Cycle
          </span>
        </div>
        <select
          value={cycleId}
          onChange={e => setCycleId(e.target.value)}
          style={{ width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 15, fontWeight: 600, background: C.bg, color: cycleId ? C.text : C.textTertiary, fontFamily: C.font, outline: 'none', cursor: 'pointer' }}>
          <option value="">Select a performance cycle…</option>
          {sortedCycles.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {currentCycle && (
        <div style={{ ...S.card, background: C.bgInfo, borderColor: '#bae6fd' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textInfo, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Rating Scale Reference
          </div>
          {ratingType === 'NUMERIC' && (
            <div style={{ fontSize: 13, color: C.text }}>
              {numericLevels.map((lv: any, i: number) => (
                <div key={String(lv.value)} style={{ paddingLeft: 4, marginBottom: i < numericLevels.length - 1 ? 4 : 0 }}>
                  <strong>{lv.value} = {lv.label}</strong>
                  {lv.description ? <span style={{ color: C.textSecond }}> — {lv.description}</span> : null}
                </div>
              ))}
            </div>
          )}
          {ratingType === 'MET_NOT_MET' && (
            <div style={{ fontSize: 13, color: C.text }}>
              {metLevels.map((lv: any, i: number) => (
                <div key={String(lv.value)} style={{ paddingLeft: 4, marginBottom: i < metLevels.length - 1 ? 4 : 0 }}>
                  <strong>{lv.label || lv.value}</strong>
                  {lv.description ? <span style={{ color: C.textSecond }}> — {lv.description}</span> : null}
                </div>
              ))}
            </div>
          )}
          {ratingType === 'OKR' && (
            <div style={{ fontSize: 13, color: C.text }}>
              Enter a 0–100% achievement value against each KPI's target.
            </div>
          )}
        </div>
      )}

      {cycleId && lockedKpis.length === 0 && (
        <div style={{ ...S.card, textAlign: 'center', padding: 32, color: C.textSecond, fontSize: 13 }}>
          No KPIs ready for self evaluation. Your scorecard must be approved and locked by your manager first.
        </div>
      )}

      {lockedKpis.map((kpi: any) => {
        const e = evals[kpi.id] || { actual_achievement: '', self_rating: null, self_remarks: '' };
        const targets: any[] = Array.isArray(kpi.rating_targets) ? kpi.rating_targets : [];
        const targetFor = (val: any): string => {
          const t = targets.find(x => String(x.value) === String(val));
          return t?.target || '';
        };

        return (
          <div key={kpi.id} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{kpi.name}</span>
                  <span style={S.dimBadge}>{kpi.kpi_dimension}</span>
                  <span style={{ fontSize: 12, color: C.textSecond }}>{kpi.weight}%</span>
                </div>
                {kpi.measurement && (
                  <div style={{ fontSize: 12, color: C.textSecond }}>Measurement: {kpi.measurement}</div>
                )}
              </div>
              {kpi.status === 'SELF_EVALUATED' && (
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: '#dcfce7', color: '#166534', fontWeight: 500 }}>
                  Submitted
                </span>
              )}
            </div>

            {/* Rating targets reference */}
            {targets.length > 0 && (
              <div style={{ background: C.bgSecondary, border: `0.5px solid ${C.borderLight}`, borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textSecond, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                  Rating Targets
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    {targets.map((t: any) => (
                      <tr key={String(t.value)}>
                        <td style={{ padding: '4px 8px', width: 140, color: C.text }}>
                          <strong>{t.value}</strong>{t.label ? ` — ${t.label}` : ''}
                        </td>
                        <td style={{ padding: '4px 8px', color: C.textSecond }}>{t.target || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Actual Achievement */}
            <div style={{ marginBottom: 10 }}>
              <label style={S.label}>Actual Achievement *</label>
              <textarea style={S.textarea}
                value={e.actual_achievement}
                onChange={ev => updateEval(kpi.id, { actual_achievement: ev.target.value })}
                placeholder="Describe what you actually delivered against this KPI" />
            </div>

            {/* Self Rating */}
            <div style={{ marginBottom: 10 }}>
              <label style={S.label}>Self Rating *</label>
              {ratingType === 'NUMERIC' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                  {numericLevels.map((lv: any) => {
                    const selected = Number(e.self_rating) === Number(lv.value);
                    const myTarget = targetFor(lv.value);
                    return (
                      <div key={String(lv.value)} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <button
                          onClick={() => updateEval(kpi.id, { self_rating: Number(lv.value) })}
                          title={myTarget || undefined}
                          style={{
                            ...S.pillBtn,
                            background: selected ? C.text : C.bg,
                            color: selected ? '#fff' : C.text,
                            borderColor: selected ? C.text : C.border,
                            textAlign: 'left',
                          }}>
                          {lv.value} - {lv.label}
                        </button>
                        {myTarget && (
                          <div style={{ fontSize: 11, color: C.textSecond, padding: '0 4px', lineHeight: 1.3 }}>
                            {myTarget}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {ratingType === 'MET_NOT_MET' && (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {['Met', 'Not Met'].map(opt => {
                    const selected = e.self_rating === opt;
                    const myTarget = targetFor(opt);
                    return (
                      <div key={opt} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
                        <button
                          onClick={() => updateEval(kpi.id, { self_rating: opt })}
                          title={myTarget || undefined}
                          style={{
                            ...S.pillBtn,
                            background: selected ? C.text : C.bg,
                            color: selected ? '#fff' : C.text,
                            borderColor: selected ? C.text : C.border,
                          }}>
                          {opt}
                        </button>
                        {myTarget && (
                          <div style={{ fontSize: 11, color: C.textSecond, padding: '0 4px', lineHeight: 1.3 }}>
                            {myTarget}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {ratingType === 'OKR' && (
                <div>
                  {targets[0]?.target && (
                    <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 6, padding: '6px 10px', background: C.bgSecondary, borderRadius: 6 }}>
                      Measurement: {targets[0].target}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" min={0} max={100}
                      style={{ ...S.input, width: 100 }}
                      value={e.self_rating === null ? '' : (e.self_rating as number)}
                      onChange={ev => {
                        const v = ev.target.value;
                        updateEval(kpi.id, { self_rating: v === '' ? null : Math.max(0, Math.min(100, Number(v))) });
                      }} />
                    <span style={{ fontSize: 13, color: C.textSecond }}>%</span>
                  </div>
                </div>
              )}
              {ratingType === 'NUMERIC' && e.self_rating !== null && e.self_rating !== '' && (
                <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 4 }}>
                  {numericLabelFor(e.self_rating)}
                </div>
              )}
            </div>

            {/* Remarks */}
            <div>
              <label style={S.label}>Remarks (optional)</label>
              <textarea style={S.textarea}
                value={e.self_remarks}
                onChange={ev => updateEval(kpi.id, { self_remarks: ev.target.value })}
                placeholder="Additional context, evidence, or notes" />
            </div>
          </div>
        );
      })}

      {lockedKpis.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.borderLight}` }}>
          <button
            onClick={handleSubmit}
            disabled={!allValid || submitMutation.isPending}
            style={{ ...S.btnPrimary, opacity: !allValid ? 0.5 : 1, cursor: !allValid ? 'not-allowed' : 'pointer' }}>
            {submitMutation.isPending ? 'Submitting…' : 'Submit Self Evaluation'}
          </button>
          {!allValid && (
            <div style={{ marginTop: 6, fontSize: 12, color: C.textDanger }}>
              All KPIs must have an Actual Achievement and a Self Rating before you can submit.
            </div>
          )}
          {submitMutation.isSuccess && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#166534', fontWeight: 500 }}>
              ✓ Self evaluation submitted
            </div>
          )}
          {submitMutation.isError && (
            <div style={{ marginTop: 6, fontSize: 12, color: C.textDanger }}>
              {(submitMutation.error as any)?.response?.data?.detail || 'Submission failed'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
