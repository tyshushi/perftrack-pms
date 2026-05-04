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
      localStorage.setItem('access_token', res.data.access_token);
      const me = await authApi.me();
      set({ user: me.data, isLoading: false });
    } catch (e: any) {
      set({ error: e.response?.data?.detail || 'Login failed', isLoading: false });
    }
  },

  logout: () => {
    localStorage.removeItem('access_token');
    set({ user: null });
    window.location.href = '/perftrack-pms';
  },

  fetchMe: async () => {
    const token = localStorage.getItem('access_token');
    if (!tok
