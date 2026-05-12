import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { kpisApi, usersApi, cyclesApi } from '../api/client';
import { useAuthStore } from '../store/auth';
import PhaseStatusBanner from '../components/common/PhaseStatusBanner';

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

const STATUS_LABELS: Record<string, string> = {
  DRAFT:          'Draft',
  PENDING_DM:     'Pending Direct Manager',
  PENDING_RM:     'Pending Reviewing Manager',
  PENDING_HOD:    'Pending HOD',
  APPROVED:       'Approved',
  REJECTED:       'Rejected',
  LOCKED:         'Locked',
  SELF_EVALUATED: 'Self Evaluated',
  MGR_EVALUATED:  'Manager Evaluated',
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  DRAFT:          { bg: '#f5f5f3', color: '#555' },
  PENDING_DM:     { bg: '#fef9c3', color: '#854d0e' },
  PENDING_RM:     { bg: '#ffedd5', color: '#9a3412' },
  PENDING_HOD:    { bg: '#fce7f3', color: '#9d174d' },
  APPROVED:       { bg: '#dcfce7', color: '#166534' },
  REJECTED:       { bg: '#fee2e2', color: '#991b1b' },
  LOCKED:         { bg: '#e0f2fe', color: '#0c4a6e' },
  SELF_EVALUATED: { bg: '#ccfbf1', color: '#115e59' },
  MGR_EVALUATED:  { bg: '#dcfce7', color: '#166534' },
};

const DIMENSION_COLORS: Record<string, string> = {
  Financials:              '#0369a1',
  Customer:                '#6d28d9',
  'Internal Process':      '#92400e',
  'Learning & Growth':     '#166534',
  'Leadership & Culture':  '#9d174d',
};

type EvalStage = 'NOT_STARTED' | 'SELF_SUBMITTED' | 'EVAL_IN_PROGRESS' | 'EVAL_COMPLETE';

const STAGE_STYLE: Record<EvalStage, { bg: string; color: string; label: string }> = {
  NOT_STARTED:      { bg: '#efefec', color: '#6b6b6b', label: 'Not Started' },
  SELF_SUBMITTED:   { bg: '#e0f2fe', color: '#0369a1', label: 'Self Eval Submitted' },
  EVAL_IN_PROGRESS: { bg: '#fef9c3', color: '#854d0e', label: 'Evaluation In Progress' },
  EVAL_COMPLETE:    { bg: '#dcfce7', color: '#166534', label: 'Evaluation Complete' },
};

function computeStage(kpis: any[]): EvalStage {
  if (!kpis || kpis.length === 0) return 'NOT_STARTED';
  const mgrEvaluated = kpis.filter(k => k.status === 'MGR_EVALUATED');
  if (mgrEvaluated.length === kpis.length) return 'EVAL_COMPLETE';
  if (mgrEvaluated.length > 0)             return 'EVAL_IN_PROGRESS';
  const anyReadyForReview = kpis.some(k => k.status === 'SELF_EVALUATED');
  if (anyReadyForReview)                   return 'SELF_SUBMITTED';
  return 'NOT_STARTED';
}

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.DRAFT;
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px',
      borderRadius: 10, background: s.bg, color: s.color }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

const R_LABELS_DEFAULT = ['', 'Unsatisfactory', 'Needs Improvement',
                          'Meets Expectations', 'Exceeds Expectations', 'Outstanding'];

function ratingLabelFor(value: any, cycle: any): string {
  const levels: any[] = Array.isArray(cycle?.rating_levels) ? cycle.rating_levels : [];
  const ratingType = cycle?.rating_type || 'NUMERIC';
  if (ratingType === 'NUMERIC') {
    const lv = levels.find(l => Number(l.value) === Number(value));
    return lv?.label || (R_LABELS_DEFAULT[Number(value)] || '');
  }
  const lv = levels.find(l => l.value === value);
  return lv?.label || (typeof value === 'string' ? value : '');
}

function ratingDescriptionFor(value: any, levels: any[]): string {
  if (!Array.isArray(levels)) return '';
  const lv = levels.find(l => Number(l.value) === Number(value));
  return lv?.description || '';
}

