import { useState, useMemo } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { kpisApi, usersApi, cyclesApi } from '../api/client';
import { useAuthStore } from '../store/auth';

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
};

type EvalStage = 'NOT_STARTED' | 'SELF_SUBMITTED' | 'IN_PROGRESS' | 'COMPLETE';

const STAGE_STYLE: Record<EvalStage, { bg: string; color: string; label: string }> = {
  NOT_STARTED:    { bg: '#efefec', color: '#6b6b6b', label: 'Not Started' },
  SELF_SUBMITTED: { bg: '#e0f2fe', color: '#0369a1', label: 'Self Eval Submitted' },
  IN_PROGRESS:    { bg: '#fef9c3', color: '#854d0e', label: 'Evaluation In Progress' },
  COMPLETE:       { bg: '#dcfce7', color: '#166534', label: 'Evaluation Complete' },
};

function computeStage(kpis: any[]): EvalStage {
  if (!kpis || kpis.length === 0) return 'NOT_STARTED';
  const scored        = kpis.filter(k => k.mgr_score !== null && k.mgr_score !== undefined);
  const allMgrScored  = scored.length === kpis.length;
  const anyMgrScored  = scored.length > 0;
  const anySelfEval   = kpis.some(k => k.status === 'SELF_EVALUATED');
  const allLocked     = kpis.every(k => k.status === 'LOCKED');
  if (allMgrScored)               return 'COMPLETE';
  if (anyMgrScored)               return 'IN_PROGRESS';
  if (anySelfEval)                return 'SELF_SUBMITTED';
  if (allLocked || kpis.length === 0) return 'NOT_STARTED';
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

const RATINGS  = [1, 2, 3, 4, 5];
const R_LABELS = ['', 'Unsatisfactory', 'Needs Improvement',
                  'Meets Expectations', 'Exceeds Expectations', 'Outstanding'];

function ratingLabelFor(value: any, cycle: any): string {
  const levels: any[] = Array.isArray(cycle?.rating_levels) ? cycle.rating_levels : [];
  const ratingType = cycle?.rating_type || 'NUMERIC';
  if (ratingType === 'NUMERIC') {
    const lv = levels.find(l => Number(l.value) === Number(value));
    return lv?.label || (R_LABELS[Number(value)] || '');
  }
  const lv = levels.find(l => l.value === value);
  return lv?.label || (typeof value === 'string' ? value : '');
}

function SelfEvalSection({ kpi, cycle }: { kpi: any; cycle: any }) {
  const hasAnything = kpi.actual_achievement || kpi.self_rating !== null && kpi.self_rating !== undefined || kpi.self_remarks;
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

export default function ManagerEvalPage() {
  const { user } = useAuthStore();
  const isHrAdmin = useAuthStore(s => s.isHrAdmin());
  const qc = useQueryClient();
  const [cycleId, setCycleId]               = useState('');
  const [scores, setScores]                 = useState<Record<string, number>>({});
  const [comments, setComments]             = useState<Record<string, string>>({});
  const [tabs, setTabs]                     = useState<Record<string, 'pending' | 'done'>>({});
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
      queryKey: ['kpis', cycleId, r.id],
      queryFn:  () => kpisApi.list(cycleId, r.id).then(res => res.data),
      enabled:  !!cycleId && !!r.id,
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
      if (r.stage === 'SELF_SUBMITTED') acc.ready += 1;
      if (r.stage === 'COMPLETE')       acc.complete += 1;
      if (r.stage === 'NOT_STARTED')    acc.notStarted += 1;
      return acc;
    },
    { ready: 0, complete: 0, notStarted: 0 },
  );

  function myPendingStatuses(report: any): string[] {
    if (!user || !report) return [];
    const uid = user.id;
    const statuses: string[] = [];
    if (report.direct_manager_id    === uid) statuses.push('PENDING_DM');
    if (report.reviewing_manager_id === uid) statuses.push('PENDING_RM');
    if (report.hod_id               === uid) statuses.push('PENDING_HOD');
    if (isHrAdmin) {
      statuses.push('PENDING_DM', 'PENDING_RM', 'PENDING_HOD');
    }
    return [...new Set(statuses)];
  }

  const evalMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      kpisApi.evaluate(id, scores[id], comments[id] || '', action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kpis'] }),
  });

  function scoreSectionLabel(status: string): string {
    if (status === 'PENDING_DM')  return 'Direct Manager Rating';
    if (status === 'PENDING_RM')  return 'Reviewing Manager Rating';
    if (status === 'PENDING_HOD') return 'HOD Rating';
    return 'Rating';
  }

  const isOpen = (id: string, stage: EvalStage) =>
    expandOverrides[id] !== undefined ? expandOverrides[id] : stage === 'SELF_SUBMITTED';

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

      {cycleId && myReports.length === 0 && (
        <div style={{ textAlign: 'center', padding: 32, color: C.textSecond, fontSize: 13, border: `0.5px dashed ${C.border}`, borderRadius: 10 }}>
          No employees assigned to you as Direct Manager, Reviewing Manager, or HOD.
        </div>
      )}

      {cycleId && myReports.length > 0 && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: C.bgSecondary, border: `0.5px solid ${C.borderLight}`, borderRadius: 8, fontSize: 13, color: C.textSecond }}>
          <strong style={{ color: C.text, fontWeight: 600 }}>{summary.ready}</strong> ready for evaluation
          <span style={{ margin: '0 8px', color: C.textTertiary }}>·</span>
          <strong style={{ color: C.text, fontWeight: 600 }}>{summary.complete}</strong> complete
          <span style={{ margin: '0 8px', color: C.textTertiary }}>·</span>
          <strong style={{ color: C.text, fontWeight: 600 }}>{summary.notStarted}</strong> not started
        </div>
      )}

      {cycleId && reportData.map(({ report, stage, kpis, isLoading }) => {
        const expanded = isOpen(report.id, stage);
        const badge    = STAGE_STYLE[stage];
        const tab      = tabs[report.id] || 'pending';
        const pendingStatuses = myPendingStatuses(report);
        const pendingKpis = (kpis as any[]).filter(k => pendingStatuses.includes(k.status));
        const doneKpis    = (kpis as any[]).filter(k => !pendingStatuses.includes(k.status) && k.status !== 'DRAFT');
        const displayKpis = tab === 'pending' ? pendingKpis : doneKpis;

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
              <div style={{ padding: '0 16px 16px' }}>
                {isLoading && (
                  <div style={{ padding: 16, color: C.textSecond, fontSize: 13 }}>Loading…</div>
                )}

                {!isLoading && (
                  <>
                    {/* Role badges */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                      {report.direct_manager_id    === user?.id && <span style={S.roleBadge('#0369a1')}>Direct Manager</span>}
                      {report.reviewing_manager_id === user?.id && <span style={S.roleBadge('#6d28d9')}>Reviewing Manager</span>}
                      {report.hod_id               === user?.id && <span style={S.roleBadge('#92400e')}>HOD</span>}
                      {isHrAdmin && <span style={S.roleBadge('#166534')}>HR Admin (full access)</span>}
                    </div>

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 2, borderBottom: `0.5px solid ${C.borderLight}`, marginBottom: 16 }}>
                      {(['pending', 'done'] as const).map(t => (
                        <button key={t} onClick={() => setTabs(p => ({ ...p, [report.id]: t }))}
                          style={{ padding: '8px 16px', border: 'none', background: 'transparent',
                            cursor: 'pointer', fontSize: 13,
                            color: tab === t ? C.text : C.textSecond,
                            fontWeight: tab === t ? 500 : 400,
                            borderBottom: tab === t ? `2px solid ${C.text}` : '2px solid transparent',
                            marginBottom: -0.5, fontFamily: C.font }}>
                          {t === 'pending'
                            ? `Pending Review (${pendingKpis.length})`
                            : `Reviewed (${doneKpis.length})`}
                        </button>
                      ))}
                    </div>

                    {displayKpis.length === 0 && (
                      <div style={{ textAlign: 'center', padding: 32, color: C.textSecond, fontSize: 13 }}>
                        {tab === 'pending'
                          ? 'No KPIs pending your review for this employee.'
                          : 'No reviewed KPIs yet.'}
                      </div>
                    )}

                    {displayKpis.map((kpi: any) => (
                      <div key={kpi.id} style={S.card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                          <div>
                            <div style={{ fontWeight: 500, color: C.text }}>{kpi.name}</div>
                            <div style={{ fontSize: 12, color: C.textSecond, marginTop: 2 }}>
                              Target: {kpi.target || '—'} · Weight: {kpi.weight}%
                            </div>
                          </div>
                          <StatusPill status={kpi.status} />
                        </div>

                        <SelfEvalSection kpi={kpi} cycle={currentCycle} />

                        {kpi.self_comment && (
                          <div style={S.note}><strong>Self comment:</strong> {kpi.self_comment}</div>
                        )}
                        {kpi.mgr_comment && (
                          <div style={S.note}><strong>Direct manager:</strong> {kpi.mgr_score ?? '—'}/5 — {kpi.mgr_comment}</div>
                        )}
                        {kpi.mgr2_comment && (
                          <div style={S.note}><strong>Reviewing manager:</strong> {kpi.mgr2_score ?? '—'}/5 — {kpi.mgr2_comment}</div>
                        )}

                        {tab === 'pending' && (
                          <>
                            <div style={{ marginBottom: 10 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: C.textSecond, marginBottom: 6 }}>
                                {scoreSectionLabel(kpi.status)}
                              </div>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                {RATINGS.map(n => (
                                  <button key={n} onClick={() => setScores(p => ({ ...p, [kpi.id]: n }))}
                                    style={{ width: 34, height: 34, borderRadius: '50%',
                                      border: `0.5px solid ${scores[kpi.id] === n ? C.text : C.border}`,
                                      background: scores[kpi.id] === n ? C.text : 'transparent',
                                      color: scores[kpi.id] === n ? '#fff' : C.text,
                                      fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>
                                    {n}
                                  </button>
                                ))}
                                {scores[kpi.id] && (
                                  <span style={{ fontSize: 11, color: C.textSecond }}>
                                    {R_LABELS[scores[kpi.id]]}
                                  </span>
                                )}
                              </div>
                            </div>

                            <textarea
                              placeholder="Provide your assessment and feedback..."
                              value={comments[kpi.id] || ''}
                              onChange={e => setComments(p => ({ ...p, [kpi.id]: e.target.value }))}
                              style={{ ...S.input, width: '100%', minHeight: 70, resize: 'vertical', marginBottom: 10, boxSizing: 'border-box' }}
                            />

                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                disabled={!scores[kpi.id] || evalMutation.isPending}
                                onClick={() => evalMutation.mutate({ id: kpi.id, action: 'approve' })}
                                style={{ ...S.btnPrimary, opacity: !scores[kpi.id] ? 0.5 : 1 }}>
                                Approve &amp; Forward →
                              </button>
                              <button
                                onClick={() => evalMutation.mutate({ id: kpi.id, action: 'reject' })}
                                style={S.btnDanger}>
                                Reject
                              </button>
                            </div>
                          </>
                        )}

                        {tab === 'done' && (
                          <div style={S.note}>
                            Status: {STATUS_LABELS[kpi.status] || kpi.status}
                            {kpi.hod_score != null && ` · HOD score: ${kpi.hod_score}/5`}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
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
};
