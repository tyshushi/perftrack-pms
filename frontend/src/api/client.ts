import axios from 'axios';

export const api = axios.create({
  baseURL: 'https://perftrack-pms.onrender.com/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const token = localStorage.getItem('access_token');
      if (token) {
        localStorage.removeItem('access_token');
        window.location.href = '/perftrack-pms/login';
      }
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', new URLSearchParams({ username: email, password }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }),
  me: () => api.get('/auth/me'),
};

export const cyclesApi = {
  list:              ()           => api.get('/cycles/'),
  create:            (data: any)  => api.post('/cycles/', data),
  setIncrementBands: (id: string, bands: any[]) => api.post(`/cycles/${id}/increment-bands`, bands),
  getIncrementBands: (id: string) => api.get(`/cycles/${id}/increment-bands`),
  setRatingScales:   (id: string, scales: any[]) => api.post(`/cycles/${id}/rating-scales`, scales),
  setWeightRules:    (id: string, rules: any[])  => api.post(`/cycles/${id}/weight-rules`, rules),
  advanceStatus:     (id: string, status: string) => api.patch(`/cycles/${id}/status?status=${status}`),
};

export const kpisApi = {
  list:         (cycleId: string, userId?: string) =>
    api.get('/kpis/', { params: { cycle_id: cycleId, user_id: userId } }),
  create:       (data: any)  => api.post('/kpis/', data),
  update:       (id: string, data: any) => api.patch(`/kpis/${id}`, data),
  delete:       (id: string) => api.delete(`/kpis/${id}`),
  submit:       (id: string) => api.post(`/kpis/${id}/submit`),
  selfEvaluate: (id: string, score: number, comment: string) =>
    api.post(`/kpis/${id}/self-evaluate`, { score, comment }),
  evaluate:     (id: string, score: number, comment: string, action: string) =>
    api.post(`/kpis/${id}/evaluate`, { score, comment, action }),
  lock:         (id: string) => api.post(`/kpis/${id}/lock`),
  auditLog:     (id: string) => api.get(`/kpis/${id}/audit`),
};

export const usersApi = {
  list:          (params?: any) => api.get('/users/', { params }),
  create:        (data: any)    => api.post('/users/', data),
  directReports: ()             => api.get('/users/direct-reports'),
};

export const departmentsApi = {
  list:   () => api.get('/departments/'),
  create: (data: any) => api.post('/departments/', data),
};

export const scorecardsApi = {
  list:        (cycleId: string, deptId?: string) =>
    api.get('/scorecards/', { params: { cycle_id: cycleId, department_id: deptId } }),
  recalculate: (cycleId: string, userId?: string) =>
    api.post('/scorecards/recalculate', null, { params: { cycle_id: cycleId, user_id: userId } }),
  bellCurve:   (cycleId: string) =>
    api.post('/scorecards/bell-curve', null, { params: { cycle_id: cycleId } }),
};

export const notificationsApi = {
  list:        (unreadOnly?: boolean) => api.get('/notifications/', { params: { unread_only: unreadOnly } }),
  markAllRead: () => api.patch('/notifications/read-all'),
};
