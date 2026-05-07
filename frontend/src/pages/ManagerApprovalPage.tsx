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

const CYCLE_STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  DRAFT:  { bg: '#f7f7f5', color: '#6b6b6b', label: 'Draft' },
  ACTIVE: { bg: '#dcfce7', color: '#166534', label: 'Active' },
  CLOSED: { bg: '#fee2e2', color: '#991b1b', label: 'Closed' },
};

export default function ManagerApprovalPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState('');
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [comment, setComment] = useState('');

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

  const { data: kpis = [] } = useQuery({
    queryKey: ['kpis', cycleId, selectedReport?.id],
    queryFn:  () => kpisApi.list(cycleId, selectedReport?.id).then(r => r.data),
    enabled:  !!cycleId && !!selectedReport,
  });

  const pendingKpis = (kpis as any[]).filter(k =>
    k.status === 'PENDING_DM' && selectedReport?.direct_manager_id === user?.id
  );

  const evalMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      kpisApi.evaluate(id, 0, comment, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kpis'] });
      setComment('');
    },
  });

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: C.text }}>
          Approve Scorecards
        </h1>
        <p style={{ fontSize: 13, color: C.textSecond }}>
          Review and approve KPIs submitted by your direct reports
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
          {/* Employee selector */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 8 }}>
              Select employee to review their KPIs
            </div>
            {myReports.length === 0 && (
              <div style={{ fontSize: 13, color: C.textTertiary, padding: '12px 0' }}>
                No direct reports assigned to you
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {myReports.map((r: any) => (
                <button key={r.id}
                  onClick={() => setSelectedReport(r)}
                  style={{
                    padding: '6px 14px', borderRadius: 8,
                    border: `0.5px solid ${selectedReport?.id === r.id ? C.text : C.border}`,
                    background: selectedReport?.id === r.id ? C.text : 'transparent',
                    color: selectedReport?.id === r.id ? C.bg : C.textSecond,
                    cursor: 'pointer', fontSize: 13, fontFamily: C.font,
                  }}>
                  {r.full_name}
                </button>
              ))}
            </div>
          </div>

          {/* KPI list */}
          {selectedReport && pendingKpis.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: C.textSecond, fontSize: 13, border: `0.5px dashed ${C.border}`, borderRadius: 10 }}>
              No KPIs pending your approval for {selectedReport.full_name}
            </div>
          )}

          {pendingKpis.map((kpi: any) => (
            <div key={kpi.id} style={{ background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 500, color: C.text }}>{kpi.name}</div>
                  <div style={{ fontSize: 12, color: C.textSecond, marginTop: 2 }}>
                    {kpi.kpi_dimension} · {kpi.weight}% · Target: {kpi.target}
                  </div>
                  {kpi.description && (
                    <div style={{ fontSize: 12, color: C.textSecond, marginTop: 4 }}>
                      {kpi.description}
                    </div>
                  )}
                </div>
                {kpi.kpi_type === 'FIXED' && (
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: '#e0f2fe', color: '#0369a1', fontWeight: 500, alignSelf: 'flex-start' }}>
                    Cascaded
                  </span>
                )}
              </div>
              <textarea
                placeholder="Comment (optional for approval, required for rejection)..."
                value={comment}
                onChange={e => setComment(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none', minHeight: 60, resize: 'vertical', marginBottom: 8, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => evalMutation.mutate({ id: kpi.id, action: 'approve' })}
                  disabled={evalMutation.isPending}
                  style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: C.text, color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}>
                  Approve
                </button>
                <button
                  onClick={() => evalMutation.mutate({ id: kpi.id, action: 'reject' })}
                  disabled={!comment || evalMutation.isPending}
                  style={{ padding: '6px 10px', border: `1px solid ${!comment ? C.borderLight : '#fca5a5'}`, borderRadius: 8, background: C.bg, color: '#991b1b', fontSize: 12, cursor: !comment ? 'default' : 'pointer', fontFamily: C.font, opacity: !comment ? 0.5 : 1 }}>
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
