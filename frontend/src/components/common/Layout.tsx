import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore, ROLE_LABELS, isHR, isMgr, isHOD } from '../../store/auth';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi } from '../../api/client';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const role = user?.role || '';

  const { data: notifs } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => notificationsApi.list(true).then(r => r.data),
    refetchInterval: 30_000,
  });
  const unreadCount = notifs?.length || 0;

  const navItems = [
    { to: '/kpis',          label: 'KPI Setting',      icon: '◈', show: true },
    { to: '/self-eval',     label: 'Self Evaluation',  icon: '◉', show: role === 'STAFF' || isHR(role) },
    { to: '/mgr-eval',      label: 'Team Evaluation',  icon: '◎', show: isMgr(role) },
    { to: '/dashboard',     label: 'Dashboard',        icon: '▦', show: isHOD(role) || isMgr(role) },
    { to: '/admin',         label: 'HR Admin',         icon: '⚙', show: isHR(role) },
    { to: '/notifications', label: 'Notifications',    icon: '◻', badge: unreadCount, show: true },
  ].filter(n => n.show);

  return (
    <div style={styles.shell}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.logo}>
          <div style={styles.logoMark}>PMS</div>
          <div>
            <div style={styles.logoTitle}>PerfTrack</div>
            <div style={styles.logoSub}>Enterprise Edition</div>
          </div>
        </div>

        <div style={styles.userCard}>
          <div style={styles.avatar}>{user?.full_name.split(' ').map(w => w[0]).join('').slice(0,2)}</div>
          <div>
            <div style={styles.userName}>{user?.full_name}</div>
            <div style={styles.userRole}>{ROLE_LABELS[role] || role}</div>
          </div>
        </div>

        <nav style={styles.nav}>
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} style={({ isActive }) => ({
              ...styles.navItem,
              ...(isActive ? styles.navActive : {}),
            })}>
              <span style={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
              {item.badge ? <span style={styles.badge}>{item.badge}</span> : null}
            </NavLink>
          ))}
        </nav>

        <button onClick={logout} style={styles.logoutBtn}>Sign out</button>
      </aside>

      {/* Main */}
      <main style={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  shell:     { display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif', fontSize: 14, background: '#f5f5f3', color: '#1a1a18' },
  sidebar:   { width: 220, background: '#fff', borderRight: '0.5px solid #e5e4df', display: 'flex', flexDirection: 'column', padding: '0', flexShrink: 0 },
  logo:      { display: 'flex', alignItems: 'center', gap: 10, padding: '20px 16px 16px', borderBottom: '0.5px solid #e5e4df' },
  logoMark:  { width: 32, height: 32, borderRadius: 8, background: '#1a1a18', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 },
  logoTitle: { fontSize: 13, fontWeight: 600 },
  logoSub:   { fontSize: 10, color: '#888' },
  userCard:  { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '0.5px solid #e5e4df' },
  avatar:    { width: 30, height: 30, borderRadius: '50%', background: '#e8f1fb', color: '#185fa5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 },
  userName:  { fontSize: 12, fontWeight: 500, lineHeight: 1.3 },
  userRole:  { fontSize: 10, color: '#888' },
  nav:       { flex: 1, padding: '8px 0', overflowY: 'auto' },
  navItem:   { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', textDecoration: 'none', color: '#666', fontSize: 13, transition: 'background 0.1s', borderRight: '2px solid transparent' },
  navActive: { background: '#f5f5f3', color: '#1a1a18', fontWeight: 500, borderRightColor: '#1a1a18' },
  navIcon:   { width: 16, flexShrink: 0 },
  badge:     { marginLeft: 'auto', background: '#fee2e2', color: '#991b1b', fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 8 },
  logoutBtn: { margin: '12px', padding: '8px', border: '0.5px solid #e5e4df', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#666' },
  main:      { flex: 1, overflowY: 'auto', padding: 28 },
};