function SelfEvalSection({ kpi, cycle }: { kpi: any; cycle: any }) {
  const hasAnything =
    kpi.actual_achievement ||
    (kpi.self_rating !== null && kpi.self_rating !== undefined) ||
    kpi.self_remarks;
  if (!hasAnything) return null;
  const label = ratingLabelFor(kpi.self_rating, cycle);
  const ratingDisplay = (kpi.self_rating !== null && kpi.self_rating !== undefined)
    ? (label ? `${kpi.self_rating} — ${label}` : String(kpi.self_rating))
    : '—';
  return (
    <div style={{ background: C.bgInfo, border: `0.5px solid #bae6fd`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.textInfo, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
        Staff Self Evaluation
      </div>
      {kpi.actual_achievement && (
        <div style={{ fontSize: 12, color: C.text, marginBottom: 6 }}>
          <strong style={{ color: C.textSecond, fontWeight: 600 }}>Actual achievement:</strong>{' '}
          <span style={{ whiteSpace: 'pre-wrap' }}>{kpi.actual_achievement}</span>
        </div>
      )}
      <div style={{ fontSize: 12, color: C.text, marginBottom: kpi.self_remarks ? 6 : 0 }}>
        <strong style={{ color: C.textSecond, fontWeight: 600 }}>Self rating:</strong>{' '}
        {ratingDisplay}
      </div>
      {kpi.self_remarks && (
        <div style={{ fontSize: 12, color: C.text }}>
          <strong style={{ color: C.textSecond, fontWeight: 600 }}>Self remarks:</strong>{' '}
          <span style={{ whiteSpace: 'pre-wrap' }}>{kpi.self_remarks}</span>
        </div>
      )}
    </div>
  );
}

function DimensionBadge({ dimension }: { dimension: string }) {
  const color = DIMENSION_COLORS[dimension] || C.textSecond;
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8,
      background: color + '18', color, fontWeight: 500 }}>
      {dimension}
    </span>
  );
}

