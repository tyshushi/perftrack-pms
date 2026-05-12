import { useState, useMemo } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth';
import { kpisApi, cyclesApi, usersApi } from '../api/client';
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

const CATEGORIES = [
  'Financials', 'Customer', 'Internal Process',
  'Learning & Growth', 'Leadership & Culture',
];

const CYCLE_STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  DRAFT:  { bg: '#f7f7f5', color: '#6b6b6b', label: 'Draft' },
  ACTIVE: { bg: '#dcfce7', color: '#166534', label: 'Active' },
  CLOSED: { bg: '#fee2e2', color: '#991b1b', label: 'Closed' },
};

type ReportStatus =
  | 'NOT_STARTED'
  | 'DRAFT'
  | 'PENDING_YOURS'
  | 'PENDING_RM'
  | 'PENDING_HOD'
  | 'LOCKED'
  | 'REJECTED'
  | 'SELF_EVAL';

const REPORT_STATUS_STYLE: Record<ReportStatus, { bg: string; color: string; label: string }> = {
  NOT_STARTED:   { bg: '#efefec', color: '#6b6b6b', label: 'Not Started' },
  DRAFT:         { bg: '#fef9c3', color: '#854d0e', label: 'Draft' },
  PENDING_YOURS: { bg: '#e0f2fe', color: '#0369a1', label: 'Pending Your Approval' },
  PENDING_RM:    { bg: '#f3e8ff', color: '#6b21a8', label: 'Pending RM Approval' },
  PENDING_HOD:   { bg: '#ffedd5', color: '#9a3412', label: 'Pending HOD Approval' },
  LOCKED:        { bg: '#dcfce7', color: '#166534', label: 'Approved & Locked' },
  REJECTED:      { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
  SELF_EVAL:     { bg: '#ccfbf1', color: '#115e59', label: 'Self Evaluation' },
};

function computeReportStatus(kpis: any[], employee: any, currentUserId: string): ReportStatus {
  if (!kpis || kpis.length === 0) return 'NOT_STARTED';
  if (kpis.some(k => k.status === 'REJECTED')) return 'REJECTED';
  if (kpis.some(k => k.status === 'PENDING_DM') && employee.direct_manager_id === currentUserId) return 'PENDING_YOURS';
  if (kpis.some(k => k.status === 'PENDING_RM')) return 'PENDING_RM';
  if (kpis.some(k => k.status === 'PENDING_HOD')) return 'PENDING_HOD';
  if (kpis.length > 0 && kpis.every(k => k.status === 'LOCKED')) return 'LOCKED';
  if (kpis.some(k => k.status === 'DRAFT')) return 'DRAFT';
  return 'DRAFT';
}

function ratingLabelFor(value: any, cycle: any): string {
  const levels: any[] = Array.isArray(cycle?.rating_levels) ? cycle.rating_levels : [];
  const ratingType = cycle?.rating_type || 'NUMERIC';
  if (ratingType === 'NUMERIC') {
    const lv = levels.find(l => Number(l.value) === Number(value));
    return lv?.label || '';
  }
  const lv = levels.find(l => l.value === value);
  return lv?.label || (typeof value === 'string' ? value : '');
}

function KpiTargetsExpandable({ kpi, cycle }: { kpi: any; cycle: any }) {
  const [open, setOpen] = useState(false);
  const targets: any[] = Array.isArray(kpi.rating_targets) ? kpi.rating_targets : [];
  const ratingType = cycle?.rating_type || 'NUMERIC';

  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ padding: '4px 8px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.bg, color: C.textSecond, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>
        {open ? '▾ Hide Rating Targets' : '▸ View Rating Targets'}
        {targets.length === 0 && (
          <span style={{ marginLeft: 6, color: C.textDanger }}>· not set</span>
        )}
      </button>
      {open && (
        <div style={{ marginTop: 6, padding: 10, background: C.bg, border: `0.5px solid ${C.borderLight}`, borderRadius: 8 }}>
          {targets.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textTertiary, fontStyle: 'italic' }}>
              No rating targets defined yet.
            </div>
          ) : ratingType === 'OKR' ? (
            <div style={{ fontSize: 12, color: C.text }}>
              <div style={{ fontSize: 11, color: C.textSecond, marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Measurement
              </div>
              {targets[0]?.target || '—'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.textSecond, fontWeight: 600, width: 80 }}>Rating</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.textSecond, fontWeight: 600, width: 160 }}>Label</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.textSecond, fontWeight: 600 }}>Target Description</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((t: any) => (
                  <tr key={String(t.value)} style={{ borderTop: `0.5px solid ${C.borderLight}` }}>
                    <td style={{ padding: '6px 8px', color: C.text, fontWeight: 600 }}>{t.value}</td>
                    <td style={{ padding: '6px 8px', color: C.text }}>{t.label || ratingLabelFor(t.value, cycle) || '—'}</td>
                    <td style={{ padding: '6px 8px', color: C.textSecond }}>{t.target || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function EmployeeScorecard({
  employee,
  cycleId,
  cycle,
  currentUserId,
  kpis,
  isLoading,
  onDone,
}: {
  employee:      any;
  cycleId:       string;
  cycle:         any;
  currentUserId: string;
  kpis:          any[];
  isLoading:     boolean;
  onDone:        () => void;
}) {
  const qc = useQueryClient();
  const [showReject, setShowReject] = useState(false);
  const [comment,    setComment]    = useState('');

  const PENDING_STATES = ['PENDING_DM', 'PENDING_RM', 'PENDING_HOD'] as const;
  const pendingKpis = kpis.filter(k => (PENDING_STATES as readonly string[]).includes(k.status));

  // Determine which level the current user is approving at, based on
  // the pending status and the matching manager field on the employee.
  const pendingStatus: string | null = pendingKpis.length > 0 ? pendingKpis[0].status : null;
  const stageLabel: string =
    pendingStatus === 'PENDING_DM'  ? 'Awaiting Direct Manager Approval' :
    pendingStatus === 'PENDING_RM'  ? 'Awaiting Reviewing Manager Approval' :
    pendingStatus === 'PENDING_HOD' ? 'Awaiting HOD Approval' : '';

  const isMyApproval = (
    (pendingStatus === 'PENDING_DM'  && employee.direct_manager_id    === currentUserId) ||
    (pendingStatus === 'PENDING_RM'  && employee.reviewing_manager_id === currentUserId) ||
    (pendingStatus === 'PENDING_HOD' && employee.hod_id               === currentUserId)
  );

  const reviewMutation = useMutation({
    mutationFn: ({ action, comment }: { action: string; comment: string }) =>
      kpisApi.reviewScorecard({
        cycle_id:    cycleId,
        employee_id: employee.id,
        action,
        comment,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kpis', cycleId, employee.id] });
      setShowReject(false);
      setComment('');
      onDone();
    },
  });

  const kpisByDimension = CATEGORIES.map(cat => ({
    cat,
    kpis: kpis.filter((k: any) => k.kpi_dimension === cat),
  })).filter(g => g.kpis.length > 0);

  if (isLoading) {
    return (
      <div style={{ padding: 16, color: C.textSecond, fontSize: 13 }}>Loading…</div>
    );
  }

  if (kpis.length === 0) {
    return (
      <div style={{ padding: '12px 0', color: C.textTertiary, fontSize: 13, fontStyle: 'italic' }}>
        No KPIs created yet for this cycle
      </div>
    );
  }

  return (
    <div>
      {stageLabel && (
        <div style={{ marginBottom: 10, padding: '6px 10px', borderRadius: 8, background: C.bgInfo, color: C.textInfo, fontSize: 12, fontWeight: 500, display: 'inline-block' }}>
          {stageLabel}
        </div>
      )}

      {/* KPIs grouped by dimension */}
      {kpisByDimension.map(({ cat, kpis: dimKpis }) => (
        <div key={cat} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.textSecond, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            {cat}
          </div>
          {dimKpis.map((kpi: any) => (
            <div key={kpi.id} style={{ padding: '10px 12px', background: C.bgSecondary, borderRadius: 8, marginBottom: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 500, fontSize: 13, color: C.text }}>{kpi.name}</span>
                    {kpi.kpi_type === 'FIXED' && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: '#e0f2fe', color: '#0369a1', fontWeight: 500 }}>
                        Cascaded
                      </span>
                    )}
                    {kpi.is_late && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', fontWeight: 500 }}>
                        🕐 Late
                      </span>
                    )}
                  </div>
                  {kpi.measurement && (
                    <div style={{ fontSize: 12, color: C.textSecond, marginTop: 2 }}>
                      Measurement: {kpi.measurement}
                    </div>
                  )}
                  {kpi.description && (
                    <div style={{ fontSize: 12, color: C.textTertiary, marginTop: 2 }}>{kpi.description}</div>
                  )}
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text, flexShrink: 0, marginLeft: 12 }}>
                  {kpi.weight}%
                </div>
              </div>
              <KpiTargetsExpandable kpi={kpi} cycle={cycle} />
            </div>
          ))}
        </div>
      ))}

      {/* Weight total */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 12, borderBottom: `0.5px solid ${C.borderLight}`, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: C.textSecond }}>
          Total weight: <strong style={{ color: C.text }}>{kpis.reduce((s: number, k: any) => s + (k.weight || 0), 0)}%</strong>
        </span>
      </div>

      {pendingKpis.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textTertiary, fontStyle: 'italic' }}>
          No action required at this time.
        </div>
      ) : (
        <>
          {/* Reject comment box */}
          {showReject && (
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: C.textSecond, display: 'block', marginBottom: 4 }}>
                Rejection reason (required)
              </label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Explain why the scorecard is being rejected…"
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none', minHeight: 72, resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
          )}

          {/* Action buttons */}
          {!isMyApproval && (
            <div style={{ marginBottom: 10, fontSize: 12, color: C.textTertiary, fontStyle: 'italic' }}>
              You are not the current approver for this scorecard.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!showReject ? (
              <>
                <button
                  onClick={() => reviewMutation.mutate({ action: 'approve', comment: '' })}
                  disabled={reviewMutation.isPending || !isMyApproval}
                  style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: C.text, color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}>
                  {reviewMutation.isPending ? 'Approving…' : 'Approve Scorecard'}
                </button>
                <button
                  onClick={() => setShowReject(true)}
                  disabled={reviewMutation.isPending || !isMyApproval}
                  style={{ padding: '6px 14px', border: `1px solid #fca5a5`, borderRadius: 8, background: C.bg, color: '#991b1b', fontSize: 12, cursor: isMyApproval ? 'pointer' : 'not-allowed', fontFamily: C.font, opacity: isMyApproval ? 1 : 0.5 }}>
                  Reject Scorecard
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => reviewMutation.mutate({ action: 'reject', comment })}
                  disabled={!comment.trim() || reviewMutation.isPending}
                  style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: '#991b1b', color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: !comment.trim() ? 'not-allowed' : 'pointer', fontFamily: C.font, opacity: !comment.trim() ? 0.5 : 1 }}>
                  {reviewMutation.isPending ? 'Rejecting…' : 'Confirm Rejection'}
                </button>
                <button
                  onClick={() => { setShowReject(false); setComment(''); }}
                  style={{ padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.textSecond, fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>
                  Cancel
                </button>
              </>
            )}
          </div>

          {reviewMutation.isError && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b' }}>
              {(reviewMutation.error as any)?.response?.data?.detail || 'Action failed'}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ManagerApprovalPage() {
  const { user } = useAuthStore();
  const isHrAdmin = useAuthStore(s => s.isHrAdmin());
  const currentUserId = user?.id ?? '';
  const [cycleId, setCycleId] = useState('');
  const [expandOverrides, setExpandOverrides] = useState<Record<string, boolean>>({});
  const [indirectSectionExpanded, setIndirectSectionExpanded] = useState(false);
  const [showPendingOnly, setShowPendingOnly] = useState(false);

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

  const { data: reports = [] } = useQuery({
    queryKey: ['direct-reports'],
    queryFn:  () => usersApi.directReports().then(r => r.data),
  });

  const myReports = (reports as any[]);
  const directReports = myReports.filter(r => r.direct_manager_id === currentUserId);
  const indirectReports = myReports.filter(r =>
    r.direct_manager_id !== currentUserId &&
    (r.reviewing_manager_id === currentUserId || r.hod_id === currentUserId)
  );

  // Fetch each direct report's KPIs separately so we can compute per-employee status
  const reportKpiQueries = useQueries({
    queries: myReports.map((r: any) => ({
      queryKey: ['kpis', cycleId, r.id],
      queryFn:  () => kpisApi.list(cycleId, r.id).then(res => res.data),
      enabled:  !!cycleId && !!r.id,
    })),
  });

  // Build an explicit id-keyed map so KPI data can never desync from the
  // employee row it belongs to, regardless of render order.
  const kpisByEmployeeId = useMemo(() => {
    const map: Record<string, any[]> = {};
    (myReports as any[]).forEach((report, i) => {
      map[report.id] = reportKpiQueries[i]?.data || [];
    });
    return map;
  }, [myReports, reportKpiQueries]);

  const loadingByEmployeeId = useMemo(() => {
    const map: Record<string, boolean> = {};
    (myReports as any[]).forEach((report, i) => {
      map[report.id] = !!reportKpiQueries[i]?.isLoading;
    });
    return map;
  }, [myReports, reportKpiQueries]);

  const reportData = myReports.map((report: any) => {
    const kpis = kpisByEmployeeId[report.id] ?? [];
    const status = computeReportStatus(kpis, report, currentUserId);
    if ((import.meta as any).env?.DEV) {
      // eslint-disable-next-line no-console
      console.log('Employee:', report.id, report.full_name, '→ KPIs:', kpisByEmployeeId[report.id]?.length, 'status:', kpisByEmployeeId[report.id]?.[0]?.status);
    }
    return { report, kpis, status, isLoading: loadingByEmployeeId[report.id] };
  });

  const directReportData = reportData.filter(d => d.report.direct_manager_id === currentUserId);
  const indirectReportData = reportData.filter(d =>
    d.report.direct_manager_id !== currentUserId &&
    (d.report.reviewing_manager_id === currentUserId || d.report.hod_id === currentUserId)
  );

  const directSummary = directReportData.reduce(
    (acc, r) => {
      if (r.status === 'PENDING_YOURS') acc.awaiting += 1;
      if (r.status === 'LOCKED')        acc.approved += 1;
      return acc;
    },
    { awaiting: 0, approved: 0 },
  );

  const indirectSummary = indirectReportData.reduce(
    (acc, r) => {
      if (r.status === 'PENDING_YOURS') acc.awaiting += 1;
      if (r.status === 'LOCKED')        acc.approved += 1;
      return acc;
    },
    { awaiting: 0, approved: 0 },
  );

  const filteredDirectReportData = showPendingOnly
    ? directReportData.filter(d => d.status === 'PENDING_YOURS')
    : directReportData;

  const filteredIndirectReportData = showPendingOnly
    ? indirectReportData.filter(d => ['PENDING_YOURS', 'PENDING_RM', 'PENDING_HOD'].includes(d.status))
    : indirectReportData;

  const totalAwaiting = directSummary.awaiting + indirectSummary.awaiting;

  const indirectEffectivelyExpanded =
    indirectSectionExpanded || (showPendingOnly && filteredIndirectReportData.length > 0);

  const isOpen = (id: string, status: ReportStatus) =>
    expandOverrides[id] !== undefined ? expandOverrides[id] : status === 'PENDING_YOURS';

  const toggle = (id: string, status: ReportStatus) =>
    setExpandOverrides(prev => ({ ...prev, [id]: !isOpen(id, status) }));

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: C.text }}>
          Approve Scorecards
        </h1>
        <p style={{ fontSize: 13, color: C.textSecond }}>
          Review and approve scorecards awaiting your action as DM, RM, or HOD
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
          onChange={e => { setCycleId(e.target.value); setExpandOverrides({}); setIndirectSectionExpanded(false); setShowPendingOnly(false); }}
          style={{ width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 15, fontWeight: 600, background: C.bg, color: cycleId ? C.text : C.textTertiary, fontFamily: C.font, outline: 'none', cursor: 'pointer' }}>
          <option value="">Select a performance cycle to begin…</option>
          {sortedCycles.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {cycleId && <PhaseStatusBanner cycleId={cycleId} phase="kpi_setting" isHrAdmin={isHrAdmin} />}

      {cycleId && (
        <div>
          {myReports.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: C.textSecond, fontSize: 13, border: `0.5px dashed ${C.border}`, borderRadius: 10 }}>
              No direct reports assigned to you
            </div>
          )}

          {myReports.length > 0 && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: C.bgSecondary, border: `0.5px solid ${C.borderLight}`, borderRadius: 8, fontSize: 13, color: C.textSecond }}>
              <strong style={{ color: C.text, fontWeight: 600 }}>{directReports.length}</strong> direct
              <span style={{ margin: '0 8px', color: C.textTertiary }}>·</span>
              <strong style={{ color: C.text, fontWeight: 600 }}>{indirectReports.length}</strong> indirect
              <span style={{ margin: '0 8px', color: C.textTertiary }}>·</span>
              <button
                onClick={() => setShowPendingOnly(p => !p)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 12,
                  background: showPendingOnly ? '#1d4ed8' : '#dbeafe',
                  color: showPendingOnly ? '#ffffff' : '#1d4ed8',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: `1px solid ${showPendingOnly ? '#1d4ed8' : '#bfdbfe'}`,
                  fontFamily: C.font,
                  textDecoration: 'underline',
                  transition: 'background 0.1s, color 0.1s',
                }}
                onMouseEnter={e => {
                  if (!showPendingOnly) {
                    e.currentTarget.style.background = '#bfdbfe';
                    e.currentTarget.style.color = '#1e40af';
                  } else {
                    e.currentTarget.style.background = '#1e40af';
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = showPendingOnly ? '#1d4ed8' : '#dbeafe';
                  e.currentTarget.style.color = showPendingOnly ? '#ffffff' : '#1d4ed8';
                }}
              >
                {showPendingOnly
                  ? <>Showing {totalAwaiting} pending — Show All ✕</>
                  : <>⚡ {totalAwaiting} awaiting approval</>
                }
              </button>
            </div>
          )}

          {/* Pending filter banner */}
          {showPendingOnly && (
            <div style={{ marginBottom: 12, padding: '8px 14px', background: C.bgInfo, border: `0.5px solid #bae6fd`, borderRadius: 8, fontSize: 12, color: C.textInfo, fontWeight: 500 }}>
              Filtered: showing pending approvals only
            </div>
          )}

          {/* Direct Reports Section */}
          {filteredDirectReportData.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: C.text, borderBottom: `1px solid ${C.borderLight}`, paddingBottom: 8, marginBottom: 8 }}>
                Direct Reports ({directReports.length})
              </div>
              <div style={{ marginBottom: 12, fontSize: 12, color: C.textSecond }}>
                <strong style={{ color: C.text }}>{directSummary.awaiting}</strong> awaiting approval
                <span style={{ margin: '0 6px', color: C.textTertiary }}>·</span>
                <strong style={{ color: C.text }}>{directSummary.approved}</strong> approved
              </div>
              {filteredDirectReportData.map(({ report, status, isLoading }) => {
                const kpis = kpisByEmployeeId[report.id] ?? [];
                const expanded = isOpen(report.id, status);
                const badge    = REPORT_STATUS_STYLE[status];
                return (
                  <div key={report.id} style={{ background: C.bg, border: `1px solid ${expanded ? C.border : C.borderLight}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                    <button
                      onClick={() => toggle(report.id, status)}
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
                      </div>
                      <span style={{ fontSize: 14, color: C.textTertiary, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                        ▾
                      </span>
                    </button>
                    {expanded && (
                      <div style={{ padding: '0 16px 16px' }}>
                        <EmployeeScorecard
                          employee={report}
                          cycleId={cycleId}
                          cycle={currentCycle}
                          currentUserId={currentUserId}
                          kpis={kpis}
                          isLoading={isLoading}
                          onDone={() => setExpandOverrides(prev => ({ ...prev, [report.id]: false }))}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Indirect Reports Section */}
          {indirectReportData.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div
                onClick={() => setIndirectSectionExpanded(p => !p)}
                style={{ fontWeight: 600, fontSize: 13, color: C.text, borderBottom: `1px solid ${C.borderLight}`, paddingBottom: 8, marginBottom: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Indirect Reports ({indirectReports.length})</span>
                <span style={{ fontSize: 11, color: C.textTertiary, transform: indirectEffectivelyExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
              </div>
              {indirectEffectivelyExpanded && (
                <>
                  <div style={{ marginBottom: 12, fontSize: 12, color: C.textSecond }}>
                    <strong style={{ color: C.text }}>{indirectSummary.awaiting}</strong> awaiting approval
                    <span style={{ margin: '0 6px', color: C.textTertiary }}>·</span>
                    <strong style={{ color: C.text }}>{indirectSummary.approved}</strong> approved
                  </div>
                  {filteredIndirectReportData.map(({ report, status, isLoading }) => {
                    const kpis = kpisByEmployeeId[report.id] ?? [];
                    const expanded = isOpen(report.id, status);
                    const badge    = REPORT_STATUS_STYLE[status];
                    return (
                      <div key={report.id} style={{ background: C.bg, border: `1px solid ${expanded ? C.border : C.borderLight}`, borderLeft: '3px solid #e5e7eb', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                        <button
                          onClick={() => toggle(report.id, status)}
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
                          </div>
                          <span style={{ fontSize: 14, color: C.textTertiary, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                            ▾
                          </span>
                        </button>
                        {expanded && (
                          <div style={{ padding: '0 16px 16px' }}>
                            <EmployeeScorecard
                              employee={report}
                              cycleId={cycleId}
                              cycle={currentCycle}
                              currentUserId={currentUserId}
                              kpis={kpis}
                              isLoading={isLoading}
                              onDone={() => setExpandOverrides(prev => ({ ...prev, [report.id]: false }))}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
