import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../api/client';
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

const TYPE_COLORS: Record<string,string> = {
  KPI_PENDING:         '#1d4ed8',
  KPI_APPROVED:        '#166534',
  KPI_REJECTED:        '#991b1b',
  INCREMENT_CONFIRMED: '#166534',
  EVAL_DUE:            '#854d0e',
};

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data: notifs = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list().then(r => r.data),
  });

  const markAll = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess:  () => qc.invalidateQueries(['notifications']),
  });

  const unread = (notifs as any[]).filter((n: any) => !n.is_read).length;

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:500 }}>Notifications</h1>
          <p style={{ fontSize:13, color:'#888' }}>{unread} unread · {(notifs as any[]).length} total</p>
        </div>
        {unread > 0 && (
          <button onClick={() => markAll.mutate()} style={{ padding:'7px 14px', border:'0.5px solid #d0d0cc', borderRadius:8, background:'transparent', fontSize:12, cursor:'pointer' }}>
            Mark all read
          </button>
        )}
      </div>

      {(notifs as any[]).length === 0 && (
        <div style={{ textAlign:'center', padding:60, color:'#888', fontSize:13 }}>No notifications yet.</div>
      )}

      {(notifs as any[]).map((n: any) => (
        <div key={n.id} style={{
          background: n.is_read ? '#fff' : '#fafaf8',
          border: `0.5px solid ${n.is_read ? '#e5e4df' : '#d0d0cc'}`,
          borderRadius:10, padding:14, marginBottom:8, display:'flex', gap:12,
        }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background: TYPE_COLORS[n.type] || '#888', flexShrink:0, marginTop:5, opacity: n.is_read ? 0.3 : 1 }} />
          <div style={{ flex:1 }}>
            <div style={{ fontWeight: n.is_read ? 400 : 500, fontSize:14, marginBottom:2 }}>{n.title}</div>
            <div style={{ fontSize:13, color:'#666', marginBottom:4 }}>{n.body}</div>
            <div style={{ fontSize:11, color:'#aaa' }}>{new Date(n.created_at).toLocaleString()}</div>
          </div>
          {!n.is_read && <div style={{ width:6, height:6, borderRadius:'50%', background:TYPE_COLORS[n.type]||'#888', flexShrink:0, marginTop:5 }} />}
        </div>
      ))}
    </div>
  );
}
