import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuthStore, ROLE_LABELS } from '../../store/auth';

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

function getAutoExpanded(path: string): Set<string> {
  const ids = new Set<string>(['scorecards', 'my-scorecard']);
  if (path.startsWith('/tray/'))      ids.add('managers-tray');
  if (path.startsWith('/admin/')) {
    ids.add('admin-functions');
    if (path.startsWith('/admin/kpi-setup/')) ids.add('kpi-setup');
  }
  return ids;
}

export default function Layout() {
  const { user, logout } = useAuthStore();
  const role = user?.role || '';
  const location = useLocation();
  const isManager    = useAuthStore(s => s.isManager());
  const isHod        = useAuthStore(s => s.isHod());
  const isHrAdmin    = useAuthStore(s => s.isHrAdmin());
  const isSuperAdmin = useAuthStore(s => s.isSuperAdmin());
  const hasPermission = useAuthStore(s => s.hasPermission);
  const showManagerSection = isManager || isHod || isHrAdmin;

  const [expanded, setExpanded] = useState<Set<string>>(() =>
    getAutoExpanded(location.pathname)
  );

  useEffect(() => {
    setExpanded(prev => new Set([...prev, ...getAutoExpanded(location.pathname)]));
  }, [location.pathname]);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const l0Header: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#9a9a9a',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    padding: '10px 16px', userSelect: 'none',
  };

  function l0LinkStyle(isActive: boolean): React.CSSProperties {
    return {
      display: 'block',
      fontSize: 11, fontWeight: 600,
      color: isActive ? C.text : '#9a9a9a',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      padding: '10px 16px', textDecoration: 'none',
      background: isActive ? '#f5f5f3' : 'transparent',
      borderRight: isActive ? '2px solid #1a1a1a' : '2px solid transparent',
    };
  }

  function l1LinkStyle(isActive: boolean): React.CSSProperties {
    return {
      display: 'block',
      fontSize: 13,
      color: isActive ? C.text : '#444',
      fontWeight: isActive ? 600 : 400,
      padding: '8px 16px 8px 24px',
      textDecoration: 'none',
      background: isActive ? '#f5f5f3' : 'transparent',
      borderRight: isActive ? '2px solid #1a1a1a' : '2px solid transparent',
    };
  }

  function l2LinkStyle(isActive: boolean): React.CSSProperties {
    return {
      display: 'block',
      fontSize: 12,
      color: isActive ? C.text : '#666',
      fontWeight: isActive ? 600 : 400,
      padding: '7px 16px 7px 36px',
      textDecoration: 'none',
      background: isActive ? '#f5f5f3' : 'transparent',
      borderRight: isActive ? '2px solid #1a1a1a' : '2px solid transparent',
    };
  }

  const groupRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: 13, color: '#444',
    padding: '8px 16px 8px 24px',
    cursor: 'pointer', userSelect: 'none',
  };

  const arrowStyle: React.CSSProperties = {
    fontSize: 9, color: '#9a9a9a', flexShrink: 0,
  };

  const divider: React.CSSProperties = {
    height: '0.5px', background: '#e5e4df', margin: '4px 0',
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: C.font, fontSize: 14, background: '#f5f5f3', color: C.text }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: '#fff', borderRight: '0.5px solid #e5e4df', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 16px 16px', borderBottom: '0.5px solid #e5e4df' }}>
          <img src="/perftrack-pms/pr-mark-32.png" alt="PerformRight"
            style={{ width: 32, height: 32, borderRadius: 6, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>PerformRight</div>
            <div style={{ fontSize: 10, color: '#888' }}>by Valiram</div>
          </div>
        </div>

        {/* User card */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '0.5px solid #e5e4df' }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#e8f1fb', color: '#185fa5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
            {user?.full_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{user?.full_name}</div>
            <div style={{ fontSize: 10, color: '#888' }}>{ROLE_LABELS[role] || role}</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>

          {/* ── SCORECARDS (always expanded, no toggle) ── */}
          <div style={l0Header}>Scorecards</div>

          {/* My Scorecard group */}
          <div style={groupRow} onClick={() => toggle('my-scorecard')}>
            <span>My Scorecard</span>
            <span style={arrowStyle}>{expanded.has('my-scorecard') ? '▼' : '▶'}</span>
          </div>
          {expanded.has('my-scorecard') && (
            <>
              <NavLink to="/scorecard/setting" style={({ isActive }) => l2LinkStyle(isActive)} end>
                Scorecard Setting
              </NavLink>
              <NavLink to="/scorecard/self-eval" style={({ isActive }) => l2LinkStyle(isActive)} end>
                Self Evaluation
              </NavLink>
            </>
          )}

          {/* Manager's Tray group */}
          {showManagerSection && (
            <>
              <div style={groupRow} onClick={() => toggle('managers-tray')}>
                <span>Manager's Tray</span>
                <span style={arrowStyle}>{expanded.has('managers-tray') ? '▼' : '▶'}</span>
              </div>
              {expanded.has('managers-tray') && (
                <>
                  <NavLink to="/tray/approve" style={({ isActive }) => l2LinkStyle(isActive)} end>
                    Approve Scorecards
                  </NavLink>
                  <NavLink to="/tray/team-eval" style={({ isActive }) => l2LinkStyle(isActive)} end>
                    Team Evaluation
                  </NavLink>
                  <NavLink to="/tray/cascade" style={({ isActive }) => l2LinkStyle(isActive)} end>
                    Quick Cascade
                  </NavLink>
                </>
              )}
            </>
          )}

          {/* ── DASHBOARD (level 0 direct link) ── */}
          {(isManager || isHod || isHrAdmin
            || hasPermission('view_team_dashboard')
            || hasPermission('view_org_dashboard')) && (
            <>
              <div style={divider} />
              <NavLink to="/dashboard" style={({ isActive }) => l0LinkStyle(isActive)} end>
                Dashboard
              </NavLink>
            </>
          )}

          {/* ── ADMIN FUNCTIONS (toggleable header) ── */}
          {(isHrAdmin
            || hasPermission('view_employees')
            || hasPermission('manage_cycles')
            || hasPermission('view_all_scorecards')
            || hasPermission('manage_groups')
            || hasPermission('view_groups')
            || hasPermission('manage_templates')
            || hasPermission('manage_weight_rules')
            || hasPermission('manage_roles')) && (
            <>
              <div style={divider} />
              <div
                style={{ ...l0Header, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => toggle('admin-functions')}
              >
                <span>Admin Functions</span>
                <span style={{ fontSize: 9 }}>{expanded.has('admin-functions') ? '▼' : '▶'}</span>
              </div>
              {expanded.has('admin-functions') && (
                <>
                  {(isHrAdmin || hasPermission('manage_cycles')) && (
                    <NavLink to="/admin/cycles" style={({ isActive }) => l1LinkStyle(isActive)} end>
                      Performance Cycle
                    </NavLink>
                  )}
                  {(isHrAdmin || hasPermission('view_employees')) && (
                    <NavLink to="/admin/users" style={({ isActive }) => l1LinkStyle(isActive)} end>
                      User Management
                    </NavLink>
                  )}
                  {(isHrAdmin
                    || hasPermission('manage_groups')
                    || hasPermission('view_groups')) && (
                    <NavLink to="/admin/groups" style={({ isActive }) => l1LinkStyle(isActive)} end>
                      Groups Management
                    </NavLink>
                  )}
                  {(isHrAdmin || hasPermission('manage_weight_rules')) && (
                    <NavLink to="/admin/weight-rules" style={({ isActive }) => l1LinkStyle(isActive)} end>
                      Weight Rules
                    </NavLink>
                  )}
                  {isSuperAdmin && (
                    <NavLink to="/admin/roles" style={({ isActive }) => l1LinkStyle(isActive)} end>
                      Role Management
                    </NavLink>
                  )}
                  {isSuperAdmin && (
                    <NavLink to="/admin/settings" style={({ isActive }) => l1LinkStyle(isActive)} end>
                      System Settings
                    </NavLink>
                  )}

                  {/* KPI Setup sub-group */}
                  {(isHrAdmin || hasPermission('manage_templates')) && (
                    <>
                      <div style={groupRow} onClick={() => toggle('kpi-setup')}>
                        <span>KPI Setup</span>
                        <span style={arrowStyle}>{expanded.has('kpi-setup') ? '▼' : '▶'}</span>
                      </div>
                      {expanded.has('kpi-setup') && (
                        <NavLink to="/admin/kpi-setup/templates" style={({ isActive }) => l2LinkStyle(isActive)} end>
                          Templates & Cascade
                        </NavLink>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </nav>

        <button onClick={logout} style={{ margin: '12px', padding: '8px', border: '0.5px solid #e5e4df', borderRadius: 8, background: 'transparent', cursor: 'pointer', fontSize: 12, color: '#666', fontFamily: C.font }}>
          Sign out
        </button>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
        <Outlet />
      </main>
    </div>
  );
}
