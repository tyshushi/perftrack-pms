import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, isHR } from '../store/auth';
import { kpisApi, cyclesApi, usersApi, groupsApi, departmentsApi } from '../api/client';

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

const CYCLE_STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  DRAFT:  { bg: '#f7f7f5', color: '#6b6b6b', label: 'Draft' },
  ACTIVE: { bg: '#dcfce7', color: '#166534', label: 'Active' },
  CLOSED: { bg: '#fee2e2', color: '#991b1b', label: 'Closed' },
};

const DIMENSIONS = [
  'Financials', 'Customer', 'Internal Process',
  'Learning & Growth', 'Leadership & Culture',
];

const APPLIES_TO_OPTS_HR = [
  { value: 'everyone',   label: 'Everyone' },
  { value: 'group',      label: 'Custom Group' },
  { value: 'hierarchy',  label: 'Hierarchy' },
  { value: 'category',   label: 'Employee Category' },
  { value: 'department', label: 'Department' },
  { value: 'grade',      label: 'Job Grade' },
];

const S: Record<string, any> = {
  card:       { background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12 },
  grid2:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 },
  label:      { fontSize: 12, fontWeight: 500, color: C.textSecond, display: 'block', marginBottom: 4 },
  input:      { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none' },
  btnPrimary: { padding: '8px 16px', border: 'none', borderRadius: 8, background: C.text, color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font },
  btnSm:      { padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.textSecond, fontSize: 12, cursor: 'pointer', fontFamily: C.font },
};

