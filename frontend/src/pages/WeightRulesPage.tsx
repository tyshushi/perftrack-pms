import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kpisApi, cyclesApi, groupsApi, departmentsApi } from '../api/client';

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

export default function WeightRulesPage() {
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState('');
  const [conflicts, setConflicts]   = useState<any[]>([]);
  const [copyFrom,  setCopyFrom]    = useState('');
  const [saved,     setSaved]       = useState(false);
  const [checking,  setChecking]    = useState(false);
  const [copying,   setCopying]     = useState(false);
  const [rules,     setRules]       = useState<any[]>([]);
  const [globalMin, setGlobalMin]   = useState(0);
  const [initialized, setInitialized] = useState('');

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

  if ((fetchedRules as any[]).length > 0 && initialized !== cycleId) {
    const globalMinRule = (fetchedRules as any[]).find((r: any) => r.label === 'GLOBAL_MIN');
    if (globalMinRule) {
      setGlobalMin(globalMinRule.dimensions?.['Financials']?.min ?? 0);
    } else {
      setGlobalMin(0);
    }
    setRules((fetchedRules as any[]).filter((r: any) => r.label !== 'GLOBAL_MIN'));
    setInitialized(cycleId);
  }

  const GLOBAL_MIN_RULE = {
    label:         'GLOBAL_MIN',
    target_type:   'everyone',
    group_id:      null,
    hierarchy:     null,
    user_category: null,
    department_id: null,
    job_grade:     null,
    priority:      999,
    dimensions: {
      'Financials':           { min: globalMin, max: 100 },
      'Customer':             { min: globalMin, max: 100 },
      'Internal Process':     { min: globalMin, max: 100 },
      'Learning & Growth':    { min: globalMin, max: 100 },
      'Leadership & Culture': { min: globalMin, max: 100 },
    },
  };

  const saveMutation = useMutation({
    mutationFn: () => kpisApi.setWeightRules(cycleId, [...rules, GLOBAL_MIN_RULE]),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['weight-rules', cycleId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
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
    setRules(p => p.filter((_, j) => j !== i));
  }

  function updateRule(i: number, field: string, value: any) {
    setRules(p => p.map((r, j) => j === i ? { ...r, [field]: value } : r));
  }

  function updateDim(ruleIdx: number, dim: string, field: 'min' | 'max', value: number) {
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

      {cycleId && (
        <div>
          {/* Global Minimum */}
          <div style={{ background: C.bgInfo, border: `1px solid #bae6fd`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 4 }}>
              Global Minimum Weight per KPI
            </div>
            <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 12 }}>
              This overrides all other rules. No individual KPI can be set below this weight.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ ...S.label, marginBottom: 0, whiteSpace: 'nowrap' }}>
                Minimum weight for any single KPI (%)
              </label>
              <input type="number" min={0} max={100}
                style={{ ...S.input, width: 90 }}
                value={globalMin}
                onChange={e => setGlobalMin(Number(e.target.value))} />
            </div>
          </div>

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
            {saveMutation.isError && <span style={{ fontSize: 12, color: '#991b1b' }}>Failed to save</span>}
          </div>
        </div>
      )}
    </div>
  );
}