function EmployeeScorecard({
  report, kpis, stage, cycle, user, isHrAdmin, onSubmitted,
}: {
  report: any;
  kpis: any[];
  stage: EvalStage;
  cycle: any;
  user: any;
  isHrAdmin: boolean;
  onSubmitted: () => void;
}) {
  const qc = useQueryClient();
  const maxRating: number    = cycle?.rating_scale_max || 5;
  const ratingLevels: any[]  = Array.isArray(cycle?.rating_levels) ? cycle.rating_levels : [];
  const ratingOptions        = useMemo(() => {
    if (ratingLevels.length > 0) {
      return ratingLevels
        .map((l: any) => ({ value: Number(l.value), label: l.label || '' }))
        .sort((a, b) => a.value - b.value);
    }
    return Array.from({ length: maxRating }, (_, i) => ({
      value: i + 1,
      label: R_LABELS_DEFAULT[i + 1] || '',
    }));
  }, [ratingLevels, maxRating]);

  const initialRatings: Record<string, number> = useMemo(() => {
    const init: Record<string, number> = {};
    kpis.forEach((k: any) => {
      if (k.mgr_score !== null && k.mgr_score !== undefined) {
        init[k.id] = Number(k.mgr_score);
      } else if (k.self_rating !== null && k.self_rating !== undefined) {
        init[k.id] = Number(k.self_rating);
      }
    });
    return init;
  }, [kpis]);

  const initialRemarks: Record<string, string> = useMemo(() => {
    const init: Record<string, string> = {};
    kpis.forEach((k: any) => { init[k.id] = k.mgr_comment || ''; });
    return init;
  }, [kpis]);

  const [ratings, setRatings] = useState<Record<string, number>>(initialRatings);
  const [remarks, setRemarks] = useState<Record<string, string>>(initialRemarks);

  useEffect(() => { setRatings(initialRatings); }, [initialRatings]);
  useEffect(() => { setRemarks(initialRemarks); }, [initialRemarks]);

  const totalWeighted = useMemo(() => {
    let sum = 0;
    kpis.forEach((k: any) => {
      const r = ratings[k.id];
      if (r != null && k.weight != null && maxRating) {
        sum += (Number(k.weight) * Number(r)) / Number(maxRating);
      }
    });
    return sum;
  }, [kpis, ratings, maxRating]);

  const allRated = kpis.length > 0 && kpis.every(k =>
    ratings[k.id] !== null && ratings[k.id] !== undefined);

  const submitMutation = useMutation({
    mutationFn: () => kpisApi.evaluateAll({
      cycle_id:    cycle.id,
      employee_id: report.id,
      evaluations: kpis
        .filter(k => k.status === 'SELF_EVALUATED' || k.status === 'MGR_EVALUATED')
        .map(k => ({
          kpi_id:      k.id,
          mgr_rating:  ratings[k.id],
          mgr_remarks: remarks[k.id] || '',
        })),
    }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['eval-kpis'] });
      qc.invalidateQueries({ queryKey: ['kpis'] });
      onSubmitted();
      if (res?.data?.overall_score !== undefined) {
        alert(`Evaluation submitted. Overall score: ${res.data.overall_score} / 100`);
      }
    },
    onError: (e: any) => {
      alert(e?.response?.data?.detail || 'Failed to submit evaluation');
    },
  });

  const badge = STAGE_STYLE[stage];

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {/* Role badges */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {report.direct_manager_id    === user?.id && <span style={S.roleBadge('#0369a1')}>Direct Manager</span>}
        {report.reviewing_manager_id === user?.id && <span style={S.roleBadge('#6d28d9')}>Reviewing Manager</span>}
        {report.hod_id               === user?.id && <span style={S.roleBadge('#92400e')}>HOD</span>}
        {isHrAdmin && <span style={S.roleBadge('#166534')}>HR Admin (full access)</span>}
      </div>

      {/* Header summary */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', background: C.bgSecondary,
        border: `0.5px solid ${C.borderLight}`, borderRadius: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ fontWeight: 500, fontSize: 14, color: C.text }}>{report.full_name}</div>
          <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 9px',
            borderRadius: 10, background: badge.bg, color: badge.color }}>
            {badge.label}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: C.textSecond }}>Weighted Score Preview</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
            {totalWeighted.toFixed(2)} / 100
          </div>
        </div>
      </div>

      {kpis.length === 0 && (
        <div style={{ textAlign: 'center', padding: 32, color: C.textSecond, fontSize: 13 }}>
          No KPIs found for this employee.
        </div>
      )}

      {kpis.map((kpi: any) => {
        const selected = ratings[kpi.id];
        const weighted = (selected != null && maxRating)
          ? (Number(kpi.weight) * Number(selected)) / Number(maxRating)
          : 0;
        const isLocked = kpi.status === 'MGR_EVALUATED';

        return (
          <div key={kpi.id} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <div style={{ fontWeight: 500, color: C.text, fontSize: 14 }}>{kpi.name}</div>
                  {kpi.kpi_dimension && <DimensionBadge dimension={kpi.kpi_dimension} />}
                  <span style={{ fontSize: 11, color: C.textSecond,
                    padding: '2px 8px', background: C.bgTertiary, borderRadius: 8 }}>
                    Weight: {kpi.weight}%
                  </span>
                </div>
                {kpi.measurement && (
                  <div style={{ fontSize: 12, color: C.textSecond, marginTop: 4 }}>
                    <strong style={{ fontWeight: 600 }}>Measurement:</strong> {kpi.measurement}
                  </div>
                )}
                {kpi.target && (
                  <div style={{ fontSize: 12, color: C.textSecond, marginTop: 2 }}>
                    <strong style={{ fontWeight: 600 }}>Target:</strong> {kpi.target}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <StatusPill status={kpi.status} />
                {kpi.is_late && (
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontWeight: 500 }}>
                    🕐 Late
                  </span>
                )}
              </div>
            </div>

            <SelfEvalSection kpi={kpi} cycle={cycle} />

            <div style={{ marginTop: 10, marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textSecond,
                textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                Manager Rating
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                {ratingOptions.map(opt => {
                  const isSel = Number(selected) === Number(opt.value);
                  const targets: any[] = Array.isArray(kpi.rating_targets) ? kpi.rating_targets : [];
                  const targetEntry = targets.find((t: any) => Number(t.value) === Number(opt.value));
                  const targetDesc = targetEntry?.target || '';
                  return (
                    <button
                      key={opt.value}
                      disabled={isLocked}
                      onClick={() => setRatings(p => ({ ...p, [kpi.id]: opt.value }))}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: 4,
                        padding: '10px 8px',
                        borderRadius: 8,
                        border: `0.5px solid ${isSel ? C.text : C.border}`,
                        background: isSel ? C.text : C.bg,
                        color:      isSel ? '#fff'  : C.text,
                        cursor:     isLocked ? 'not-allowed' : 'pointer',
                        opacity:    isLocked ? 0.6 : 1,
                        fontFamily: C.font,
                        textAlign:  'center',
                      }}>
                      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>{opt.value}</div>
                      {opt.label && (
                        <div style={{ fontSize: 12, fontWeight: 500,
                          color: isSel ? '#fff' : C.text }}>
                          {opt.label}
                        </div>
                      )}
                      {targetDesc && (
                        <div style={{ fontSize: 13, fontStyle: 'italic', lineHeight: 1.3,
                          color: isSel ? '#d4d4d4' : C.textSecond, whiteSpace: 'pre-wrap' }}>
                          {targetDesc}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {selected != null && (
                <div style={{ marginTop: 8, fontSize: 12, color: C.textSecond }}>
                  Selected: <strong style={{ color: C.text }}>
                    {selected} — {ratingLabelFor(selected, cycle)}
                  </strong>
                  {ratingDescriptionFor(selected, ratingLevels) && (
                    <span style={{ marginLeft: 6 }}>
                      · {ratingDescriptionFor(selected, ratingLevels)}
                    </span>
                  )}
                </div>
              )}
            </div>

            <textarea
              placeholder="Manager remarks (optional)..."
              value={remarks[kpi.id] || ''}
              disabled={isLocked}
              onChange={e => setRemarks(p => ({ ...p, [kpi.id]: e.target.value }))}
              style={{ ...S.input, width: '100%', minHeight: 60, resize: 'vertical',
                marginBottom: 10, boxSizing: 'border-box',
                opacity: isLocked ? 0.6 : 1 }}
            />

            {selected != null && (
              <div style={{ fontSize: 12, color: C.textInfo, background: C.bgInfo,
                border: `0.5px solid #bae6fd`, padding: '8px 10px', borderRadius: 6 }}>
                This KPI contributes {kpi.weight}% × {selected}/{maxRating} =
                <strong style={{ marginLeft: 4 }}>{weighted.toFixed(2)} weighted points</strong>
              </div>
            )}
          </div>
        );
      })}

      {/* Summary table */}
      {kpis.length > 0 && (
        <div style={{ marginTop: 16, border: `0.5px solid ${C.borderLight}`,
          borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: C.bgSecondary,
            fontSize: 12, fontWeight: 600, color: C.textSecond,
            textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Weighted Score Summary
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bg }}>
                <th style={S.th}>KPI</th>
                <th style={{ ...S.th, width: 90 }}>Weight</th>
                <th style={{ ...S.th, width: 130 }}>Manager Rating</th>
                <th style={{ ...S.th, width: 130, textAlign: 'right' }}>Weighted Score</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((kpi: any) => {
                const r = ratings[kpi.id];
                const w = (r != null && maxRating)
                  ? (Number(kpi.weight) * Number(r)) / Number(maxRating)
                  : null;
                return (
                  <tr key={kpi.id} style={{ borderTop: `0.5px solid ${C.borderLight}` }}>
                    <td style={S.td}>{kpi.name}</td>
                    <td style={S.td}>{kpi.weight}%</td>
                    <td style={S.td}>
                      {r != null ? `${r} / ${maxRating}` : <span style={{ color: C.textTertiary }}>—</span>}
                    </td>
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      {w != null ? w.toFixed(2) : <span style={{ color: C.textTertiary }}>—</span>}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ borderTop: `1px solid ${C.border}`, background: C.bgSecondary }}>
                <td style={{ ...S.td, fontWeight: 600 }}>Total</td>
                <td style={{ ...S.td, fontWeight: 600 }}>
                  {kpis.reduce((s, k) => s + Number(k.weight || 0), 0)}%
                </td>
                <td style={S.td}></td>
                <td style={{ ...S.td, textAlign: 'right', fontWeight: 600 }}>
                  {totalWeighted.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {kpis.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '14px 16px',
          background: C.bgSecondary, border: `0.5px solid ${C.borderLight}`,
          borderRadius: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 2 }}>Overall Score</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: C.text }}>
              {totalWeighted.toFixed(2)} <span style={{ fontSize: 14, color: C.textSecond, fontWeight: 400 }}>/ 100</span>
            </div>
          </div>
          <button
            disabled={!allRated || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
            style={{ ...S.btnPrimary,
              padding: '10px 20px', fontSize: 13,
              opacity: !allRated || submitMutation.isPending ? 0.5 : 1,
              cursor: !allRated || submitMutation.isPending ? 'not-allowed' : 'pointer' }}>
            {submitMutation.isPending ? 'Submitting…' : 'Submit All Ratings'}
          </button>
        </div>
      )}
      {!allRated && kpis.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: C.textDanger, textAlign: 'right' }}>
          Rate every KPI before submitting.
        </div>
      )}
    </div>
  );
}

export default function ManagerEvalPage() {
  const { user } = useAuthStore();
  const isHrAdmin = useAuthStore(s => s.isHrAdmin());
  const [cycleId, setCycleId]                 = useState('');
  const [expandOverrides, setExpandOverrides] = useState<Record<string, boolean>>({});

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'],
    queryFn:  () => cyclesApi.list().then(r => r.data),
  });

  const sortedCycles = useMemo(
    () => [...(cycles as any[])].sort((a, b) => (b.year || 0) - (a.year || 0)),
    [cycles]
  );

  if (sortedCycles.length && !cycleId) setCycleId(sortedCycles[0].id);
  const currentCycle = sortedCycles.find((c: any) => c.id === cycleId) ?? null;

  const { data: reports = [] } = useQuery({
    queryKey: ['direct-reports'],
    queryFn:  () => usersApi.directReports().then(r => r.data),
  });

  const myReports = reports as any[];

  const reportKpiQueries = useQueries({
    queries: myReports.map((r: any) => ({
      queryKey: ['eval-kpis', cycleId, r.id],
      queryFn:  () => kpisApi.list(cycleId, r.id).then(res => res.data),
      enabled:  !!cycleId && !!r.id,
      staleTime: 0,
    })),
  });

  const kpisByEmployeeId = useMemo(() => {
    const map: Record<string, any[]> = {};
    myReports.forEach((report, i) => {
      map[report.id] = reportKpiQueries[i]?.data || [];
    });
    return map;
  }, [myReports, reportKpiQueries]);

  const loadingByEmployeeId = useMemo(() => {
    const map: Record<string, boolean> = {};
    myReports.forEach((report, i) => {
      map[report.id] = !!reportKpiQueries[i]?.isLoading;
    });
    return map;
  }, [myReports, reportKpiQueries]);

  const reportData = myReports.map((report: any) => {
    const kpis = kpisByEmployeeId[report.id] ?? [];
    const stage = computeStage(kpis);
    return { report, kpis, stage, isLoading: loadingByEmployeeId[report.id] };
  });

  const summary = reportData.reduce(
    (acc, r) => {
      if (r.stage === 'SELF_SUBMITTED')   acc.ready += 1;
      if (r.stage === 'EVAL_IN_PROGRESS') acc.inProgress += 1;
      if (r.stage === 'EVAL_COMPLETE')    acc.complete += 1;
      if (r.stage === 'NOT_STARTED')      acc.notStarted += 1;
      return acc;
    },
    { ready: 0, inProgress: 0, complete: 0, notStarted: 0 },
  );

  const isOpen = (id: string, stage: EvalStage) =>
    expandOverrides[id] !== undefined
      ? expandOverrides[id]
      : (stage === 'SELF_SUBMITTED' || stage === 'EVAL_IN_PROGRESS');

  const toggle = (id: string, stage: EvalStage) =>
    setExpandOverrides(prev => ({ ...prev, [id]: !isOpen(id, stage) }));

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Team Evaluation</h1>
          <p style={{ fontSize: 13, color: C.textSecond }}>
            Review KPIs for your direct reports, reviewees, and HOD approvals
          </p>
        </div>
        <select style={S.select} value={cycleId}
          onChange={e => { setCycleId(e.target.value); setExpandOverrides({}); }}>
          {(cycles as any[]).map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {cycleId && <PhaseStatusBanner cycleId={cycleId} phase="mgr_eval" isHrAdmin={isHrAdmin} />}

      {cycleId && myReports.length === 0 && (
        <div style={{ textAlign: 'center', padding: 32, color: C.textSecond, fontSize: 13, border: `0.5px dashed ${C.border}`, borderRadius: 10 }}>
          No employees assigned to you as Direct Manager, Reviewing Manager, or HOD.
        </div>
      )}

      {cycleId && myReports.length > 0 && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: C.bgSecondary, border: `0.5px solid ${C.borderLight}`, borderRadius: 8, fontSize: 13, color: C.textSecond }}>
          <strong style={{ color: C.text, fontWeight: 600 }}>{summary.ready}</strong> ready
          <span style={{ margin: '0 8px', color: C.textTertiary }}>·</span>
          <strong style={{ color: C.text, fontWeight: 600 }}>{summary.inProgress}</strong> in progress
          <span style={{ margin: '0 8px', color: C.textTertiary }}>·</span>
          <strong style={{ color: C.text, fontWeight: 600 }}>{summary.complete}</strong> complete
          <span style={{ margin: '0 8px', color: C.textTertiary }}>·</span>
          <strong style={{ color: C.text, fontWeight: 600 }}>{summary.notStarted}</strong> not started
        </div>
      )}

      {cycleId && reportData.map(({ report, stage, kpis, isLoading }) => {
        const expanded = isOpen(report.id, stage);
        const badge    = STAGE_STYLE[stage];

        return (
          <div key={report.id} style={{ background: C.bg, border: `1px solid ${expanded ? C.border : C.borderLight}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
            <button
              onClick={() => toggle(report.id, stage)}
              style={{ width: '100%', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: C.font, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, color: C.text }}>{report.full_name}</div>
                  {report.position_title && (
                    <div style={{ fontSize: 12, color: C.textSecond, marginTop: 1 }}>{report.position_title}</div>
                  )}
                </div>
                <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 10, background: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>
                  {badge.label}
                </span>
                <span style={{ fontSize: 11, color: C.textTertiary, marginLeft: 4 }}>
                  {kpis.length} KPI{kpis.length === 1 ? '' : 's'}
                </span>
              </div>
              <span style={{ fontSize: 14, color: C.textTertiary, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                ▾
              </span>
            </button>

            {expanded && (
              <>
                {isLoading && (
                  <div style={{ padding: 16, color: C.textSecond, fontSize: 13 }}>Loading…</div>
                )}
                {!isLoading && (
                  <EmployeeScorecard
                    report={report}
                    kpis={kpis as any[]}
                    stage={stage}
                    cycle={currentCycle}
                    user={user}
                    isHrAdmin={isHrAdmin}
                    onSubmitted={() => setExpandOverrides(prev => ({ ...prev, [report.id]: true }))}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

const S: Record<string, any> = {
  card:      { background: C.bg, border: `0.5px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12 },
  select:    { padding: '7px 12px', border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, cursor: 'pointer', fontFamily: C.font, color: C.text },
  input:     { padding: '7px 10px', border: `0.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none' },
  note:      { fontSize: 12, padding: '8px 10px', background: C.bgSecondary, borderRadius: 6, color: C.textSecond, marginBottom: 10 },
  btnPrimary:{ padding: '6px 14px', border: 'none', borderRadius: 8, background: C.text, color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: C.font },
  btnDanger: { padding: '6px 14px', border: '0.5px solid #fca5a5', borderRadius: 8, background: 'transparent', color: '#991b1b', fontSize: 12, cursor: 'pointer', fontFamily: C.font },
  roleBadge: (color: string) => ({ fontSize: 11, padding: '3px 10px', borderRadius: 10, background: color + '18', color, fontWeight: 500 }),
  th:        { textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: C.textSecond, textTransform: 'uppercase', letterSpacing: '0.04em' },
  td:        { padding: '8px 12px', fontSize: 13, color: C.text, verticalAlign: 'top' },
};
