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
  list:              ()                      => api.get('/cycles/'),
  create:            (data: any)             => api.post('/cycles/', data),
  setIncrementBands: (id: string, bands: any[]) => api.post(`/cycles/${id}/increment-bands`, bands),
  getIncrementBands: (id: string)            => api.get(`/cycles/${id}/increment-bands`),
  setRatingScales:   (id: string, scales: any[]) => api.post(`/cycles/${id}/rating-scales`, scales),
  setWeightRules:    (id: string, rules: any[])  => api.post(`/cycles/${id}/weight-rules`, rules),
  advanceStatus:     (id: string, status: string) => api.patch(`/cycles/${id}/status?status=${status}`),
};

export const kpisApi = {
  list:         (cycleId: string, userId?: string) =>
    api.get('/kpis/', { params: { cycle_id: cycleId, user_id: userId } }),
  listPendingForMe: (cycleId: string) =>
    api.get('/kpis/', { params: { cycle_id: cycleId, pending_for_me: true } }),
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
  cascade:         (data: any)                      => api.post('/kpis/cascade', data),
  adjustWeight:    (id: string, weight: number)     => api.patch(`/kpis/${id}/weight`, { weight }),
  getWeightRules:  (cycleId: string)                => api.get(`/kpis/weight-rules/${cycleId}`),
  setWeightRules:  (cycleId: string, rules: any[])  => api.post(`/kpis/weight-rules/${cycleId}`, rules),
  getApplicableRule: (employeeId: string, cycleId: string) =>
    api.get('/kpis/applicable-rule', { params: { employee_id: employeeId, cycle_id: cycleId } }),
  getTemplates:    (cycleId: string)                => api.get(`/kpis/templates/${cycleId}`),
  createTemplate:  (data: any)                      => api.post('/kpis/templates', data),
  deleteTemplate:  (id: string)                     => api.delete(`/kpis/templates/${id}`),
  cascadeTemplate:  (id: string)                     => api.post(`/kpis/templates/${id}/cascade`),
  submitScorecard:  (cycleId: string)                => api.post('/kpis/submit-scorecard', { cycle_id: cycleId }),
  reviewScorecard:  (data: any)                      => api.post('/kpis/review-scorecard', data),
  resetScorecard:   (cycleId: string, employeeId: string) =>
    api.post('/kpis/admin/reset-scorecard', { cycle_id: cycleId, employee_id: employeeId }),
  moveStage:        (data: any) => api.post('/kpis/admin/move-stage', data),
  deleteScorecard:  (cycleId: string, employeeId: string) =>
    api.delete('/kpis/admin/delete-scorecard', { data: { cycle_id: cycleId, employee_id: employeeId } }),
  resetAllScorecards:  (cycleId: string) =>
    api.post('/kpis/admin/reset-all-scorecards', { cycle_id: cycleId }),
  deleteAllScorecards: (cycleId: string) =>
    api.delete('/kpis/admin/delete-all-scorecards', { data: { cycle_id: cycleId } }),
  selfEvaluateAll:  (data: any) => api.post('/kpis/self-evaluate-all', data),
  updateRatingTargets: (kpiId: string, ratingTargets: any[]) =>
    api.patch(`/kpis/${kpiId}/rating-targets`, { rating_targets: ratingTargets }),
};

export const usersApi = {
  list:          (params?: any) => api.get('/users/', { params }),
  create:        (data: any)    => api.post('/users/', data),
  directReports: ()             => api.get('/users/direct-reports'),
  deactivate:    (id: string)   => api.delete(`/users/${id}`),
  reactivate:    (id: string)   => api.post(`/users/${id}/reactivate`),
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

export const userProfileApi = {
  getProfile:     (id: string)           => api.get(`/users/${id}/profile`),
  updateManagers: (id: string, data: any) => api.patch(`/users/${id}/managers`, data),
};

export const rolesApi = {
  list:        ()                     => api.get('/roles/'),
  create:      (data: any)            => api.post('/roles/', data),
  update:      (id: string, data: any) => api.patch(`/roles/${id}`, data),
  delete:      (id: string)           => api.delete(`/roles/${id}`),
  getUsers:    (id: string)           => api.get(`/roles/${id}/users`),
  assignUsers: (id: string, userIds: string[]) =>
    api.post(`/roles/${id}/users`, { user_ids: userIds }),
  removeUser:  (roleId: string, userId: string) =>
    api.delete(`/roles/${roleId}/users/${userId}`),
};

export const groupsApi = {
  list:          (cycleId?: string) =>
    api.get('/groups/', { params: cycleId ? { cycle_id: cycleId } : {} }),
  create:        (data: any)        => api.post('/groups/', data),
  update:        (id: string, data: any) => api.patch(`/groups/${id}`, data),
  delete:        (id: string)       => api.delete(`/groups/${id}`),
  getMembers:    (id: string)       => api.get(`/groups/${id}/members`),
  addMembers:    (id: string, userIds: string[]) =>
    api.post(`/groups/${id}/members`, { user_ids: userIds }),
  removeMember:  (groupId: string, userId: string) =>
    api.delete(`/groups/${groupId}/members/${userId}`),
};
