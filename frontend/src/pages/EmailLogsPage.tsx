import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { emailLogsApi } from '../api/client';

const C = {
  bg:           '#ffffff',
  bgSecondary:  '#f7f7f5',
  bgTertiary:   '#efefec',
  text:         '#1a1a1a',
  textSecond:   '#6b6b6b',
  textTertiary: '#9a9a9a',
  textDanger:   '#b91c1c',
  border:       '#dcdcd6',
  borderLight:  '#ececea',
  font:         '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
};

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  SENT:    { bg: '#dcfce7', color: '#166534' },
  FAILED:  { bg: '#fee2e2', color: '#991b1b' },
  PENDING: { bg: '#fef9c3', color: '#854d0e' },
};

function formatTs(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso ?? '—'; }
}

type LogEntry = {
  id: string;
  idempotency_key: string | null;
  to_email: string;
  subject: string;
  template_name: string;
  template_data: any;
  status: string;
  attempt_count: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  provider_message_id: string | null;
  created_at: string | null;
};

export default function EmailLogsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selected, setSelected]         = useState<LogEntry | null>(null);

  const { data: logs = [], isLoading, isError } = useQuery<LogEntry[]>({
    queryKey: ['email-logs', statusFilter],
    queryFn:  () => emailLogsApi.list(statusFilter || undefined).then(r => r.data),
    refetchInterval: 30_000,
  });

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Email Logs</h1>
        <p style={{ fontSize: 13, color: C.textSecond }}>
          Showing the most recent 100 email delivery records
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['', 'SENT', 'FAILED', 'PENDING'].map(s => (
          <button
            key={s || 'ALL'}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '5px 14px',
              borderRadius: 20,
              border: `1px solid ${statusFilter === s ? C.text : C.border}`,
              background: statusFilter === s ? C.text : C.bg,
              color: statusFilter === s ? '#fff' : C.textSecond,
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: C.font,
            }}>
            {s || 'All'}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: C.textTertiary, alignSelf: 'center' }}>
          {isLoading ? 'Loading…' : `${logs.length} record${logs.length !== 1 ? 's' : ''}`}
        </div>
      </div>

      {isError && (
        <div style={{ padding: 12, background: '#fee2e2', borderRadius: 8, fontSize: 13, color: '#991b1b', marginBottom: 12 }}>
          Failed to load email logs.
        </div>
      )}

      {/* Table */}
      <div style={{ background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 180px 80px 140px', padding: '10px 16px', background: C.bgSecondary, borderBottom: `1px solid ${C.borderLight}`, fontSize: 11, fontWeight: 600, color: C.textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <span>Status</span>
          <span>Subject / Recipient</span>
          <span>Template</span>
          <span>Attempts</span>
          <span>Created</span>
        </div>

        {!isLoading && logs.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: C.textSecond, fontSize: 13 }}>
            No email logs found.
          </div>
        )}

        {logs.map((log, idx) => {
          const ss = STATUS_STYLES[log.status] ?? { bg: C.bgTertiary, color: C.textSecond };
          return (
            <div
              key={log.id}
              onClick={() => setSelected(selected?.id === log.id ? null : log)}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 180px 80px 140px',
                padding: '10px 16px',
                borderBottom: idx < logs.length - 1 ? `1px solid ${C.borderLight}` : 'none',
                cursor: 'pointer',
                background: selected?.id === log.id ? C.bgSecondary : 'transparent',
                transition: 'background 100ms',
              }}
              onMouseEnter={e => { if (selected?.id !== log.id) (e.currentTarget as HTMLElement).style.background = C.bgSecondary; }}
              onMouseLeave={e => { if (selected?.id !== log.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <div>
                <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: ss.bg, color: ss.color }}>
                  {log.status}
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {log.subject}
                </div>
                <div style={{ fontSize: 11, color: C.textSecond, marginTop: 2 }}>{log.to_email}</div>
              </div>
              <div style={{ fontSize: 12, color: C.textSecond, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {log.template_name}
              </div>
              <div style={{ fontSize: 12, color: C.textSecond }}>{log.attempt_count}</div>
              <div style={{ fontSize: 12, color: C.textSecond }}>{formatTs(log.created_at)}</div>
            </div>
          );
        })}
      </div>

      {/* Detail panel */}
      {selected && (
        <div style={{ marginTop: 16, background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Log Detail</div>
            <button
              onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.textSecond, lineHeight: 1 }}>
              ×
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <DetailField label="ID"              value={selected.id} />
            <DetailField label="Status"          value={selected.status} />
            <DetailField label="To"              value={selected.to_email} />
            <DetailField label="Template"        value={selected.template_name} />
            <DetailField label="Created"         value={formatTs(selected.created_at)} />
            <DetailField label="Sent At"         value={formatTs(selected.sent_at)} />
            <DetailField label="Last Attempt"    value={formatTs(selected.last_attempt_at)} />
            <DetailField label="Attempts"        value={String(selected.attempt_count)} />
            <DetailField label="Provider Msg ID" value={selected.provider_message_id || '—'} />
            <DetailField label="Idempotency Key" value={selected.idempotency_key || '—'} />
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Subject</div>
            <div style={{ fontSize: 13, color: C.text, padding: '8px 12px', background: C.bgSecondary, borderRadius: 6 }}>{selected.subject}</div>
          </div>

          {selected.error_message && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Error</div>
              <div style={{ fontSize: 12, color: '#991b1b', padding: '8px 12px', background: '#fee2e2', borderRadius: 6, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {selected.error_message}
              </div>
            </div>
          )}

          {selected.template_data && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Template Data</div>
              <pre style={{ fontSize: 12, color: C.textSecond, padding: '8px 12px', background: C.bgSecondary, borderRadius: 6, margin: 0, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {typeof selected.template_data === 'string'
                  ? selected.template_data
                  : JSON.stringify(selected.template_data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  );
}
