import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kpisApi, cyclesApi, groupsApi, departmentsApi, usersApi } from '../api/client';
import { useAuthStore } from '../store/auth';

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

const TARGET_TYPES = [
  { value: 'everyone',  label: 'Everyone' },
  { value: 'group',     label: 'Custom Group' },
  { value: 'hierarchy', label: 'Hierarchy' },
  { value: 'category',  label: 'Employee Category' },
  { value: 'grade',     label: 'Job Grade' },
];

const S: Record<string, any> = {
  card:       { background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12 },
  grid2:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 },
  label:      { fontSize: 12, fontWeight: 500, color: C.textSecond, display: 'block', marginBottom: 4 },
  input:      { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none' },
  btnPrimary: { padding: '8px 16px', border: 'none', borderRadius: 8, background: C.text, color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font },
  btnSm:      { padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.textSecond, fontSize: 12, cursor: 'pointer', fontFamily: C.font },
  th:         { textAlign: 'left', padding: '10px', borderBottom: `1px solid ${C.borderLight}`, fontSize: 11, color: C.textSecond, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' },
  td:         { padding: '10px', fontSize: 13, color: C.text },
};

const ROLE_PALETTE: Record<string, { bg: string; color: string; label: string }> = {
  HR_ADMIN:    { bg: '#dbeafe', color: '#1e40af', label: 'HR Admin' },
  SUPER_ADMIN: { bg: '#dbeafe', color: '#1e40af', label: 'HR Admin' },
  HOD:         { bg: '#ede9fe', color: '#5b21b6', label: 'HOD' },
  MANAGER:     { bg: '#dcfce7', color: '#166534', label: 'Manager' },
  MGR2:        { bg: '#dcfce7', color: '#166534', label: 'Manager' },
};

export default function WeightRulesPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [cycleId, setCycleId] = useState('');
  const [conflicts, setConflicts]   = useState<any[]>([]);
  const [copyFrom,  setCopyFrom]    = useState('');
  const [saved,     setSaved]       = useState(false);
  const [checking,  setChecking]    = useState(false);
  const [copying,   setCopying]     = useState(false);
  const [rules,     setRules]       = useState<any[]>([]);
  const [initialized, setInitialized] = useState('');
  const [saveError,   setSaveError]   = useState('');
  const [expandedCoverage, setExpandedCoverage] = useState<Record<number, boolean>>({});

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
  const otherCycles  = sortedCycles.filter((c: any) => c.id !== cycleId);

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn:  () => groupsApi.list().then(r => r.data),
  });

  const { data: depts = [] } = useQuery({
    queryKey: ['depts'],
    queryFn:  () => departmentsApi.list().then(r => r.data),
  });

  const { data: fetchedRules = [] } = useQuery({
    queryKey: ['weight-rules', cycleId],
    queryFn:  () => kpisApi.getWeightRules(cycleId).then(r => r.data),
    enabled:  !!cycleId,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['users', 'all'],
    queryFn:  () => usersApi.list().then(r => r.data),
  });

  const { data: allGroupMembers = {} } = useQuery({
    queryKey: ['group-members', (groups as any[]).map((g: any) => g.id).join(',')],
    queryFn:  async () => {
      const out: Record<string, string[]> = {};
      for (const g of (groups as any[])) {
        try {
          const res = await groupsApi.getMembers(g.id);
          out[g.id] = (res.data || []).map((m: any) => m.user_id || m.id);
        } catch {
          out[g.id] = [];
        }
      }
      return out;
    },
    enabled: (groups as any[]).length > 0,
  });

  const usersById = useMemo(() => {
    const map: Record<string, any> = {};
    for (const u of (allUsers as any[])) map[u.id] = u;
    return map;
  }, [allUsers]);

  // Compute coverage for each currently-edited rule (within actor scope)
  const computeCoverage = (rule: any) => {
    const direct: any[]   = [];
    const indirect: any[] = [];
    const universe        = (allUsers as any[]).filter((u: any) => u.is_active !== false);

    const matchedByTarget = universe.filter((u: any) => {
      if (rule.group_id) {
        const members: string[] = (allGroupMembers as any)[rule.group_id] || [];
        return members.includes(u.id);
      }
      if (rule.hierarchy)     return (u.hierarchy || '') === rule.hierarchy;
      if (rule.user_category) return (u.category  || '') === rule.user_category;
      if (rule.department_id) return String(u.department_id || '') === String(rule.department_id);
      if (rule.job_grade)     return (u.job_grade || '') === rule.job_grade;
      return true; // everyone
    });

    const actorRole = user?.role;
    const isAdmin   = actorRole === 'HR_ADMIN' || actorRole === 'SUPER_ADMIN';
    const isHod     = actorRole === 'HOD';
    const isMgr     = actorRole === 'MANAGER' || actorRole === 'MGR2';
    const myId      = user?.id;

    for (const u of matchedByTarget) {
      if (isAdmin) {
        direct.push(u);
        continue;
      }
      if (isHod) {
        const isDirect   = String(u.direct_manager_id || '') === String(myId) ||
                           String(u.hod_id || '') === String(myId);
        if (isDirect) { direct.push(u); continue; }
        const dm = u.direct_manager_id ? usersById[u.direct_manager_id] : null;
        if (dm && String(dm.direct_manager_id || '') === String(myId)) {
          indirect.push(u);
        }
        continue;
      }
      if (isMgr) {
        if (String(u.direct_manager_id || '') === String(myId)) direct.push(u);
      }
    }
    return { direct, indirect, total: direct.length + indirect.length };
  };

  // Detect cross-rule conflicts using existing saved rules + creator_role
  const rulesByEmployee = useMemo(() => {
    const map: Record<string, any[]> = {};
    const universe = (allUsers as any[]).filter((u: any) => u.is_active !== false);
    for (const rule of (fetchedRules as any[])) {
      if ((rule.label || '') === 'GLOBAL_MIN') continue;
      const matched = universe.filter((u: any) => {
        if (rule.group_id) {
          const members: string[] = (allGroupMembers as any)[rule.group_id] || [];
          return members.includes(u.id);
        }
        if (rule.hierarchy)     return (u.hierarchy || '') === rule.hierarchy;
        if (rule.user_category) return (u.category  || '') === rule.user_category;
        if (rule.department_id) return String(u.department_id || '') === String(rule.department_id);
        if (rule.job_grade)     return (u.job_grade || '') === rule.job_grade;
        return true;
      });
      for (const u of matched) {
        (map[u.id] ||= []).push(rule);
      }
    }
    return map;
  }, [fetchedRules, allUsers, allGroupMembers]);

  const conflictBanner = useMemo(() => {
    const overlaps = Object.entries(rulesByEmployee).filter(([, rs]) => (rs as any[]).length > 1);
    if (overlaps.length === 0) return null;
    const names = overlaps
      .map(([uid]) => usersById[uid]?.full_name)
      .filter(Boolean)
      .slice(0, 6);
    return {
      count: overlaps.length,
      names,
      moreCount: Math.max(0, overlaps.length - names.length),
    };
  }, [rulesByEmployee, usersById]);

  if ((fetchedRules as any[]).length > 0 && initialized !== cycleId) {
    setRules((fetchedRules as any[]).filter((r: any) => r.label !== 'GLOBAL_MIN'));
    setInitialized(cycleId);
  }

  const saveMutation = useMutation({
    mutationFn: () => kpisApi.setWeightRules(cycleId, rules),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['weight-rules', cycleId] });
      setSaved(true);
      setSaveError('');
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e: any) => {
      setSaveError(e?.response?.data?.detail || 'Failed to save');
    },
  });

  async function handleCopy() {
    if (!copyFrom) return;
    setCopying(true);
    try {
      await (kpisApi as any).copyWeightRules(cycleId, copyFrom);
      const res = await kpisApi.getWeightRules(cycleId);
      setRules(res.data);
      qc.invalidateQueries({ queryKey: ['weight-rules', cycleId] });
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Copy failed');
    } finally {
      setCopying(false);
    }
  }

  async function handleCheckConflicts() {
    setChecking(true);
    try {
      const res = await (kpisApi as any).checkConflicts(cycleId);
      setConflicts(res.data.conflicts);
    } catch {
      alert('Failed to check conflicts');
    } finally {
      setChecking(false);
    }
  }

  function addRule() {
    setSaveError('');
    setRules(p => [...p, {
      label: 'New Rule', target_type: 'everyone',
      group_id: null, hierarchy: null, user_category: null,
      department_id: null, job_grade: null, priority: 0,
      dimensions: {
        'Financials':           { min: 0, max: 100 },
        'Customer':             { min: 0, max: 100 },
        'Internal Process':     { min: 0, max: 100 },
        'Learning & Growth':    { min: 0, max: 100 },
        'Leadership & Culture': { min: 0, max: 100 },
      },
    }]);
  }

  function removeRule(i: number) {
    setSaveError('');
    setRules(p => p.filter((_, j) => j !== i));
  }

  function updateRule(i: number, field: string, value: any) {
    setSaveError('');
    setRules(p => p.map((r, j) => j === i ? { ...r, [field]: value } : r));
  }

  function updateDim(ruleIdx: number, dim: string, field: 'min' | 'max', value: number) {
    setSaveError('');
    setRules(p => p.map((r, j) => j === ruleIdx ? {
      ...r,
      dimensions: { ...r.dimensions, [dim]: { ...r.dimensions[dim], [field]: value } },
    } : r));
  }

  function getTargetType(rule: any): string {
    if (rule.target_type) return rule.target_type;
    if (rule.group_id)      return 'group';
    if (rule.hierarchy)     return 'hierarchy';
    if (rule.user_category) return 'category';
    if (rule.job_grade)     return 'grade';
    return 'everyone';
  }

  function setTargetType(i: number, type: string) {
    setSaveError('');
    setRules(p => p.map((r, j) => j !== i ? r : {
      ...r, target_type: type,
      group_id: null, hierarchy: null, user_category: null,
      department_id: null, job_grade: null,
    }));
  }

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: C.text }}>
          Weight Rules
        </h1>
        <p style={{ fontSize: 13, color: C.textSecond }}>
          Configure KPI weight constraints by employee group
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
          onChange={e => { setCycleId(e.target.value); setInitialized(''); }}
          style={{ width: '100%', padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 15, fontWeight: 600, background: C.bg, color: cycleId ? C.text : C.textTertiary, fontFamily: C.font, outline: 'none', cursor: 'pointer' }}>
          <option value="">Select a performance cycle to begin…</option>
          {sortedCycles.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {cycleId && conflictBanner && (
        <div style={{ background: C.bgWarning, border: `1px solid #fde68a`, borderRadius: 10, padding: 14, marginBottom: 12, color: '#854d0e', fontSize: 13 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            ⚠ {conflictBanner.count} employee(s) match multiple rules
          </div>
          <div style={{ fontSize: 12 }}>
            The highest-priority rule (HR Admin &gt; HOD &gt; Manager) will apply. Affected: {conflictBanner.names.join(', ')}
            {conflictBanner.moreCount > 0 && ` and ${conflictBanner.moreCount} more`}
            {(user?.role === 'MANAGER' || user?.role === 'MGR2' || user?.role === 'HOD') && (
              <span> — your rule may be overridden by a higher-priority rule for these employees.</span>
            )}
          </div>
        </div>
      )}

      {cycleId && (
        <div>
          {/* Copy from previous cycle */}
          <div style={{ background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.text, flexShrink: 0 }}>
              Copy rules from:
            </div>
            <select style={{ ...S.input, flex: 1, minWidth: 200 }}
              value={copyFrom} onChange={e => setCopyFrom(e.target.value)}>
              <option value="">Select a previous cycle...</option>
              {otherCycles.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button onClick={handleCopy} disabled={!copyFrom || copying}
              style={{ ...S.btnPrimary, opacity: !copyFrom ? 0.5 : 1 }}>
              {copying ? 'Copying...' : 'Copy Rules'}
            </button>
          </div>

          {/* Rules */}
          {rules.map((rule: any, i: number) => {
            const targetType = getTargetType(rule);
            const totalMin = DIMENSIONS.reduce((s, d) => s + (rule.dimensions?.[d]?.min || 0), 0);
            const totalMax = DIMENSIONS.reduce((s, d) => s + (rule.dimensions?.[d]?.max || 0), 0);
            const validMin = totalMin <= 100;
            const validMax = totalMax >= 100;

            return (
              <div key={i} style={{ background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <label style={S.label}>Rule Label</label>
                    <input style={S.input} value={rule.label || ''}
                      onChange={e => updateRule(i, 'label', e.target.value)}
                      placeholder="e.g. Corporate Staff" />
                  </div>
                  <div style={{ width: 160 }}>
                    <label style={S.label}>Applies To</label>
                    <select style={S.input} value={targetType}
                      onChange={e => setTargetType(i, e.target.value)}>
                      {TARGET_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  {targetType === 'group' && (
                    <div style={{ width: 180 }}>
                      <label style={S.label}>Group</label>
                      <select style={S.input} value={rule.group_id || ''}
                        onChange={e => updateRule(i, 'group_id', e.target.value || null)}>
                        <option value="">Select group...</option>
                        {(groups as any[]).map((g: any) => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {targetType === 'hierarchy' && (
                    <div style={{ width: 140 }}>
                      <label style={S.label}>Hierarchy</label>
                      <input style={S.input} value={rule.hierarchy || ''}
                        onChange={e => updateRule(i, 'hierarchy', e.target.value)}
                        placeholder="e.g. Apex-1" />
                    </div>
                  )}
                  {targetType === 'category' && (
                    <div style={{ width: 160 }}>
                      <label style={S.label}>Employee Category</label>
                      <input style={S.input} value={rule.user_category || ''}
                        onChange={e => updateRule(i, 'user_category', e.target.value)}
                        placeholder="e.g. Corporate Staff" />
                    </div>
                  )}
                  {targetType === 'grade' && (
                    <div style={{ width: 100 }}>
                      <label style={S.label}>Job Grade</label>
                      <input style={S.input} value={rule.job_grade || ''}
                        onChange={e => updateRule(i, 'job_grade', e.target.value)}
                        placeholder="e.g. G2" />
                    </div>
                  )}
                  <div style={{ width: 70 }}>
                    <label style={S.label}>Priority</label>
                    <input style={S.input} type="number" min={0}
                      value={rule.priority || 0}
                      onChange={e => updateRule(i, 'priority', Number(e.target.value))} />
                  </div>
                  <button onClick={() => removeRule(i)}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: C.textTertiary, padding: '0 4px', marginBottom: 2 }}>
                    ✕
                  </button>
                </div>

                <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: C.bgSecondary }}>
                        <th style={S.th}>KPI Dimension</th>
                        <th style={{ ...S.th, width: 120 }}>Min %</th>
                        <th style={{ ...S.th, width: 120 }}>Max %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {DIMENSIONS.map((dim, di, arr) => (
                        <tr key={dim} style={{ background: C.bg }}>
                          <td style={{ ...S.td, fontWeight: 500, borderBottom: di < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                            {dim}
                          </td>
                          <td style={{ ...S.td, borderBottom: di < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                            <input type="number" min={0} max={100}
                              style={{ ...S.input, width: 80 }}
                              value={rule.dimensions?.[dim]?.min ?? 0}
                              onChange={e => updateDim(i, dim, 'min', Number(e.target.value))} />
                          </td>
                          <td style={{ ...S.td, borderBottom: di < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                            <input type="number" min={0} max={100}
                              style={{ ...S.input, width: 80 }}
                              value={rule.dimensions?.[dim]?.max ?? 100}
                              onChange={e => updateDim(i, dim, 'max', Number(e.target.value))} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: C.bgSecondary }}>
                        <td style={{ ...S.td, fontWeight: 600, color: C.text }}>Total</td>
                        <td style={S.td}>
                          <span style={{ fontWeight: 600, color: validMin ? '#166534' : '#991b1b' }}>
                            {totalMin}%
                          </span>
                          {!validMin && <span style={{ fontSize: 10, color: '#991b1b', marginLeft: 4 }}>(must be ≤100%)</span>}
                        </td>
                        <td style={S.td}>
                          <span style={{ fontWeight: 600, color: validMax ? '#166534' : '#991b1b' }}>
                            {totalMax}%
                          </span>
                          {!validMax && <span style={{ fontSize: 10, color: '#991b1b', marginLeft: 4 }}>(must be ≥100%)</span>}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Coverage section */}
                {(() => {
                  const cov = computeCoverage(rule);
                  const expanded = !!expandedCoverage[i];
                  return (
                    <div style={{ marginTop: 12, padding: '10px 12px', background: C.bgSecondary, borderRadius: 8, border: `1px solid ${C.borderLight}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecond, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Coverage — Applies to {cov.total} employee{cov.total === 1 ? '' : 's'}
                        </div>
                        {cov.total > 0 && (
                          <button
                            onClick={() => setExpandedCoverage(p => ({ ...p, [i]: !p[i] }))}
                            style={{ ...S.btnSm, padding: '4px 10px', fontSize: 11 }}>
                            {expanded ? 'Hide' : 'Show'} list
                          </button>
                        )}
                      </div>
                      {expanded && cov.total > 0 && (
                        <div style={{ marginTop: 10, fontSize: 12, color: C.text }}>
                          <div style={{ marginBottom: cov.indirect.length ? 8 : 0 }}>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>
                              Direct reports ({cov.direct.length})
                            </div>
                            <div style={{ color: C.textSecond }}>
                              {cov.direct.length === 0
                                ? '—'
                                : cov.direct.map((u: any) => u.full_name).join(', ')}
                            </div>
                          </div>
                          {(user?.role === 'HOD' || cov.indirect.length > 0) && (
                            <div>
                              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                Indirect reports — 2 levels ({cov.indirect.length})
                              </div>
                              <div style={{ color: C.textSecond }}>
                                {cov.indirect.length === 0
                                  ? '—'
                                  : cov.indirect.map((u: any) => u.full_name).join(', ')}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}

          <button onClick={addRule}
            style={{ ...S.btnSm, width: '100%', padding: '10px', borderStyle: 'dashed', marginBottom: 12 }}>
            + Add Weight Rule
          </button>

          {/* Conflict checker */}
          <div style={{ background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: conflicts.length > 0 ? 12 : 0 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>Conflict Check</div>
                <div style={{ fontSize: 12, color: C.textSecond, marginTop: 2 }}>
                  Check if any employee matches more than one rule
                </div>
              </div>
              <button onClick={handleCheckConflicts} disabled={checking} style={S.btnSm}>
                {checking ? 'Checking...' : 'Check Conflicts'}
              </button>
            </div>
            {conflicts.length === 0 && !checking && (
              <div style={{ fontSize: 12, color: '#166534', marginTop: 8 }}>✓ No conflicts detected</div>
            )}
            {conflicts.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color: '#991b1b', fontWeight: 600, marginBottom: 8 }}>
                  ⚠ {conflicts.length} employee(s) match multiple rules:
                </div>
                {conflicts.map((c: any) => (
                  <div key={c.user_id} style={{ padding: '8px 10px', marginBottom: 4, background: '#fee2e2', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                    <strong>{c.full_name}</strong> ({c.employee_id}) matches: {c.rules.join(', ')}
                  </div>
                ))}
                <div style={{ fontSize: 11, color: C.textSecond, marginTop: 8 }}>
                  Resolve by adjusting rule targets or increasing priority on the preferred rule.
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
              style={S.btnPrimary}>
              {saveMutation.isPending ? 'Saving...' : 'Save All Rules'}
            </button>
            {saved && <span style={{ fontSize: 12, color: '#166534', fontWeight: 500 }}>✓ Saved</span>}
          </div>
          {saveError && (
            <div style={{
              marginTop: 10, padding: '10px 12px',
              background: '#fee2e2', border: `1px solid #fca5a5`,
              borderRadius: 8, fontSize: 13, color: '#991b1b',
            }}>
              {saveError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
