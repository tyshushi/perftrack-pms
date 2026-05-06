import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  DRAFT:       'Draft',
  PENDING_DM:  'Pending Direct Manager',
  PENDING_RM:  'Pending Reviewing Manager',
  PENDING_HOD: 'Pending HOD',
  APPROVED:    'Approved',
  REJECTED:    'Rejected',
  LOCKED:      'Locked',
};

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  DRAFT:       { bg: '#f5f5f3', color: '#555' },
  PENDING_DM:  { bg: '#fef9c3', color: '#854d0e' },
  PENDING_RM:  { bg: '#ffedd5', color: '#9a3412' },
  PENDING_HOD: { bg: '#fce7f3', color: '#9d174d' },
  APPROVED:    { bg: '#dcfce7', color: '#166534' },
  REJECTED:    { bg: '#fee2e2', color: '#991b1b' },
  LOCKED:      { bg: '#e0f2fe', color: '#0c4a6e' },
};

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

export default function ManagerEvalPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [cycleId, setCycleId]           = useState('');
  const [selectedReport, setReport]     = useState<any>(null);
  const [scores, setScores]             = useState<Record<string, number>>({});
  const [comments, setComments]         = useState<Record<string, string>>({});
  const [tab, setTab]                   = useState<'pending' | 'done'>('pending');

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'],
    queryFn:  () => cyclesApi.list().then(r => r.data),
    onSuccess: (d: any[]) => { if (d.length && !cycleId) setCycleId(d[0].id); },
  });

  const { data: reports = [] } = useQuery({
    queryKey: ['direct-reports'],
    queryFn:  () => usersApi.directReports().then(r => r.data),
  });

  const { data: kpis = [] } = useQuery({
    queryKey: ['kpis', cycleId, selectedReport?.id],
    queryFn:  () => kpisApi.list(cycleId, selectedReport?.id).then(r => r.data),
    enabled:  !!cycleId && !!selectedReport,
  });

  // Determine which statuses this user can act on for the selected report
  function myPendingStatuses(report: any): string[] {
    if (!user || !report) return [];
    const uid = user.id;
    const statuses: string[] = [];
    if (report.direct_manager_id    === uid) statuses.push('PENDING_DM');
    if (report.reviewing_manager_id === uid) statuses.push('PENDING_RM');
    if (report.hod_id               === uid) statuses.push('PENDING_HOD');
    // HR Admin can act on all
    if (['HR_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      statuses.push('PENDING_DM', 'PENDING_RM', 'PENDING_HOD');
    }
    return [...new Set(statuses)];
  }

  const pendingStatuses = myPendingStatuses(selectedReport);
  const pendingKpis = (kpis as any[]).filter(k => pendingStatuses.includes(k.status));
  const doneKpis    = (kpis as any[]).filter(k => !pendingStatuses.includes(k.status) && k.status !== 'DRAFT');
  const displayKpis = tab === 'pending' ? pendingKpis : doneKpis;

  const evalMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      kpisApi.evaluate(id, scores[id], comments[id] || '', action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kpis'] }),
  });

  // Score field label based on KPI status
  function scoreSectionLabel(status: string): string {
    if (status === 'PENDING_DM')  return 'Direct Manager Rating';
    if (status === 'PENDING_RM')  return 'Reviewing Manager Rating';
    if (status === 'PENDING_HOD') return 'HOD Rating';
    return 'Rating';
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500 }}>Team Evaluation</h1>
          <p style={{ fontSize: 13, color: '#888' }}>
            Review KPIs for your direct reports, reviewees, and HOD approvals
          </p>
        </div>
        <select style={S.select} value={cycleId} onChange={e => setCycleId(e.target.value)}>
          {(cycles as any[]).map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Report selector */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
          Select employee ({(reports as any[]).length} in your chain)
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(reports as any[]).length === 0 && (
            <span style={{ color: '#888', fontSize: 13 }}>
              No employees assigned to you as Direct Manager, Reviewing Manager, or HOD.
            </span>
          )}
          {(reports as any[]).map((r: any) => {
            const isSelected = selectedReport?.id === r.id;
            return (
              <button key={r.id} onClick={() => { setReport(r); setTab('pending'); }}
                style={{ padding: '7px 14px', borderRadius: 8,
                  border: `0.5px solid ${isSelected ? '#1a1a18' : '#d0d0cc'}`,
                  background: isSelected ? '#1a1a18' : '#fff',
                  color: isSelected ? '#fff' : '#444',
                  fontSize: 13, cursor: 'pointer' }}>
                <div>{r.full_name}</div>
                <div style={{ fontSize: 10, opacity: 0.7, marginTop: 1 }}>
                  {r.employee_id}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedReport && (
        <>
          {/* My role for this employee */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {selectedReport.direct_manager_id    === user?.id && <span style={S.roleBadge('#0369a1')}>Direct Manager</span>}
            {selectedReport.reviewing_manager_id === user?.id && <span style={S.roleBadge('#6d28d9')}>Reviewing Manager</span>}
            {selectedReport.hod_id               === user?.id && <span style={S.roleBadge('#92400e')}>HOD</span>}
            {['HR_ADMIN','SUPER_ADMIN'].includes(user?.role || '') && <span style={S.roleBadge('#166534')}>HR Admin (full access)</span>}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, borderBottom: '0.5px solid #e5e4df', marginBottom: 16 }}>
            {(['pending', 'done'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: '8px 16px', border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: 13,
                  color: tab === t ? '#1a1a18' : '#888',
                  fontWeight: tab === t ? 500 : 400,
                  borderBottom: tab === t ? '2px solid #1a1a18' : '2px solid transparent',
                  marginBottom: -0.5 }}>
                {t === 'pending'
                  ? `Pending Review (${pendingKpis.length})`
                  : `Reviewed (${doneKpis.length})`}
              </button>
            ))}
          </div>

          {displayKpis.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#888', fontSize: 13 }}>
              {tab === 'pending'
                ? 'No KPIs pending your review for this employee.'
                : 'No reviewed KPIs yet.'}
            </div>
          )}

          {displayKpis.map((kpi: any) => (
            <div key={kpi.id} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{kpi.name}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                    Target: {kpi.target} · Weight: {kpi.weight}% · Self: {kpi.self_score ?? '—'}/5
                  </div>
                </div>
                <StatusPill status={kpi.status} />
              </div>

              {kpi.self_comment && (
                <div style={S.note}><strong>Self comment:</strong> {kpi.self_comment}</div>
              )}
              {kpi.mgr_comment && (
                <div style={S.note}><strong>Direct manager:</strong> {kpi.mgr_score}/5 — {kpi.mgr_comment}</div>
              )}
              {kpi.mgr2_comment && (
                <div style={S.note}><strong>Reviewing manager:</strong> {kpi.mgr2_score}/5 — {kpi.mgr2_comment}</div>
              )}

              {tab === 'pending' && (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#666', marginBottom: 6 }}>
                      {scoreSectionLabel(kpi.status)}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {RATINGS.map(n => (
                        <button key={n} onClick={() => setScores(p => ({ ...p, [kpi.id]: n }))}
                          style={{ width: 34, height: 34, borderRadius: '50%',
                            border: `0.5px solid ${scores[kpi.id] === n ? '#1a1a18' : '#d0d0cc'}`,
                            background: scores[kpi.id] === n ? '#1a1a18' : 'transparent',
                            color: scores[kpi.id] === n ? '#fff' : '#444',
                            fontSize: 12, cursor: 'pointer' }}>
                          {n}
                        </button>
                      ))}
                      {scores[kpi.id] && (
                        <span style={{ fontSize: 11, color: '#888' }}>
                          {R_LABELS[scores[kpi.id]]}
                        </span>
                      )}
                    </div>
                  </div>

                  <textarea
                    placeholder="Provide your assessment and feedback..."
                    value={comments[kpi.id] || ''}
                    onChange={e => setComments(p => ({ ...p, [kpi.id]: e.target.value }))}
                    style={{ ...S.input, width: '100%', minHeight: 70, resize: 'vertical', marginBottom: 10 }}
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
                  {kpi.hod_score && ` · HOD score: ${kpi.hod_score}/5`}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

const S: Record<string, any> = {
  card:      { background: '#fff', border: '0.5px solid #e5e4df', borderRadius: 10, padding: 16, marginBottom: 12 },
  select:    { padding: '7px 12px', border: '0.5px solid #d0d0cc', borderRadius: 8, fontSize: 13, background: '#fff', cursor: 'pointer' },
  input:     { padding: '7px 10px', border: '0.5px solid #d0d0cc', borderRadius: 8, fontSize: 13, background: '#fff', color: '#1a1a18', fontFamily: 'inherit', outline: 'none' },
  note:      { fontSize: 12, padding: '8px 10px', background: '#f9f9f7', borderRadius: 6, color: '#555', marginBottom: 10 },
  btnPrimary:{ padding: '6px 14px', border: 'none', borderRadius: 8, background: '#1a1a18', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  btnDanger: { padding: '6px 14px', border: '0.5px solid #fca5a5', borderRadius: 8, background: 'transparent', color: '#991b1b', fontSize: 12, cursor: 'pointer' },
  roleBadge: (color: string) => ({ fontSize: 11, padding: '3px 10px', borderRadius: 10, background: color + '18', color, fontWeight: 500 }),
};
