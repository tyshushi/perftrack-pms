import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth';
import { kpisApi, cyclesApi, departmentsApi } from '../api/client';
import PhaseStatusBanner from '../components/common/PhaseStatusBanner';
import { generateScorecardPDF, ScorecardData } from '../utils/pdfExport';
import { saveAs } from 'file-saver';

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
    if (s === 'LOCKED')         return { label: 'Approved & Locked', bg: '#e0f2fe', color: '#0c4a6e' };
    if (s === 'PENDING_DM')     return { label: 'Pending Manager Approval', bg: '#fef9c3', color: '#854d0e' };
    if (s === 'APPROVED')       return { label: 'Approved', bg: '#dcfce7', color: '#166534' };
    if (s === 'SELF_EVALUATED') return { label: 'Self Evaluation Submitted — Awaiting Manager Evaluation', bg: '#ccfbf1', color: '#115e59' };
  }
  if ([...statuses].some(s => s === 'SELF_EVALUATED') &&
      [...statuses].every(s => s === 'SELF_EVALUATED' || s === 'LOCKED')) {
    return { label: 'Self Evaluation In Progress', bg: '#ccfbf1', color: '#115e59' };
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

function ReadOnlyTargetsView({ kpi, cycle }: { kpi: any; cycle: any }) {
  const ratingType = cycle?.rating_type || 'NUMERIC';
  const targets: any[] = Array.isArray(kpi.rating_targets) ? kpi.rating_targets : [];
  if (targets.length === 0) {
    return (
      <div style={{ marginTop: 10, padding: 10, background: '#f7f7f5', borderRadius: 8, border: `0.5px solid ${C.borderLight}`, fontSize: 12, color: C.textTertiary, fontStyle: 'italic' }}>
        No rating targets defined by the cascader.
      </div>
    );
  }
  return (
    <div style={{ marginTop: 10, padding: 12, background: '#f7f7f5', borderRadius: 8, border: `0.5px solid ${C.borderLight}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.textSecond, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
        Rating Targets (set by cascader)
      </div>
      {ratingType === 'OKR' ? (
        <div style={{ fontSize: 13, color: C.text }}>
          <div style={{ fontSize: 11, color: C.textSecond, marginBottom: 4, fontWeight: 600 }}>Measurement</div>
          {targets[0]?.target || '—'}
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
            {targets.map((t: any) => (
              <tr key={String(t.value)}>
                <td style={{ padding: '6px 8px', fontSize: 13, color: C.text }}>
                  <strong>{t.value}</strong>{t.label ? ` — ${t.label}` : ''}
                </td>
                <td style={{ padding: '6px 8px', color: C.textSecond }}>{t.target || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function buildTargetsForKpi(kpi: any, cycle: any) {
  const ratingType = cycle?.rating_type || 'NUMERIC';
  const scaleMax   = cycle?.rating_scale_max || 5;
  const levels: any[] = cycle?.rating_levels || [];
  const existing: any[] = Array.isArray(kpi?.rating_targets) ? kpi.rating_targets : [];
  if (ratingType === 'NUMERIC') {
    const ordered = levels.length
      ? [...levels].sort((a, b) => Number(b.value) - Number(a.value))
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
  const found = existing[0];
  return [{ value: 'OKR', label: 'OKR', target: found?.target || '' }];
}

function RatingTargetsEditor({ kpi, cycle, onSave }: {
  kpi: any;
  cycle: any;
  onSave: (targets: any[]) => void;
}) {
  const ratingType = cycle?.rating_type || 'NUMERIC';
  const [rows, setRows] = useState(() => buildTargetsForKpi(kpi, cycle));

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

function EditKpiForm({ kpi, cycle, onSave, onCancel }: {
  kpi:      any;
  cycle:    any;
  onSave:   (data: { fields: any; targets: any[] | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name,   setName]   = useState(kpi.name || '');
  const [desc,   setDesc]   = useState(kpi.description || '');
  const [dim,    setDim]    = useState(kpi.kpi_dimension || CATEGORIES[0]);
  const [weight, setWeight] = useState<number>(kpi.weight ?? 0);
  const [meas,   setMeas]   = useState(kpi.measurement || '');
  const [targets, setTargets] = useState<any[]>(() => buildTargetsForKpi(kpi, cycle));
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState<string | null>(null);

  const ratingType = cycle?.rating_type || 'NUMERIC';
  const targetsOk = hasCompleteTargets(targets, cycle);
  const nameOk = name.trim().length > 0;
  const canSave = nameOk && targetsOk;

  const handleSave = async () => {
    setErr(null);
    setSaving(true);
    try {
      await onSave({
        fields: { name, description: desc, kpi_dimension: dim, weight, measurement: meas },
        targets,
      });
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 10, padding: 12, background: C.bgSecondary, border: `0.5px solid ${C.borderLight}`, borderRadius: 8 }}>
      <div style={{ fontWeight: 500, fontSize: 13, color: C.text, marginBottom: 10 }}>
        Edit KPI
      </div>

      <div style={S.grid2}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>KPI Name</label>
          <input style={S.input} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>Description</label>
          <textarea style={{ ...S.input, minHeight: 54, resize: 'vertical' }}
            value={desc} onChange={e => setDesc(e.target.value)} />
        </div>
        <div>
          <label style={S.label}>KPI Dimension</label>
          <select style={S.input} value={dim} onChange={e => setDim(e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Weight %</label>
          <input style={S.input} type="number" min={0} max={100}
            value={weight} onChange={e => setWeight(Number(e.target.value))} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>Measurement</label>
          <input style={S.input} value={meas} onChange={e => setMeas(e.target.value)} />
        </div>
      </div>

      {cycle && (
        <div style={{ marginTop: 4, padding: 12, background: C.bg, borderRadius: 8, border: `0.5px solid ${C.borderLight}` }}>
          <div style={{ fontWeight: 500, fontSize: 13, color: C.text, marginBottom: 4 }}>
            Rating Targets <span style={{ color: C.textDanger }}>*</span>
          </div>
          <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 8 }}>
            Define what achievement looks like for each rating level.
          </div>
          {ratingType === 'OKR' ? (
            <div>
              <label style={S.label}>Describe how 0-100% achievement will be measured</label>
              <input style={S.input}
                value={targets[0]?.target || ''}
                onChange={e => setTargets(prev => prev.length
                  ? prev.map((r, i) => i === 0 ? { ...r, target: e.target.value } : r)
                  : [{ value: 'OKR', label: 'OKR', target: e.target.value }])} />
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
                {targets.map((r, i) => (
                  <tr key={String(r.value)}>
                    <td style={{ padding: '6px 8px', fontSize: 13, color: C.text }}>
                      <strong>{r.value}</strong>{r.label ? ` — ${r.label}` : ''}
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input style={S.input} value={r.target}
                        onChange={e => setTargets(prev => prev.map((row, idx) =>
                          idx === i ? { ...row, target: e.target.value } : row))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {err && (
        <div style={{ marginTop: 8, fontSize: 12, color: C.textDanger }}>{err}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={handleSave}
          disabled={!canSave || saving}
          style={{ ...S.btnPrimary, opacity: (!canSave || saving) ? 0.5 : 1 }}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button onClick={onCancel} style={S.btnSm} disabled={saving}>Cancel</button>
      </div>
      {!targetsOk && (
        <div style={{ marginTop: 6, fontSize: 12, color: C.textDanger }}>
          Fill in all rating target descriptions before saving.
        </div>
      )}
    </div>
  );
}

function KpiCard({
  kpi, cycle, onDelete, onSaveTargets, onSaveEdit,
}: {
  kpi:            any;
  cycle:          any;
  onDelete:       () => void;
  onSaveTargets:  (targets: any[]) => void;
  onSaveEdit:     (payload: { fields: any; targets: any[] | null }) => Promise<void>;
}) {
  const targetsComplete = hasCompleteTargets(kpi.rating_targets, cycle);
  const needsTargets = !targetsComplete && (kpi.status === 'DRAFT' || kpi.status === 'REJECTED' || kpi.status === 'APPROVED');
  const isFixed = kpi.kpi_type === 'FIXED';
  const [showTargets, setShowTargets] = useState(needsTargets && !isFixed);
  const [editing,    setEditing]    = useState(false);
  const [flash,      setFlash]      = useState(false);
  // REJECTED FIXED KPIs were rejected by the manager who cascaded them — staff can edit/delete
  const canDelete = (kpi.status === 'DRAFT' && !isFixed) || kpi.status === 'REJECTED';
  const showTargetsSection = (kpi.status === 'DRAFT' || kpi.status === 'REJECTED' || kpi.status === 'APPROVED') && !!cycle;
  const canEditTargets = showTargetsSection && !isFixed;
  const canEditKpi = (kpi.status === 'DRAFT' && !isFixed || kpi.status === 'REJECTED') && !!cycle;

  const handleSave = async (payload: { fields: any; targets: any[] | null }) => {
    await onSaveEdit(payload);
    setEditing(false);
    setFlash(true);
    setTimeout(() => setFlash(false), 2000);
  };

  return (
    <div style={{ ...S.card, marginBottom: 8, ...(flash ? { boxShadow: '0 0 0 2px #86efac', transition: 'box-shadow 200ms ease' } : {}) }}>
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
            {kpi.kpi_dimension}
            {kpi.measurement ? ` · Measurement: ${kpi.measurement}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0, marginLeft: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {canEditKpi && !editing && (
              <button
                onClick={() => setEditing(true)}
                title="Edit KPI"
                aria-label="Edit KPI"
                style={{
                  padding: '4px 8px', border: `1px solid ${C.border}`, borderRadius: 6,
                  background: C.bg, color: C.textSecond, fontSize: 12, cursor: 'pointer',
                  fontFamily: C.font, display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                <span aria-hidden="true">✎</span> Edit
              </button>
            )}
            <StatusPill status={kpi.status} />
            {kpi.is_late && (
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontWeight: 500 }}>
                🕐 Late
              </span>
            )}
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: C.text }}>{kpi.weight}%</div>
        </div>
      </div>

      {flash && (
        <div style={{ marginBottom: 8, padding: '6px 10px', borderRadius: 6, background: '#dcfce7', color: '#166534', fontSize: 12, fontWeight: 500 }}>
          ✓ KPI updated
        </div>
      )}

      {editing && (
        <EditKpiForm
          kpi={kpi}
          cycle={cycle}
          onSave={handleSave}
          onCancel={() => setEditing(false)} />
      )}

      {/* Delete for optional DRAFT KPIs (REJECTED delete button is rendered
          below the manager comment further down) */}
      {!editing && canDelete && kpi.status !== 'REJECTED' && (
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

      {!editing && canDelete && kpi.status === 'REJECTED' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={onDelete} style={{ ...S.btnSm, color: '#991b1b', borderColor: '#fca5a5' }}>
            Delete
          </button>
        </div>
      )}

      {kpi.status === 'PENDING_DM' && (
        <div style={{ marginTop: 8, fontSize: 12, color: C.textSecond, fontStyle: 'italic' }}>
          Awaiting manager approval…
        </div>
      )}

      {!editing && showTargetsSection && (
        <div style={{ marginTop: 10 }}>
          {needsTargets && (
            <div style={{ fontSize: 12, padding: '6px 10px', background: '#fef2f2', color: '#991b1b', borderRadius: 6, marginBottom: 6, fontWeight: 500 }}>
              ⚠ Rating targets not set — required before submission
            </div>
          )}
          {isFixed ? (
            <ReadOnlyTargetsView kpi={kpi} cycle={cycle} />
          ) : (
            <>
              <button onClick={() => setShowTargets(s => !s)}
                style={{ ...S.btnSm, fontSize: 11 }}>
                {showTargets ? '▾ Hide Rating Targets' : '▸ Set Rating Targets'}
                {targetsComplete && (
                  <span style={{ marginLeft: 6, color: '#166534' }}>✓ defined</span>
                )}
              </button>
              {showTargets && canEditTargets && (
                <RatingTargetsEditor
                  kpi={kpi}
                  cycle={cycle}
                  onSave={onSaveTargets} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function KpiSettingPage() {
  const { user } = useAuthStore();
  const isHrAdmin = useAuthStore(s => s.isHrAdmin());
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState('');
  const [adding,  setAdding]  = useState(false);
  const [name,    setName]    = useState('');
  const [desc,    setDesc]    = useState('');
  const [cat,     setCat]     = useState('Financials');
  const [weight,  setWeight]  = useState(0);
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

  const { data: kpis = [], refetch: refetchKpis } = useQuery({
    queryKey: ['kpis', cycleId, user?.id],
    queryFn:  () => kpisApi.list(cycleId, user?.id).then(r => r.data),
    enabled:  !!cycleId && !!user?.id,
  });

  const { data: countLimits = { min: 3, max: 10 } } = useQuery({
    queryKey: ['kpi-count-limits'],
    queryFn:  () => kpisApi.getCountLimits().then(r => r.data),
  });

  const { data: weightRules = [] } = useQuery({
    queryKey: ['weight-rules', cycleId],
    queryFn:  () => kpisApi.getWeightRules(cycleId).then(r => r.data),
    enabled:  !!cycleId,
  });

  const { data: applicableRule = null } = useQuery({
    queryKey: ['applicable-rule', cycleId, user?.id],
    queryFn:  () => kpisApi.getApplicableRule(user!.id, cycleId).then(r => r.data),
    enabled:  !!cycleId && !!user?.id,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn:  () => departmentsApi.list().then(r => r.data),
  });

  const [showRulesCard, setShowRulesCard] = useState(true);
  const [weightBarExpanded, setWeightBarExpanded] = useState(() => {
    try { return localStorage.getItem('kpi_weight_bar_expanded') !== 'false'; } catch { return true; }
  });
  const [exportingPdf, setExportingPdf] = useState(false);

  const handleExportScorecard = async () => {
    if (!currentCycle || !user) return;
    setExportingPdf(true);
    try {
      const deptName = (departments as any[]).find((d: any) => d.id === user.department_id)?.name || '';
      const data: ScorecardData = {
        employee: {
          full_name: user.full_name,
          employee_code: (user as any).employee_id || '',
          position_title: (user as any).position_title || '',
          department_name: deptName,
        },
        cycle: {
          name: currentCycle.name,
          year: currentCycle.year,
          rating_type: currentCycle.rating_type || 'NUMERIC',
          rating_scale_max: currentCycle.rating_scale_max,
          rating_levels: currentCycle.rating_levels || [],
        },
        kpis: kpis as any[],
      };
      const blob = await generateScorecardPDF(data);
      const code = ((user as any).employee_id || user.full_name.replace(/\s+/g, '_')).replace(/[^a-zA-Z0-9_-]/g, '');
      saveAs(blob, `${code}_scorecard_${currentCycle.year}.pdf`);
    } finally {
      setExportingPdf(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await kpisApi.create({
        cycle_id: cycleId, name, description: desc,
        kpi_dimension: cat, weight, target: '', measurement: meas,
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
      setName(''); setDesc(''); setMeas(''); setWeight(0);
      setInlineTargets(buildEmptyTargetRows(currentCycle));
    },
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

  const handleSaveEdit = async (kpiId: string, payload: { fields: any; targets: any[] | null }) => {
    await kpisApi.update(kpiId, payload.fields);
    if (payload.targets) {
      await kpisApi.updateRatingTargets(kpiId, payload.targets);
    }
    await qc.invalidateQueries({ queryKey: ['kpis', cycleId, user?.id] });
    await refetchKpis();
  };

  const totalWeight = (kpis as any[]).reduce((sum, k) => sum + k.weight, 0);
  const activeKpiCount = (kpis as any[]).filter(k => k.status !== 'REJECTED').length;
  const atMaxKpis = activeKpiCount >= (countLimits as any).max;
  const hasSubmittable = (kpis as any[]).some(k => k.status === 'DRAFT' || k.status === 'REJECTED');
  const allSelfEvaluated = (kpis as any[]).length > 0 &&
    (kpis as any[]).every(k => k.status === 'SELF_EVALUATED');
  const allTargetsSet = (kpis as any[]).length > 0 &&
    (kpis as any[]).every(k => hasCompleteTargets(k.rating_targets, currentCycle));

  const ruleDims: Record<string, { min: number; max: number }> =
    (applicableRule as any)?.dimensions || {};

  // Recomputes whenever kpis or the applicable rule changes — ensures the
  // weight summary cards reflect fresh data after a KPI edit invalidates
  // the query cache.
  const bykpi_dimension = useMemo(() => CATEGORIES.map(c => {
    const total = (kpis as any[])
      .filter(k => k.kpi_dimension === c && k.status !== 'REJECTED')
      .reduce((s, k) => s + k.weight, 0);
    const d = ruleDims[c];
    const min = d?.min ?? 0;
    const max = d?.max ?? 100;
    return { cat: c, total, min, max, hasRule: !!d };
  }), [kpis, applicableRule]);

  // Mathematical impossibility check: any dimension under-min that needs
  // more weight than remains of the 100% total.
  const usedWeight = (kpis as any[])
    .filter(k => k.status !== 'REJECTED')
    .reduce((s, k) => s + k.weight, 0);
  const remainingTotalWeight = Math.max(0, 100 - usedWeight);
  const impossibilityWarnings: { cat: string; needed: number }[] = [];
  if (applicableRule) {
    for (const d of bykpi_dimension) {
      if (d.total < d.min) {
        const needed = d.min - d.total;
        if (needed > remainingTotalWeight) {
          impossibilityWarnings.push({ cat: d.cat, needed });
        }
      }
    }
  }

  // Inline Add KPI dimension check
  const currentDimTotal = (kpis as any[])
    .filter(k => k.kpi_dimension === cat && k.status !== 'REJECTED')
    .reduce((s, k) => s + k.weight, 0);
  const dimMaxForAdd = ruleDims[cat]?.max ?? 100;
  const newDimTotal = currentDimTotal + (Number.isFinite(weight) ? weight : 0);
  const exceedsDimMax = !!applicableRule && weight > 0 && newDimTotal > dimMaxForAdd;

  const globalMinRuleTop = (weightRules as any[]).find((r: any) => r.label === 'GLOBAL_MIN');
  const globalMinWeight: number =
    (applicableRule as any)?.global_min_weight
    ?? globalMinRuleTop?.dimensions?.['Financials']?.min
    ?? 0;
  const belowGlobalMin = globalMinWeight > 0 && weight < globalMinWeight;

  const statusSummary = scorecardStatusSummary(kpis as any[]);

  // Collect every dimension that violates the applicable rule, for the
  // Submit-Scorecard button validation message.
  const dimensionViolations: { cat: string; total: number; min: number; max: number }[] = [];
  if (applicableRule) {
    for (const d of bykpi_dimension) {
      if (!d.hasRule) continue;
      if (d.total < d.min || d.total > d.max) {
        dimensionViolations.push({ cat: d.cat, total: d.total, min: d.min, max: d.max });
      }
    }
  }

  const submitDisabledReason = activeKpiCount < (countLimits as any).min
    ? `Minimum ${(countLimits as any).min} KPIs required. You have ${activeKpiCount} — add ${(countLimits as any).min - activeKpiCount} more.`
    : totalWeight !== 100
    ? `Total weight is ${totalWeight}% — must equal 100%`
    : !hasSubmittable
    ? 'No KPIs in Draft or Rejected status to submit'
    : !allTargetsSet
    ? 'All KPIs must have rating targets defined before submitting'
    : dimensionViolations.length > 0
    ? 'Cannot submit: ' + dimensionViolations
        .map(v => `${v.cat} is at ${v.total}% but must be between ${v.min}%–${v.max}%`)
        .join('; ')
    : null;

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: C.text }}>My Scorecard</h1>
          <p style={{ fontSize: 13, color: C.textSecond }}>
            Set your KPIs for this performance cycle
          </p>
        </div>
        {(kpis as any[]).length > 0 && (
          <button
            onClick={handleExportScorecard}
            disabled={exportingPdf}
            style={{ padding: '7px 14px', border: `1px solid #bae6fd`, borderRadius: 8, background: '#e0f2fe', color: '#0369a1', fontSize: 12, fontWeight: 500, cursor: exportingPdf ? 'not-allowed' : 'pointer', fontFamily: C.font, opacity: exportingPdf ? 0.6 : 1, flexShrink: 0 }}>
            {exportingPdf ? 'Exporting…' : '⬇ Export Scorecard'}
          </button>
        )}
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

      {cycleId && <PhaseStatusBanner cycleId={cycleId} phase="kpi_setting" isHrAdmin={isHrAdmin} />}

      {cycleId && (() => {
        if (!applicableRule) {
          return (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: C.bgSecondary, border: `1px solid ${C.borderLight}`, color: C.textSecond, fontSize: 12, marginBottom: 12 }}>
              📋 No weight restrictions for this cycle.
            </div>
          );
        }
        const role = applicableRule.creator_role;
        const palette =
          role === 'HR_ADMIN' || role === 'SUPER_ADMIN'
            ? { bg: '#dbeafe', border: '#bfdbfe', color: '#1e40af', label: 'HR Admin' }
          : role === 'HOD'
            ? { bg: '#ede9fe', border: '#ddd6fe', color: '#5b21b6', label: 'Your HOD' }
          : role === 'MANAGER' || role === 'MGR2'
            ? { bg: '#dcfce7', border: '#bbf7d0', color: '#166534', label: 'Your Manager' }
          : { bg: C.bgSecondary, border: C.borderLight, color: C.text, label: 'Rule Owner' };
        const dims = applicableRule.dimensions || {};
        const globalMinRule = (weightRules as any[]).find((r: any) => r.label === 'GLOBAL_MIN');
        const minPerKpi = applicableRule.global_min_weight
          ?? globalMinRule?.dimensions?.['Financials']?.min
          ?? 0;
        return (
          <div style={{ background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              onClick={() => setShowRulesCard(v => !v)}>
              <div style={{ fontSize: 13, fontWeight: 600, color: palette.color }}>
                📋 Your Weight Rules — {applicableRule.label || 'Rule'} (set by {palette.label})
              </div>
              <span style={{ fontSize: 12, color: palette.color }}>{showRulesCard ? '▾' : '▸'}</span>
            </div>
            {showRulesCard && (
              <div style={{ marginTop: 10, background: C.bg, borderRadius: 8, border: `1px solid ${C.borderLight}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.bgSecondary }}>
                      <th style={S.th}>KPI Dimension</th>
                      <th style={{ ...S.th, width: 100 }}>Min %</th>
                      <th style={{ ...S.th, width: 100 }}>Max %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CATEGORIES.map((c, di, arr) => (
                      <tr key={c}>
                        <td style={{ ...S.td, fontWeight: 500, borderBottom: di < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>{c}</td>
                        <td style={{ ...S.td, borderBottom: di < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>{dims[c]?.min ?? 0}%</td>
                        <td style={{ ...S.td, borderBottom: di < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>{dims[c]?.max ?? 100}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '8px 12px', fontSize: 12, color: C.textSecond, background: C.bgSecondary, borderTop: `1px solid ${C.borderLight}` }}>
                  Minimum per KPI: {minPerKpi}%
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {cycleId && (
        <div>
          {/* Scorecard status summary */}
          {statusSummary && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: statusSummary.bg, color: statusSummary.color, fontSize: 13, fontWeight: 500, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Status:</span>
              <span>{statusSummary.label}</span>
            </div>
          )}

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
              cycle={currentCycle}
              onDelete={() => deleteMutation.mutate(kpi.id)}
              onSaveTargets={targets => ratingTargetsMutation.mutate({ id: kpi.id, targets })}
              onSaveEdit={payload => handleSaveEdit(kpi.id, payload)}
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
                    {applicableRule && ruleDims[cat] && (
                      <span style={{ fontWeight: 400, color: C.textTertiary, marginLeft: 6 }}>
                        ({cat} allowed: {ruleDims[cat].min}–{ruleDims[cat].max}%)
                      </span>
                    )}
                  </label>
                  <input style={S.input} type="number" min={0} max={100}
                    value={weight} onChange={e => setWeight(Number(e.target.value))} />
                  {belowGlobalMin && (
                    <div style={{ marginTop: 4, fontSize: 12, color: C.textDanger }}>
                      Minimum weight per KPI is {globalMinWeight}%. Please enter a higher value.
                    </div>
                  )}
                  {applicableRule && weight > 0 && (
                    <div style={{ marginTop: 4, fontSize: 12, color: exceedsDimMax ? C.textDanger : C.textSecond }}>
                      {`Current ${cat}: ${currentDimTotal}% → After adding: ${newDimTotal}% (max: ${dimMaxForAdd}%)`}
                      {exceedsDimMax && (
                        <div style={{ marginTop: 2, fontWeight: 500 }}>
                          ⚠ Adding {weight}% to {cat} would bring total to {newDimTotal}% — exceeds maximum of {dimMaxForAdd}%
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={S.label}>Measurement</label>
                  <input style={S.input} value={meas}
                    onChange={e => setMeas(e.target.value)}
                    placeholder="e.g. Monthly sales report, Annual financial audit, 360° feedback survey, System-generated data from Salesforce, Manager observation and quarterly review" />
                  <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 4 }}>
                    Describe how achievement will be tracked and verified
                  </div>
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
                  disabled={!name || !hasCompleteTargets(inlineTargets, currentCycle) || belowGlobalMin || exceedsDimMax || atMaxKpis || createMutation.isPending}
                  style={{ ...S.btnPrimary, opacity: (!name || !hasCompleteTargets(inlineTargets, currentCycle) || belowGlobalMin || exceedsDimMax || atMaxKpis) ? 0.5 : 1 }}>
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
            <button
              onClick={() => !atMaxKpis && setAdding(true)}
              disabled={atMaxKpis}
              title={atMaxKpis ? `Maximum ${(countLimits as any).max} KPIs per scorecard reached` : undefined}
              style={{ ...S.btnSm, width: '100%', padding: '10px', borderStyle: 'dashed', marginTop: 8, opacity: atMaxKpis ? 0.5 : 1, cursor: atMaxKpis ? 'not-allowed' : 'pointer' }}>
              {atMaxKpis ? `Max ${(countLimits as any).max} KPIs reached` : '+ Add Optional KPI'}
            </button>
          )}

          {/* Submit Scorecard */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: `0.5px solid ${C.borderLight}` }}>
            {allSelfEvaluated ? (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: '#ccfbf1', color: '#115e59', fontSize: 13, fontWeight: 500 }}>
                Self evaluation submitted. Awaiting manager evaluation.
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Sticky weight and KPI count bar */}
      {cycleId && (
        <div style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 100,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          borderTop: '1px solid ' + C.borderLight,
          boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.04)',
          padding: '16px 24px',
          marginTop: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: weightBarExpanded ? 12 : 0 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: C.text }}>Weight and KPI Count</span>
            <button
              onClick={() => {
                const next = !weightBarExpanded;
                setWeightBarExpanded(next);
                try { localStorage.setItem('kpi_weight_bar_expanded', String(next)); } catch {}
              }}
              style={{ ...S.btnSm, fontSize: 11, padding: '3px 8px' }}
              aria-label={weightBarExpanded ? 'Collapse weight summary' : 'Expand weight summary'}>
              {weightBarExpanded ? '▲' : '▼'}
            </button>
          </div>

          {weightBarExpanded ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 10 }}>
                {bykpi_dimension.map(({ cat, total, min, max, hasRule }) => {
                  let state: 'green' | 'yellow' | 'red' | 'grey';
                  if (total > max) state = 'red';
                  else if (total >= min && total <= max && (total > 0 || min > 0)) state = 'green';
                  else if (total > 0 && total < min) state = 'yellow';
                  else state = 'grey';

                  const pal = {
                    green:  { bg: '#dcfce7', border: '#bbf7d0', text: '#166534', bar: '#16a34a' },
                    yellow: { bg: '#fef9c3', border: '#fde68a', text: '#854d0e', bar: '#ca8a04' },
                    red:    { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', bar: '#dc2626' },
                    grey:   { bg: C.bgSecondary, border: C.borderLight, text: C.textSecond, bar: C.textTertiary },
                  }[state];

                  const pct = Math.min(100, (total / Math.max(max, 1)) * 100);
                  const remaining = Math.max(0, max - total);
                  const needed    = Math.max(0, min - total);

                  return (
                    <div key={cat} style={{ padding: '10px 12px', borderRadius: 8, background: pal.bg, border: `0.5px solid ${pal.border}` }}>
                      <div style={{ fontSize: 11, color: C.textSecond, marginBottom: 4 }}>{cat}</div>
                      <div style={{ fontSize: 20, fontWeight: 500, color: pal.text }}>{total}%</div>
                      <div style={{ height: 6, background: '#ffffff', borderRadius: 3, marginTop: 6, overflow: 'hidden', border: `0.5px solid ${C.borderLight}` }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: pal.bar, transition: 'width 200ms ease' }} />
                      </div>
                      {hasRule && (
                        <div style={{ fontSize: 10, color: pal.text, marginTop: 6 }}>Range: {min}%–{max}%</div>
                      )}
                      {hasRule && state !== 'red' && (
                        <div style={{ fontSize: 10, color: C.textTertiary, marginTop: 2 }}>Remaining: {remaining}%</div>
                      )}
                      {state === 'yellow' && (
                        <div style={{ fontSize: 11, color: pal.text, marginTop: 4, fontWeight: 500 }}>
                          ⚠ Need {needed}% more to meet minimum
                        </div>
                      )}
                      {state === 'red' && (
                        <div style={{ fontSize: 11, color: pal.text, marginTop: 4, fontWeight: 500 }}>
                          ⚠ {total - max}% over maximum — remove or reduce KPIs
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {impossibilityWarnings.length > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fee2e2', border: `0.5px solid #fca5a5`, color: '#991b1b', fontSize: 12, marginBottom: 10 }}>
                  {impossibilityWarnings.map(w => (
                    <div key={w.cat} style={{ marginBottom: 2 }}>
                      ⚠ Cannot reach minimum for {w.cat}: need {w.needed}% more but only {remainingTotalWeight}% of total weight remaining
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `0.5px solid ${C.borderLight}` }}>
                <span style={{ fontSize: 13, color: C.textSecond }}>Total</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: totalWeight === 100 ? '#166534' : '#991b1b' }}>
                  {totalWeight}%
                  {totalWeight !== 100 && <span style={{ fontSize: 11, marginLeft: 6 }}>(must equal 100%)</span>}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `0.5px solid ${C.borderLight}`, marginTop: 8 }}>
                <span style={{ fontSize: 13, color: C.textSecond }}>KPI Count</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: activeKpiCount < (countLimits as any).min ? '#991b1b' : '#166534' }}>
                  {activeKpiCount} / {(countLimits as any).max}
                  <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 6, color: C.textSecond }}>
                    (min {(countLimits as any).min} to submit)
                  </span>
                </span>
              </div>
              {activeKpiCount < (countLimits as any).min && (
                <div style={{ marginTop: 6, padding: '6px 10px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>
                  Add at least {(countLimits as any).min - activeKpiCount} more KPI{(countLimits as any).min - activeKpiCount !== 1 ? 's' : ''} to submit
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', alignItems: 'center', fontSize: 12, color: C.textSecond }}>
              <span style={{ fontWeight: 600, color: totalWeight === 100 ? '#166534' : '#991b1b' }}>
                Total Weight: {totalWeight}% / 100%
              </span>
              <span>·</span>
              <span>KPIs: {activeKpiCount} / {(countLimits as any).max}</span>
              {bykpi_dimension.map(d => (
                <span key={d.cat}>
                  {' · '}{d.cat}: {d.total}%{d.hasRule ? ` (${d.min}–${d.max}%)` : ''}
                </span>
              ))}
            </div>
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
  th:         { textAlign: 'left', padding: '10px', borderBottom: `1px solid ${C.borderLight}`, fontSize: 11, color: C.textSecond, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' },
  td:         { padding: '10px', fontSize: 13, color: C.text },
};
