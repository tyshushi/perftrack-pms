import UsersPage from './pages/UsersPage';
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/auth';
import LoginPage from './pages/LoginPage';
import Layout from './components/common/Layout';
import KpiPage from './pages/KpiPage';
import SelfEvalPage from './pages/SelfEvalPage';
import ManagerEvalPage from './pages/ManagerEvalPage';
import DashboardPage from './pages/DashboardPage';
import AdminPage from './pages/AdminPage';
import NotificationsPage from './pages/NotificationsPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
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
          <Route path="users" element={<UsersPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Navigate to="/kpis" replace />} />
            <Route path="kpis"          element={<KpiPage />} />
            <Route path="self-eval"     element={<SelfEvalPage />} />
            <Route path="mgr-eval"      element={<ManagerEvalPage />} />
            <Route path="dashboard"     element={<DashboardPage />} />
            <Route path="admin"         element={<AdminPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
