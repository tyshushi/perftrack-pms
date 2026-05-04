import { create } from 'zustand';
import { authApi } from '../api/client';

interface User {
  id: string;
  employee_id: string;
  email: string;
  full_name: string;
  role: string;
  job_grade: string | null;
  department_id: string | null;
  manager_id: string | null;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  error: null,

  login: async (email, password) => {
  set({ isLoading: true, error: null });
  try {
    const res = await authApi.login(email, password);
    const token = res.data.access_token;
    localStorage.setItem('access_token', token);
    const me = await authApi.me();
    set({ user: me.data, isLoading: false, error: null });
  } catch (e: any) {
    localStorage.removeItem('access_token');
    set({ 
      error: e.response?.data?.detail || 'Login failed', 
      isLoading: false,
      user: null 
    });
  }
},

  logout: () => {
    localStorage.removeItem('access_token');
    set({ user: null });
    window.location.href = '/perftrack-pms';
  },

  fetchMe: async () => {
  const token = localStorage.getItem('access_token');
  if (!token) return;
  try {
    const me = await authApi.me();
    set({ user: me.data });
  } catch {
    localStorage.removeItem('access_token');
    set({ user: null });
  }
},
}));

export const ROLE_LABELS: Record<string, string> = {
  STAFF: 'Staff',
  MANAGER: 'Manager',
  MGR2: "Manager's Manager",
  HOD: 'HOD / CxO',
  HR_ADMIN: 'HR Admin',
  SUPER_ADMIN: 'Super Admin',
};

export const isHR  = (role: string) => ['HR_ADMIN', 'SUPER_ADMIN'].includes(role);
export const isMgr = (role: string) => ['MANAGER', 'MGR2', 'HOD', 'HR_ADMIN', 'SUPER_ADMIN'].includes(role);
export const isHOD = (role: string) => ['HOD', 'HR_ADMIN', 'SUPER_ADMIN'].includes(role);
