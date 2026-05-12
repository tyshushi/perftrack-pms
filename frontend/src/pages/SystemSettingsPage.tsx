import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth';
import { settingsApi } from '../api/client';

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

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function ToggleSwitch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!on)}
      disabled={disabled}
      aria-pressed={on}
      style={{
        position: 'relative',
        width: 44,
        height: 24,
        borderRadius: 12,
        border: 'none',
        background: on ? '#16a34a' : C.bgTertiary,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 150ms ease',
        padding: 0,
      }}>
      <span style={{
        position: 'absolute',
        top: 2,
        left: on ? 22 : 2,
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: '#ffffff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
        transition: 'left 150ms ease',
      }} />
    </button>
  );
}

export default function SystemSettingsPage() {
  const isSuperAdmin = useAuthStore(s => s.isSuperAdmin());
  const qc = useQueryClient();

  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn:  () => settingsApi.list().then(r => r.data),
  });

  const cascadeMeta = (settings as any)?.manager_cascade_enabled;
  const [cascadeOn, setCascadeOn] = useState<boolean>(true);
  const [savedOk,  setSavedOk]  = useState(false);
  const [err,      setErr]      = useState<string | null>(null);

  useEffect(() => {
    if (cascadeMeta?.value !== undefined) {
      setCascadeOn(cascadeMeta.value === 'true');
    }
  }, [cascadeMeta?.value]);

  const updateMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      settingsApi.update(key, value),
    onSuccess: () => {
      setSavedOk(true);
      setErr(null);
      qc.invalidateQueries({ queryKey: ['system-settings'] });
      setTimeout(() => setSavedOk(false), 2500);
    },
    onError: (e: any) => {
      setErr(e?.response?.data?.detail || 'Save failed');
      setSavedOk(false);
    },
  });

  if (!isSuperAdmin) {
    return (
      <div style={{ fontFamily: C.font, color: C.text }}>
        <div style={S.card}>
          <div style={{ fontSize: 13, color: C.textDanger }}>
            Only Super Admin can access System Settings.
          </div>
        </div>
      </div>
    );
  }

  const initial = cascadeMeta?.value === 'true';
  const dirty   = cascadeOn !== initial;

  const handleSave = () => {
    updateMutation.mutate({
      key:   'manager_cascade_enabled',
      value: cascadeOn ? 'true' : 'false',
    });
  };

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: C.text }}>System Settings</h1>
        <p style={{ fontSize: 13, color: C.textSecond }}>
          Global configuration controls for the performance management system
        </p>
      </div>

      {isLoading ? (
        <div style={{ ...S.card, color: C.textSecond, fontSize: 13 }}>Loading settings…</div>
      ) : (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.text, marginBottom: 4 }}>
                Allow Managers to Cascade KPIs
              </div>
              <div style={{ fontSize: 12, color: C.textSecond }}>
                When disabled, only HR Admins and Super Admins can cascade KPIs to staff.
                Managers and HODs will see a permission error if they attempt to cascade.
              </div>
            </div>
            <ToggleSwitch on={cascadeOn} onChange={setCascadeOn} />
          </div>

          <div style={{ marginTop: 8, fontSize: 12, color: C.textSecond, fontStyle: 'italic' }}>
            When disabled, the Quick Cascade option will be hidden from managers' navigation.
          </div>

          <div style={{ marginTop: 12, padding: '8px 12px', background: C.bgSecondary, borderRadius: 6, fontSize: 12, color: C.textSecond }}>
            Last updated by{' '}
            <strong style={{ color: C.text }}>{cascadeMeta?.updated_by_name || '—'}</strong>
            {' '}on{' '}
            <strong style={{ color: C.text }}>{formatTimestamp(cascadeMeta?.updated_at)}</strong>
          </div>

          {err && (
            <div style={{ marginTop: 10, fontSize: 12, color: C.textDanger }}>{err}</div>
          )}
          {savedOk && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#166534', fontWeight: 500 }}>
              ✓ Setting saved
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
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
                onClick={() => setCascadeOn(initial)}
                disabled={updateMutation.isPending}
                style={S.btnSm}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, any> = {
  card:       { background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12 },
  label:      { fontSize: 12, fontWeight: 500, color: C.textSecond, display: 'block', marginBottom: 4 },
  input:      { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none' },
  btnPrimary: { padding: '8px 16px', border: 'none', borderRadius: 8, background: C.text, color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font },
  btnSm:      { padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.textSecond, fontSize: 12, cursor: 'pointer', fontFamily: C.font },
};
