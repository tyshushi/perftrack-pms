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
  permissions: string[];
  derived_roles: string[];
}

interface AuthState {
  user: User | null;
  permissions: string[];
  derivedRoles: string[];
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  isManager: () => boolean;
  isHod: () => boolean;
  isHrAdmin: () => boolean;
  isSuperAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  permissions: [],
  derivedRoles: [],
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.login(email, password);
      const token = res.data.access_token;
      localStorage.setItem('access_token', token);

      const loginUser = res.data.user || {};
      const permissions: string[] = loginUser.permissions || [];
      const derivedRoles: string[] = loginUser.derived_roles || [];

      const me = await authApi.me();
      const user: User = {
        ...me.data,
        permissions: me.data.permissions || permissions,
        derived_roles: me.data.derived_roles || derivedRoles,
      };
      set({
        user,
        permissions: user.permissions || [],
        derivedRoles: user.derived_roles || [],
        isLoading: false,
        error: null,
      });
    } catch (e: any) {
      localStorage.removeItem('access_token');
      set({
        error: e.response?.data?.detail || 'Login failed',
        isLoading: false,
        user: null,
        permissions: [],
        derivedRoles: [],
      });
    }
  },

  logout: () => {
    localStorage.removeItem('access_token');
    set({ user: null, permissions: [], derivedRoles: [] });
    window.location.href = '/perftrack-pms';
  },

  fetchMe: async () => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    try {
      const me = await authApi.me();
      const user: User = {
        ...me.data,
        permissions: me.data.permissions || [],
        derived_roles: me.data.derived_roles || [],
      };
      set({
        user,
        permissions: user.permissions || [],
        derivedRoles: user.derived_roles || [],
      });
    } catch {
      localStorage.removeItem('access_token');
      set({ user: null, permissions: [], derivedRoles: [] });
    }
  },

  hasPermission: (permission: string) => {
    return get().permissions.includes(permission);
  },

  isManager: () => {
    const { derivedRoles, user } = get();
    if (derivedRoles.includes('MANAGER')) return true;
    const role = user?.role;
    return role === 'MANAGER' || role === 'HOD' || role === 'HR_ADMIN' || role === 'SUPER_ADMIN';
  },

  isHod: () => {
    const { derivedRoles, user } = get();
    if (derivedRoles.includes('HOD')) return true;
    const role = user?.role;
    return role === 'HOD' || role === 'HR_ADMIN' || role === 'SUPER_ADMIN';
  },

  isHrAdmin: () => {
    const { permissions, user } = get();
    if (permissions.includes('manage_cycles')) return true;
    const role = user?.role;
    return role === 'HR_ADMIN' || role === 'SUPER_ADMIN';
  },

  isSuperAdmin: () => {
    return get().user?.role === 'SUPER_ADMIN';
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
export const isMgr = (role: string) => ['MANAGER', 'HOD', 'HR_ADMIN', 'SUPER_ADMIN'].includes(role);
export const isHOD = (role: string) => ['HOD', 'HR_ADMIN', 'SUPER_ADMIN'].includes(role);
