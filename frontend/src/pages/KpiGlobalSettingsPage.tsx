import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, kpisApi } from '../api/client';
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

const S: Record<string, any> = {
  card:       { background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12 },
  sectionHdr: { fontSize: 13, fontWeight: 600, color: C.textTertiary, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 },
  label:      { fontSize: 12, fontWeight: 500, color: C.textSecond, display: 'block', marginBottom: 4 },
  input:      { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none' },
  btnPrimary: { padding: '8px 16px', border: 'none', borderRadius: 8, background: C.text, color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font },
  btnSm:      { padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.textSecond, fontSize: 12, cursor: 'pointer', fontFamily: C.font },
};

export default function KpiGlobalSettingsPage() {
  const qc = useQueryClient();
  const isHrAdmin    = useAuthStore(s => s.isHrAdmin());
  const isSuperAdmin = useAuthStore(s => s.isSuperAdmin());
  const hasPermission = useAuthStore(s => s.hasPermission);
  const canEdit = isHrAdmin || isSuperAdmin || hasPermission('manage_weight_rules');

  const { data: limits, isLoading } = useQuery({
    queryKey: ['kpi-count-limits'],
    queryFn:  () => kpisApi.getCountLimits().then(r => r.data),
  });

  const [maxKpis,    setMaxKpis]    = useState('10');
  const [minKpis,    setMinKpis]    = useState('3');
  const [globalMin,  setGlobalMin]  = useState('5');
  const [savedOk,    setSavedOk]    = useState(false);
  const [err,        setErr]        = useState<string | null>(null);

  useEffect(() => {
    if (!limits) return;
    setMaxKpis(String((limits as any).max ?? 10));
    setMinKpis(String((limits as any).min ?? 3));
    setGlobalMin(String((limits as any).global_min_weight ?? 5));
  }, [limits]);

  const initialMax    = String((limits as any)?.max    ?? 10);
  const initialMin    = String((limits as any)?.min    ?? 3);
  const initialGlobal = String((limits as any)?.global_min_weight ?? 5);

  const dirty = maxKpis !== initialMax || minKpis !== initialMin || globalMin !== initialGlobal;

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      settingsApi.update(key, value),
    onError: (e: any) => {
      setErr(e?.response?.data?.detail || 'Save failed');
    },
  });

  const handleSave = async () => {
    const maxN    = parseInt(maxKpis, 10);
    const minN    = parseInt(minKpis, 10);
    const globalN = parseInt(globalMin, 10);

    if (!Number.isInteger(maxN) || maxN < 1) {
      setErr('Maximum KPIs must be a positive integer');
      return;
    }
    if (!Number.isInteger(minN) || minN < 1) {
      setErr('Minimum KPIs must be a positive integer');
      return;
    }
    if (minN >= maxN) {
      setErr('Minimum KPIs must be less than Maximum KPIs');
      return;
    }
    if (!Number.isInteger(globalN) || globalN < 0 || globalN > 100) {
      setErr('Global minimum weight must be between 0 and 100');
      return;
    }
    setErr(null);

    try {
      if (maxKpis !== initialMax)    await updateMutation.mutateAsync({ key: 'max_kpis_per_scorecard',    value: maxKpis });
      if (minKpis !== initialMin)    await updateMutation.mutateAsync({ key: 'min_kpis_per_scorecard',    value: minKpis });
      if (globalMin !== initialGlobal) await updateMutation.mutateAsync({ key: 'global_min_weight_per_kpi', value: globalMin });
      qc.invalidateQueries({ queryKey: ['kpi-count-limits'] });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch {
      // error handled in onError
    }
  };

  const handleCancel = () => {
    setMaxKpis(initialMax);
    setMinKpis(initialMin);
    setGlobalMin(initialGlobal);
    setErr(null);
  };

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: C.text }}>KPI Global Settings</h1>
        <p style={{ fontSize: 13, color: C.textSecond }}>
          Configure KPI count limits and global weight constraints
        </p>
      </div>

      {isLoading ? (
        <div style={{ ...S.card, color: C.textSecond, fontSize: 13 }}>Loading settings…</div>
      ) : (
        <>
          {/* Section 1: KPI Count Limits */}
          <div style={S.card}>
            <div style={S.sectionHdr}>KPI Count Limits</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>
              <div>
                <label style={S.label}>Maximum KPIs per Scorecard</label>
                <input
                  type="number"
                  min={1}
                  disabled={!canEdit}
                  style={{ ...S.input, width: 100, opacity: canEdit ? 1 : 0.6 }}
                  value={maxKpis}
                  onChange={e => { setErr(null); setMaxKpis(e.target.value); }}
                />
              </div>
              <div>
                <label style={S.label}>Minimum KPIs per Scorecard</label>
                <input
                  type="number"
                  min={1}
                  disabled={!canEdit}
                  style={{ ...S.input, width: 100, opacity: canEdit ? 1 : 0.6 }}
                  value={minKpis}
                  onChange={e => { setErr(null); setMinKpis(e.target.value); }}
                />
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.textSecond }}>
              Applies globally to all employees and cycles
            </div>
            {parseInt(minKpis) >= parseInt(maxKpis) && (
              <div style={{ marginTop: 6, fontSize: 12, color: C.textDanger }}>
                Minimum must be less than Maximum
              </div>
            )}
          </div>

          {/* Section 2: Global Minimum Weight per KPI */}
          <div style={{ ...S.card, background: C.bgInfo, border: `1px solid #bae6fd` }}>
            <div style={{ ...S.sectionHdr, color: C.textInfo }}>Global Minimum Weight per KPI</div>
            <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 12 }}>
              No individual KPI can be set below this weight. Applies across all rules and cycles.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ ...S.label, marginBottom: 0, whiteSpace: 'nowrap' }}>
                Minimum Weight Per KPI %
              </label>
              <input
                type="number"
                min={0}
                max={100}
                disabled={!canEdit}
                style={{ ...S.input, width: 90, opacity: canEdit ? 1 : 0.6 }}
                value={globalMin}
                onChange={e => { setErr(null); setGlobalMin(e.target.value); }}
              />
            </div>
          </div>

          {!canEdit && (
            <div style={{ marginBottom: 10, fontSize: 12, color: C.textSecond, fontStyle: 'italic' }}>
              You have view-only access to these settings.
            </div>
          )}

          {err && (
            <div style={{ marginBottom: 10, fontSize: 12, color: C.textDanger }}>{err}</div>
          )}
          {savedOk && (
            <div style={{ marginBottom: 10, fontSize: 12, color: '#166534', fontWeight: 500 }}>
              ✓ Settings saved
            </div>
          )}

          {canEdit && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSave}
                disabled={!dirty || updateMutation.isPending}
                style={{
                  ...S.btnPrimary,
                  opacity: (!dirty || updateMutation.isPending) ? 0.5 : 1,
                  cursor: (!dirty || updateMutation.isPending) ? 'not-allowed' : 'pointer',
                }}>
                {updateMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              {dirty && (
                <button
                  onClick={handleCancel}
                  disabled={updateMutation.isPending}
                  style={S.btnSm}>
                  Cancel
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