export default function QuickCascadePage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isHrAdmin = isHR(user?.role || '');
  const [cycleId, setCycleId] = useState('');

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'],
    queryFn:  () => cyclesApi.list().then(r => r.data),
  });

  const sortedCycles = useMemo(() =>
    [...(cycles as any[])].sort((a, b) => b.name.localeCompare(a.name)),
    [cycles]
  );

  if (sortedCycles.length && !cycleId) setCycleId(sortedCycles[0].id);

  const currentCycle = sortedCycles.find((c: any) => c.id === cycleId) ?? null;

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn:  () => groupsApi.list().then(r => r.data),
  });

  const { data: depts = [] } = useQuery({
    queryKey: ['depts'],
    queryFn:  () => departmentsApi.list().then(r => r.data),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn:  () => usersApi.list().then(r => r.data),
  });

  const [name,         setName]         = useState('');
  const [description,  setDescription]  = useState('');
  const [kpiDimension, setKpiDimension] = useState('Financials');
  const [weight,       setWeight]       = useState(0);
  const [target,       setTarget]       = useState('');
  const [measurement,  setMeasurement]  = useState('');
  const [appliesTo,    setAppliesTo]    = useState(() => isHrAdmin ? 'everyone' : 'my_reports');
  const [groupId,      setGroupId]      = useState('');
  const [hierarchy,    setHierarchy]    = useState('');
  const [userCategory, setUserCategory] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [jobGrade,     setJobGrade]     = useState('');
  const [showIndividual, setShowIndividual] = useState(false);
  const [search,       setSearch]       = useState('');
  const [selected,     setSelected]     = useState<string[]>([]);
  const [result,       setResult]       = useState<any>(null);

  const eligibleUsers = useMemo(() => {
    const base = (users as any[]).filter(u =>
      u.id !== user?.id && u.is_active !== false
    );
    if (isHrAdmin) return base;
    // For MANAGER/MGR2/HOD: only show employees in their reporting chain
    return base.filter((u: any) =>
      u.direct_manager_id    === user?.id ||
      u.reviewing_manager_id === user?.id ||
      u.hod_id               === user?.id
    );
  }, [users, user, isHrAdmin]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return eligibleUsers;
    return eligibleUsers.filter((u: any) =>
      u.full_name.toLowerCase().includes(q) ||
      u.employee_id.toLowerCase().includes(q) ||
      (u.department_name || '').toLowerCase().includes(q)
    );
  }, [search, eligibleUsers]);

  function toggleUser(id: string) {
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

  function changeAppliesTo(val: string) {
    setAppliesTo(val);
    setGroupId(''); setHierarchy(''); setUserCategory('');
    setDepartmentId(''); setJobGrade('');
  }

  const cascadeMutation = useMutation({
    mutationFn: () => kpisApi.cascade({
      cycle_id:      cycleId,
      name, description,
      kpi_dimension: kpiDimension,
      weight, target, measurement,
      employee_ids:  selected,
      group_id:      appliesTo === 'group'      ? groupId      || null : null,
      hierarchy:     appliesTo === 'hierarchy'  ? hierarchy    || null : null,
      user_category: appliesTo === 'category'   ? userCategory || null : null,
      department_id: appliesTo === 'department' ? departmentId || null : null,
      job_grade:     appliesTo === 'grade'      ? jobGrade     || null : null,
      // my_reports passes no target fields; backend intersects with reporting chain
    }),
    onSuccess: (res) => {
      setResult(res.data);
      qc.invalidateQueries({ queryKey: ['kpis'] });
      setName(''); setDescription(''); setTarget(''); setMeasurement('');
      setWeight(0); setSelected([]); setSearch('');
      setAppliesTo(isHrAdmin ? 'everyone' : 'my_reports');
      setGroupId(''); setHierarchy('');
      setUserCategory(''); setDepartmentId(''); setJobGrade('');
    },
  });

  const canCascade = !!name && !!target && !!cycleId && !cascadeMutation.isPending;

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: C.text }}>
          Quick Cascade
        </h1>
        <p style={{ fontSize: 13, color: C.textSecond }}>
          Push a KPI directly to a group of employees
        </p>
      </div>

      {/* Cycle selector */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: C.textSecond }}>◈</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.textSecond, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Performance Cycle
          </span>
          {currentCycle?.status && (() => {
            const st = CYCLE_STATUS_STYLE[currentCycle.status] || { bg: '#f7f7f5', color: '#6b6b6b', label: currentCycle.status };
            return (
              <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.color, marginLeft: 2 }}>
                {st.label}
              </span>
            );
          })()}
        </div>
        <select
          value={cycleId}
          onChange={e => setCycleId(e.target.value)}
          style={{ width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 15, fontWeight: 600, background: C.bg, color: cycleId ? C.text : C.textTertiary, fontFamily: C.font, outline: 'none', cursor: 'pointer' }}>
          <option value="">Select a performance cycle to begin…</option>
          {sortedCycles.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {cycleId && (
        <div style={S.card}>
          <div style={{ fontWeight: 500, marginBottom: 4, color: C.text }}>
            Cascade KPI
          </div>
          <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 14 }}>
            Push a KPI to a target group of employees. It will appear as Approved in their KPI list.
          </div>

          {/* KPI details */}
          <div style={S.grid2}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>KPI Name</label>
              <input style={S.input} value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Customer Satisfaction Score" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Description</label>
              <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional description..." />
            </div>
            <div>
              <label style={S.label}>KPI Dimension</label>
              <select style={S.input} value={kpiDimension}
                onChange={e => setKpiDimension(e.target.value)}>
                {DIMENSIONS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={S.label}>Weight %</label>
              <input style={S.input} type="number" min={0} max={100}
                value={weight} onChange={e => setWeight(Number(e.target.value))} />
            </div>
            <div>
              <label style={S.label}>Target</label>
              <input style={S.input} value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder="e.g. ≥ 90% satisfaction" />
            </div>
            <div>
              <label style={S.label}>Measurement</label>
              <input style={S.input} value={measurement}
                onChange={e => setMeasurement(e.target.value)}
                placeholder="e.g. Monthly survey score" />
            </div>
          </div>

          {/* Applies To */}
          <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 500, fontSize: 13, color: C.text, marginBottom: 10 }}>
              Applies To
            </div>
            {isHrAdmin ? (
              <div style={S.grid2}>
                <div>
                  <label style={S.label}>Target</label>
                  <select style={S.input} value={appliesTo}
                    onChange={e => changeAppliesTo(e.target.value)}>
                    {APPLIES_TO_OPTS_HR.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {appliesTo === 'group' && (
                  <div>
                    <label style={S.label}>Custom Group</label>
                    <select style={S.input} value={groupId}
                      onChange={e => setGroupId(e.target.value)}>
                      <option value="">Select group…</option>
                      {(groups as any[]).map((g: any) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {appliesTo === 'hierarchy' && (
                  <div>
                    <label style={S.label}>Hierarchy</label>
                    <input style={S.input} value={hierarchy}
                      onChange={e => setHierarchy(e.target.value)}
                      placeholder="e.g. Apex-1" />
                  </div>
                )}
                {appliesTo === 'category' && (
                  <div>
                    <label style={S.label}>Employee Category</label>
                    <input style={S.input} value={userCategory}
                      onChange={e => setUserCategory(e.target.value)}
                      placeholder="e.g. Corporate Staff" />
                  </div>
                )}
                {appliesTo === 'department' && (
                  <div>
                    <label style={S.label}>Department</label>
                    <select style={S.input} value={departmentId}
                      onChange={e => setDepartmentId(e.target.value)}>
                      <option value="">Select department…</option>
                      {(depts as any[]).map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {appliesTo === 'grade' && (
                  <div>
                    <label style={S.label}>Job Grade</label>
                    <input style={S.input} value={jobGrade}
                      onChange={e => setJobGrade(e.target.value)}
                      placeholder="e.g. G2" />
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: C.textSecond }}>Target:</span>
                <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>My Direct Reports</span>
                <span style={{ fontSize: 12, color: C.textSecond, marginLeft: 4 }}>
                  — employees where you are their direct manager, reviewing manager, or HOD
                </span>
              </div>
            )}
          </div>

          {/* Individual employees (expandable) */}
          <div style={{ marginBottom: 12 }}>
            <button onClick={() => setShowIndividual(p => !p)}
              style={{ ...S.btnSm, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                Also include specific employees
                {selected.length > 0 && (
                  <span style={{ marginLeft: 6, fontWeight: 600, color: C.text }}>{selected.length} selected</span>
                )}
              </span>
              <span style={{ fontSize: 10 }}>{showIndividual ? '▲' : '▼'}</span>
            </button>
            {showIndividual && (
              <div style={{ marginTop: 8, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 12 }}>
                <input style={{ ...S.input, marginBottom: 8 }}
                  placeholder="Search by name, code, or department..."
                  value={search} onChange={e => setSearch(e.target.value)} />
                <div style={{ border: `0.5px solid ${C.border}`, borderRadius: 8, maxHeight: 220, overflowY: 'auto' }}>
                  {filteredUsers.length === 0 && (
                    <div style={{ padding: 16, textAlign: 'center', color: C.textTertiary, fontSize: 13 }}>No employees found</div>
                  )}
                  {filteredUsers.map((u: any, i: number) => (
                    <div key={u.id} onClick={() => toggleUser(u.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: i < filteredUsers.length - 1 ? `0.5px solid ${C.borderLight}` : 'none', background: selected.includes(u.id) ? '#f0fdf4' : 'transparent' }}>
                      <input type="checkbox" readOnly checked={selected.includes(u.id)} style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{u.full_name}</div>
                        <div style={{ fontSize: 11, color: C.textSecond }}>
                          {u.employee_id}{u.position_title ? ` · ${u.position_title}` : ''}
                        </div>
                      </div>
                      {selected.includes(u.id) && (
                        <span style={{ fontSize: 11, color: '#166534', fontWeight: 500 }}>✓</span>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button style={S.btnSm} onClick={() => setSelected(filteredUsers.map((u: any) => u.id))}>
                    Select all
                  </button>
                  <button style={S.btnSm} onClick={() => setSelected([])}>Clear</button>
                </div>
              </div>
            )}
          </div>

          {result && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#dcfce7', borderRadius: 8, fontSize: 12, color: '#166534' }}>
              ✓ {result.message}
            </div>
          )}

          {cascadeMutation.isError && (
            <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fee2e2', borderRadius: 8, fontSize: 12, color: '#991b1b' }}>
              {(cascadeMutation.error as any)?.response?.data?.detail || 'Failed to cascade'}
            </div>
          )}

          <button onClick={() => cascadeMutation.mutate()}
            disabled={!canCascade}
            style={{ ...S.btnPrimary, opacity: !canCascade ? 0.5 : 1 }}>
            {cascadeMutation.isPending ? 'Cascading...' : 'Cascade KPI'}
          </button>
        </div>
      )}
    </div>
  );
}
