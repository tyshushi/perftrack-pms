import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/auth';
import LoginPage from './pages/LoginPage';
import Layout from './components/common/Layout';
import KpiSettingPage from './pages/KpiSettingPage';
import SelfEvalPage from './pages/SelfEvalPage';
import ManagerApprovalPage from './pages/ManagerApprovalPage';
import ManagerEvalPage from './pages/ManagerEvalPage';
import QuickCascadePage from './pages/QuickCascadePage';
import DashboardPage from './pages/DashboardPage';
import AdminCyclesPage from './pages/AdminCyclesPage';
import AdminPage from './pages/AdminPage';
import GroupsPage from './pages/GroupsPage';
import WeightRulesPage from './pages/WeightRulesPage';
import KpiTemplatesPage from './pages/KpiTemplatesPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequirePermission({
  anyOf,
  children,
}: {
  anyOf: string[];
  children: React.ReactNode;
}) {
  const permissions = useAuthStore((s) => s.permissions);
  const allowed = anyOf.some((p) => permissions.includes(p));
  if (!allowed) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: '#888' }}>
        You do not have permission to access this page.
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const fetchMe = useAuthStore((s) => s.fetchMe);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) fetchMe();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/perftrack-pms">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Navigate to="/scorecard/setting" replace />} />
            <Route path="scorecard/setting"        element={<KpiSettingPage />} />
            <Route path="scorecard/self-eval"      element={<SelfEvalPage />} />
            <Route path="tray/approve"             element={<RequirePermission anyOf={['approve_scorecards']}><ManagerApprovalPage /></RequirePermission>} />
            <Route path="tray/team-eval"           element={<ManagerEvalPage />} />
            <Route path="tray/cascade"             element={<RequirePermission anyOf={['cascade_kpis']}><QuickCascadePage /></RequirePermission>} />
            <Route path="dashboard"                element={<RequirePermission anyOf={['view_team_dashboard', 'view_org_dashboard']}><DashboardPage /></RequirePermission>} />
            <Route path="admin/cycles"             element={<RequirePermission anyOf={['manage_cycles']}><AdminCyclesPage /></RequirePermission>} />
            <Route path="admin/users"              element={<RequirePermission anyOf={['view_employees']}><AdminPage /></RequirePermission>} />
            <Route path="admin/groups"             element={<RequirePermission anyOf={['manage_groups']}><GroupsPage /></RequirePermission>} />
            <Route path="admin/weight-rules"       element={<RequirePermission anyOf={['manage_weight_rules']}><WeightRulesPage /></RequirePermission>} />
            <Route path="admin/kpi-setup/templates" element={<RequirePermission anyOf={['manage_templates']}><KpiTemplatesPage /></RequirePermission>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
