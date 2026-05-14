import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useAuthStore } from './store/auth';
import { settingsApi } from './api/client';
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
import RoleManagementPage from './pages/RoleManagementPage';
import SystemSettingsPage from './pages/SystemSettingsPage';
import ReportBuilderPage from './pages/ReportBuilderPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequirePermission({ permission, children }: { permission: string | string[], children: React.ReactNode }) {
  const hasPermission = useAuthStore(s => s.hasPermission);
  const isSuperAdmin = useAuthStore(s => s.isSuperAdmin());
  const perms = Array.isArray(permission) ? permission : [permission];
  const allowed = isSuperAdmin || perms.some(p => hasPermission(p));
  if (!allowed) return <Navigate to="/scorecard/setting" replace />;
  return <>{children}</>;
}

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const isSuperAdmin = useAuthStore(s => s.isSuperAdmin());
  if (!isSuperAdmin) return <Navigate to="/scorecard/setting" replace />;
  return <>{children}</>;
}

function RequireManagerCascade({ children }: { children: React.ReactNode }) {
  const isHrAdmin    = useAuthStore(s => s.isHrAdmin());
  const isSuperAdmin = useAuthStore(s => s.isSuperAdmin());
  const { data: systemSettings, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn:  () => settingsApi.list().then(r => r.data),
  });
  if (isHrAdmin || isSuperAdmin) return <>{children}</>;
  if (isLoading) return null;
  const managerCascadeEnabled =
    (systemSettings as any)?.manager_cascade_enabled?.value !== 'false';
  if (!managerCascadeEnabled) return <Navigate to="/scorecard/setting" replace />;
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
            <Route path="tray/approve"             element={<RequirePermission permission={["approve_scorecards"]}><ManagerApprovalPage /></RequirePermission>} />
            <Route path="tray/team-eval"           element={<ManagerEvalPage />} />
            <Route path="tray/cascade"             element={<RequireManagerCascade><RequirePermission permission={["cascade_kpis"]}><QuickCascadePage /></RequirePermission></RequireManagerCascade>} />
            <Route path="dashboard"                element={<RequirePermission permission={["view_team_dashboard", "view_org_dashboard"]}><DashboardPage /></RequirePermission>} />
            <Route path="admin/cycles"             element={<RequirePermission permission={["view_cycles", "manage_cycles"]}><AdminCyclesPage /></RequirePermission>} />
            <Route path="admin/users"              element={<RequirePermission permission={["view_employees", "edit_employee_profiles"]}><AdminPage /></RequirePermission>} />
            <Route path="admin/groups"             element={<RequirePermission permission={["view_groups", "manage_groups"]}><GroupsPage /></RequirePermission>} />
            <Route path="admin/weight-rules"       element={<RequirePermission permission={["manage_weight_rules"]}><WeightRulesPage /></RequirePermission>} />
            <Route path="admin/kpi-setup/templates" element={<RequirePermission permission={["manage_templates", "cascade_kpis"]}><KpiTemplatesPage /></RequirePermission>} />
            <Route path="admin/reports"             element={<RequirePermission permission={["view_employees"]}><ReportBuilderPage /></RequirePermission>} />
            <Route path="admin/roles"              element={<RequirePermission permission={["manage_custom_roles"]}><RoleManagementPage /></RequirePermission>} />
            <Route path="admin/settings"           element={<RequireSuperAdmin><SystemSettingsPage /></RequireSuperAdmin>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
