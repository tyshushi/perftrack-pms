import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth';
import { kpisApi, cyclesApi, usersApi } from '../api/client';

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
  onDone,
}: {
  employee:      any;
  cycleId:       string;
  cycle:         any;
  currentUserId: string;
  onDone:        () => void;
}) {
  const qc = useQueryClient();
  const [showReject, setShowReject] = useState(false);
  const [comment,    setComment]    = useState('');

  const { data: kpis = [], isLoading } = useQuery({
    queryKey: ['kpis', cycleId, employee.id],
    queryFn:  () => kpisApi.list(cycleId, employee.id).then(r => r.data),
    enabled:  !!cycleId && !!employee,
  });

  const pendingKpis = (kpis as any[]).filter(k => k.status === 'PENDING_DM');

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
    kpis: pendingKpis.filter((k: any) => k.kpi_dimension === cat),
  })).filter(g => g.kpis.length > 0);

  if (isLoading) {
    return (
      <div style={{ padding: 16, color: C.textSecond, fontSize: 13 }}>Loading…</div>
    );
  }

  if (pendingKpis.length === 0) {
    return (
      <div style={{ padding: '12px 0', color: C.textTertiary, fontSize: 13, fontStyle: 'italic' }}>
        No KPIs pending your approval
      </div>
    );
  }

  return (
    <div>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 500, fontSize: 13, color: C.text }}>{kpi.name}</span>
                    {kpi.kpi_type === 'FIXED' && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 6, background: '#e0f2fe', color: '#0369a1', fontWeight: 500 }}>
                        Cascaded
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
          Total weight: <strong style={{ color: C.text }}>{pendingKpis.reduce((s: number, k: any) => s + k.weight, 0)}%</strong>
        </span>
      </div>

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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {!showReject ? (
          <>
            <button
              onClick={() => reviewMutation.mutate({ action: 'approve', comment: '' })}
              disabled={reviewMutation.isPending}
              style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: C.text, color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}>
              {reviewMutation.isPending ? 'Approving…' : 'Approve Scorecard'}
            </button>
            <button
              onClick={() => setShowReject(true)}
              disabled={reviewMutation.isPending}
              style={{ padding: '6px 14px', border: `1px solid #fca5a5`, borderRadius: 8, background: C.bg, color: '#991b1b', fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>
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
    </div>
  );
}

export default function ManagerApprovalPage() {
  const { user } = useAuthStore();
  const [cycleId,   setCycleId]   = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const myReports = (reports as any[]).filter((r: any) => r.direct_manager_id === user?.id);

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: C.text }}>
          Approve Scorecards
        </h1>
        <p style={{ fontSize: 13, color: C.textSecond }}>
          Review and approve scorecards submitted by your direct reports
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
          onChange={e => { setCycleId(e.target.value); setExpandedId(null); }}
          style={{ width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 15, fontWeight: 600, background: C.bg, color: cycleId ? C.text : C.textTertiary, fontFamily: C.font, outline: 'none', cursor: 'pointer' }}>
          <option value="">Select a performance cycle to begin…</option>
          {sortedCycles.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {cycleId && (
        <div>
          {myReports.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: C.textSecond, fontSize: 13, border: `0.5px dashed ${C.border}`, borderRadius: 10 }}>
              No direct reports assigned to you
            </div>
          )}

          {myReports.map((report: any) => {
            const isExpanded = expandedId === report.id;
            return (
              <div key={report.id} style={{ background: C.bg, border: `1px solid ${isExpanded ? C.border : C.borderLight}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
                {/* Employee header row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : report.id)}
                  style={{ width: '100%', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: C.font, textAlign: 'left' }}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14, color: C.text }}>{report.full_name}</div>
                    {report.position_title && (
                      <div style={{ fontSize: 12, color: C.textSecond, marginTop: 1 }}>{report.position_title}</div>
                    )}
                  </div>
                  <span style={{ fontSize: 14, color: C.textTertiary, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                    ▾
                  </span>
                </button>

                {/* Expanded scorecard */}
                {isExpanded && (
                  <div style={{ padding: '0 16px 16px' }}>
                    <EmployeeScorecard
                      employee={report}
                      cycleId={cycleId}
                      cycle={currentCycle}
                      currentUserId={user?.id ?? ''}
                      onDone={() => setExpandedId(null)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
