import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth';
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

const CATEGORIES = [
  'Financials',
  'Customer',
  'Internal Process',
  'Learning & Growth',
  'Leadership & Culture',
];

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  DRAFT:       { bg: '#f5f5f3', color: '#555',    label: 'Draft' },
  PENDING_DM:  { bg: '#fef9c3', color: '#854d0e', label: 'Pending Manager' },
  APPROVED:    { bg: '#dcfce7', color: '#166534', label: 'Approved' },
  REJECTED:    { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
  LOCKED:      { bg: '#e0f2fe', color: '#0c4a6e', label: 'Locked' },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.DRAFT;
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px',
      borderRadius: 10, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

// ── Weight Rules Panel ─────────────────────────────────────────────────────

function WeightRulesPanel({
  cycleId,
  cycles,
  groups,
  depts,
}: {
  cycleId: string;
  cycles:  any[];
  groups:  any[];
  depts:   any[];
}) {
  const qc = useQueryClient();
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [copyFrom, setCopyFrom] = useState('');
  const [saved,    setSaved]   = useState(false);
  const [checking, setChecking] = useState(false);
  const [copying,  setCopying] = useState(false);

  const { data: fetchedRules = [] } = useQuery({
    queryKey: ['weight-rules', cycleId],
    queryFn:  () => kpisApi.getWeightRules(cycleId).then(r => r.data),
    enabled:  !!cycleId,
  });

  // Sync fetched rules into local editable state
  const [rules, setRules] = useState<any[]>([]);
  const [initialized, setInitialized] = useState('');

  if (fetchedRules.length > 0 && initialized !== cycleId) {
    setRules(fetchedRules);
    setInitialized(cycleId);
  }

  const saveMutation = useMutation({
    mutationFn: () => kpisApi.setWeightRules(cycleId, rules),
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
      await kpisApi.copyWeightRules(cycleId, copyFrom);
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
      const res = await kpisApi.checkConflicts(cycleId);
      setConflicts(res.data.conflicts);
    } catch {
      alert('Failed to check conflicts');
    } finally {
      setChecking(false);
    }
  }

  function addRule() {
    setRules(p => [...p, {
      label:         'New Rule',
      target_type:   'everyone',
      group_id:      null,
      hierarchy:     null,
      user_category: null,
      department_id: null,
      job_grade:     null,
      priority:      0,
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
      ...r,
      target_type:   type,
      group_id:      null,
      hierarchy:     null,
      user_category: null,
      department_id: null,
      job_grade:     null,
    }));
  }

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

  const otherCycles = cycles.filter(c => c.id !== cycleId);

  return (
    <div style={{ fontFamily: C.font }}>

      {/* Copy from previous cycle */}
      <div style={{ background: C.bg, border: `1px solid ${C.borderLight}`,
        borderRadius: 10, padding: 16, marginBottom: 12,
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
          <div key={i} style={{ background: C.bg, border: `1px solid ${C.borderLight}`,
            borderRadius: 10, padding: 16, marginBottom: 12 }}>

            {/* Rule header */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 14,
              alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
                    {groups.map((g: any) => (
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
                style={{ border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: 18, color: C.textTertiary,
                  padding: '0 4px', marginBottom: 2 }}>✕</button>
            </div>

            {/* Dimension table */}
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
                      <td style={{ ...S.td, fontWeight: 500,
                        borderBottom: di < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                        {dim}
                      </td>
                      <td style={{ ...S.td,
                        borderBottom: di < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                        <input type="number" min={0} max={100}
                          style={{ ...S.input, width: 80 }}
                          value={rule.dimensions?.[dim]?.min ?? 0}
                          onChange={e => updateDim(i, dim, 'min', Number(e.target.value))} />
                      </td>
                      <td style={{ ...S.td,
                        borderBottom: di < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
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

      {/* Add rule */}
      <button onClick={addRule}
        style={{ ...S.btnSm, width: '100%', padding: '10px',
          borderStyle: 'dashed', marginBottom: 12 }}>
        + Add Weight Rule
      </button>

      {/* Conflict checker */}
      <div style={{ background: C.bg, border: `1px solid ${C.borderLight}`,
        borderRadius: 10, padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: conflicts.length > 0 ? 12 : 0 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>
              Conflict Check
            </div>
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
              <div key={c.user_id} style={{ padding: '8px 10px', marginBottom: 4,
                background: '#fee2e2', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                <strong>{c.full_name}</strong> ({c.employee_id}) matches: {c.rules.join(', ')}
              </div>
            ))}
            <div style={{ fontSize: 11, color: C.textSecond, marginTop: 8 }}>
              Resolve by adjusting rule targets or increasing priority on the preferred rule.
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
          style={S.btnPrimary}>
          {saveMutation.isPending ? 'Saving...' : 'Save All Rules'}
        </button>
        {saved && <span style={{ fontSize: 12, color: '#166534', fontWeight: 500 }}>✓ Saved</span>}
        {saveMutation.isError && <span style={{ fontSize: 12, color: '#991b1b' }}>Failed to save</span>}
      </div>
    </div>
  );
}

// ── Cascade KPI Panel ──────────────────────────────────────────────────────

function CascadePanel({
  cycleId, users, currentUserId,
}: {
  cycleId: string; users: any[]; currentUserId: string;
}) {
  const qc = useQueryClient();
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [kpi_dimension,    setkpi_dimension]    = useState('Core');
  const [weight,      setWeight]      = useState(0);
  const [target,      setTarget]      = useState('');
  const [measurement, setMeasurement] = useState('');
  const [search,      setSearch]      = useState('');
  const [selected,    setSelected]    = useState<string[]>([]);
  const [result,      setResult]      = useState<any>(null);

  const { data: weightRules = [] } = useQuery({
    queryKey: ['weight-rules', cycleId],
    queryFn:  () => kpisApi.getWeightRules(cycleId).then(r => r.data),
    enabled:  !!cycleId,
  });

  const [dimension, setDimension] = useState('Financials');

  
  const rule = (weightRules as any[]).find((r: any) => r.kpi_dimension === kpi_dimension);

  const eligibleUsers = users.filter(u =>
    u.id !== currentUserId && u.is_active !== false
  );

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return eligibleUsers;
    return eligibleUsers.filter(u =>
      u.full_name.toLowerCase().includes(q) ||
      u.employee_id.toLowerCase().includes(q) ||
      (u.department_name || '').toLowerCase().includes(q)
    );
  }, [search, eligibleUsers]);

  function toggleUser(id: string) {
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

  const cascadeMutation = useMutation({
    mutationFn: () => kpisApi.cascade({
      cycle_id:     cycleId,
      name, description, kpi_dimension, weight, target, measurement,
      employee_ids: selected,
    }),
    onSuccess: (res) => {
      setResult(res.data);
      qc.invalidateQueries({ queryKey: ['kpis'] });
      setName(''); setDescription(''); setTarget('');
      setMeasurement(''); setSelected([]); setSearch('');
    },
  });

  return (
    <div style={S.card}>
      <div style={{ fontWeight: 500, marginBottom: 4,
        color: C.text }}>
        Cascade KPI
      </div>
      <div style={{ fontSize: 12, color: C.textSecond,
        marginBottom: 14 }}>
        Push a KPI to specific employees. It will appear as Approved
        in their KPI list. They can adjust the weight within the
        allowed range.
      </div>

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
          <label style={S.label}>kpi_dimension</label>
          <select style={S.input} value={kpi_dimension}
            onChange={e => setkpi_dimension(e.target.value)}>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.label}>
            Weight %
            {rule && (
              <span style={{ fontWeight: 400, color: C.textTertiary,
                marginLeft: 6 }}>
                (allowed: {rule.min_weight}–{rule.max_weight}%)
              </span>
            )}
          </label>
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

      {/* Employee selector */}
      <div style={{ marginTop: 4 }}>
        <label style={S.label}>
          Select Employees ({selected.length} selected)
        </label>
        <input style={{ ...S.input, marginBottom: 8 }}
          placeholder="Search by name, code, or department..."
          value={search} onChange={e => setSearch(e.target.value)} />

        <div style={{ border: '0.5px solid var(--color-border-tertiary)',
          borderRadius: 8, maxHeight: 220, overflowY: 'auto' }}>
          {filteredUsers.length === 0 && (
            <div style={{ padding: 16, textAlign: 'center',
              color: C.textTertiary, fontSize: 13 }}>
              No employees found
            </div>
          )}
          {filteredUsers.map((u: any, i: number) => (
            <div key={u.id}
              onClick={() => toggleUser(u.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', cursor: 'pointer',
                borderBottom: i < filteredUsers.length - 1
                  ? '0.5px solid var(--color-border-tertiary)' : 'none',
                background: selected.includes(u.id)
                  ? '#f0fdf4' : 'transparent' }}
              onMouseEnter={e => {
                if (!selected.includes(u.id))
                  e.currentTarget.style.background =
                    C.bgSecondary;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background =
                  selected.includes(u.id) ? '#f0fdf4' : 'transparent';
              }}>
              <input type="checkbox" readOnly
                checked={selected.includes(u.id)}
                style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500,
                  color: C.text }}>
                  {u.full_name}
                </div>
                <div style={{ fontSize: 11,
                  color: C.textSecond }}>
                  {u.employee_id}
                  {u.position_title ? ` · ${u.position_title}` : ''}
                </div>
              </div>
              {selected.includes(u.id) && (
                <span style={{ fontSize: 11, color: '#166534',
                  fontWeight: 500 }}>✓</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button style={S.btnSm}
            onClick={() => setSelected(filteredUsers.map(u => u.id))}>
            Select all
          </button>
          <button style={S.btnSm} onClick={() => setSelected([])}>
            Clear
          </button>
        </div>
      </div>

      {result && (
        <div style={{ marginTop: 12, padding: '8px 12px',
          background: '#dcfce7', borderRadius: 8,
          fontSize: 12, color: '#166534' }}>
          ✓ {result.message}
        </div>
      )}

      {cascadeMutation.isError && (
        <div style={{ marginTop: 12, padding: '8px 12px',
          background: '#fee2e2', borderRadius: 8,
          fontSize: 12, color: '#991b1b' }}>
          {(cascadeMutation.error as any)?.response?.data?.detail || 'Failed to cascade'}
        </div>
      )}

      <button
        onClick={() => cascadeMutation.mutate()}
        disabled={!name || !target || selected.length === 0
          || cascadeMutation.isPending}
        style={{ ...S.btnPrimary, marginTop: 12,
          opacity: (!name || !target || selected.length === 0) ? 0.5 : 1 }}>
        {cascadeMutation.isPending
          ? 'Cascading...'
          : `Cascade to ${selected.length} employee(s)`}
      </button>
    </div>
  );
}

// ── Staff KPI List ─────────────────────────────────────────────────────────

function StaffKpiList({
  cycleId, userId, weightRules,
}: {
  cycleId: string; userId: string; weightRules: any[];
}) {
  const qc = useQueryClient();
  const [adding, setAdding]   = useState(false);
  const [name,   setName]     = useState('');
  const [desc,   setDesc]     = useState('');
  const [cat,    setCat]      = useState('Optional');
  const [weight, setWeight]   = useState(0);
  const [target, setTarget]   = useState('');
  const [meas,   setMeas]     = useState('');

  const { data: kpis = [] } = useQuery({
    queryKey: ['kpis', cycleId, userId],
    queryFn:  () => kpisApi.list(cycleId, userId).then(r => r.data),
    enabled:  !!cycleId,
  });

  const createMutation = useMutation({
    mutationFn: () => kpisApi.create({
      cycle_id: cycleId, name, description: desc,
      kpi_dimension: cat, weight, target, measurement: meas,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kpis', cycleId, userId] });
      setAdding(false);
      setName(''); setDesc(''); setTarget(''); setMeas('');
      setWeight(0);
    },
  });

  const submitMutation = useMutation({
    mutationFn: (id: string) => kpisApi.submit(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['kpis', cycleId, userId] }),
  });

  const adjustMutation = useMutation({
    mutationFn: ({ id, weight }: { id: string; weight: number }) =>
      kpisApi.adjustWeight(id, weight),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kpis', cycleId, userId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => kpisApi.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['kpis', cycleId, userId] }),
  });

  // Calculate totals
  const totalWeight = (kpis as any[]).reduce((sum, k) => sum + k.weight, 0);
  const bykpi_dimension  = CATEGORIES.map(cat => ({
    cat,
    total:   (kpis as any[]).filter(k => k.kpi_dimension === cat)
                             .reduce((s, k) => s + k.weight, 0),
    rule:    weightRules.find((r: any) => r.kpi_dimension === cat),
  }));

  const rule = weightRules.find((r: any) => r.kpi_dimension === cat);

  return (
    <div>
      {/* Weight summary */}
      <div style={{ ...S.card, marginBottom: 12 }}>
        <div style={{ fontWeight: 500, marginBottom: 10,
          color: C.text }}>
          Weight Summary
        </div>
        <div style={{ display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 8, marginBottom: 10 }}>
          {bykpi_dimension.map(({ cat, total, rule }) => {
            const ok = !rule ||
              (total >= (rule.min_weight || 0) &&
               total <= (rule.max_weight || 100));
            return (
              <div key={cat} style={{ padding: '10px 12px', borderRadius: 8,
                background: ok
                  ? C.bgSecondary
                  : '#fee2e2',
                border: `0.5px solid ${ok
                  ? 'var(--color-border-tertiary)'
                  : '#fca5a5'}` }}>
                <div style={{ fontSize: 11,
                  color: C.textSecond,
                  marginBottom: 4 }}>{cat}</div>
                <div style={{ fontSize: 20, fontWeight: 500,
                  color: ok ? C.text : '#991b1b' }}>
                  {total}%
                </div>
                {rule && (
                  <div style={{ fontSize: 10,
                    color: ok ? C.textTertiary : '#991b1b' }}>
                    Range: {rule.min_weight}–{rule.max_weight}%
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', paddingTop: 8,
          borderTop: '0.5px solid var(--color-border-tertiary)' }}>
          <span style={{ fontSize: 13,
            color: C.textSecond }}>Total</span>
          <span style={{ fontSize: 16, fontWeight: 600,
            color: totalWeight === 100 ? '#166534' : '#991b1b' }}>
            {totalWeight}%
            {totalWeight !== 100 && (
              <span style={{ fontSize: 11, marginLeft: 6 }}>
                (must equal 100%)
              </span>
            )}
          </span>
        </div>
      </div>

      {/* KPI list */}
      {(kpis as any[]).map((kpi: any) => (
        <KpiCard
          key={kpi.id}
          kpi={kpi}
          weightRules={weightRules}
          onSubmit={() => submitMutation.mutate(kpi.id)}
          onDelete={() => deleteMutation.mutate(kpi.id)}
          onAdjustWeight={(w) => adjustMutation.mutate({ id: kpi.id, weight: w })}
        />
      ))}

      {(kpis as any[]).length === 0 && !adding && (
        <div style={{ textAlign: 'center', padding: 32,
          color: C.textSecond, fontSize: 13,
          border: `0.5px dashed ${C.border}`,
          borderRadius: 10 }}>
          No KPIs yet. Add your first KPI or wait for your manager to
          cascade KPIs to you.
        </div>
      )}

      {/* Add optional KPI form */}
      {adding && (
        <div style={S.card}>
          <div style={{ fontWeight: 500, marginBottom: 12,
            color: C.text }}>
            Add Optional KPI
          </div>
          <div style={S.grid2}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>KPI Name</label>
              <input style={S.input} value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Complete AWS certification" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Description</label>
              <textarea style={{ ...S.input, minHeight: 54, resize: 'vertical' }}
                value={desc} onChange={e => setDesc(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>kpi_dimension</label>
              <select style={S.input} value={cat}
                onChange={e => setCat(e.target.value)}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={S.label}>
                Weight %
                {rule && (
                  <span style={{ fontWeight: 400,
                    color: C.textTertiary, marginLeft: 6 }}>
                    (allowed: {rule.min_weight}–{rule.max_weight}%)
                  </span>
                )}
              </label>
              <input style={S.input} type="number" min={0} max={100}
                value={weight}
                onChange={e => setWeight(Number(e.target.value))} />
            </div>
            <div>
              <label style={S.label}>Target</label>
              <input style={S.input} value={target}
                onChange={e => setTarget(e.target.value)}
                placeholder="e.g. Pass exam by Q3" />
            </div>
            <div>
              <label style={S.label}>Measurement</label>
              <input style={S.input} value={meas}
                onChange={e => setMeas(e.target.value)}
                placeholder="e.g. Certificate obtained" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => createMutation.mutate()}
              disabled={!name || !target || createMutation.isPending}
              style={{ ...S.btnPrimary,
                opacity: (!name || !target) ? 0.5 : 1 }}>
              {createMutation.isPending ? 'Adding...' : 'Add KPI'}
            </button>
            <button onClick={() => setAdding(false)} style={S.btnSm}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!adding && (
        <button onClick={() => setAdding(true)}
          style={{ ...S.btnSm, width: '100%', padding: '10px',
            borderStyle: 'dashed', marginTop: 8 }}>
          + Add Optional KPI
        </button>
      )}
    </div>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  kpi, weightRules, onSubmit, onDelete, onAdjustWeight,
}: {
  kpi:            any;
  weightRules:    any[];
  onSubmit:       () => void;
  onDelete:       () => void;
  onAdjustWeight: (w: number) => void;
}) {
  const [editWeight, setEditWeight] = useState(false);
  const [newWeight,  setNewWeight]  = useState(kpi.weight);
  const rule = weightRules.find((r: any) => r.kpi_dimension === kpi.kpi_dimension);
  const isFixed    = kpi.kpi_type === 'FIXED';
  const canEdit    = kpi.status === 'DRAFT' || kpi.status === 'REJECTED';
  const canSubmit  = kpi.status === 'DRAFT' || kpi.status === 'REJECTED';
  const canDelete  = kpi.status === 'DRAFT' && !isFixed;

  return (
    <div style={{ ...S.card, marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center',
            gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 500, fontSize: 14,
              color: C.text }}>{kpi.name}</span>
            {isFixed && (
              <span style={{ fontSize: 10, padding: '1px 6px',
                borderRadius: 6, background: '#e0f2fe',
                color: '#0369a1', fontWeight: 500 }}>
                Cascaded
              </span>
            )}
          </div>
          {kpi.description && (
            <div style={{ fontSize: 12,
              color: C.textSecond, marginBottom: 4 }}>
              {kpi.description}
            </div>
          )}
          <div style={{ fontSize: 12, color: C.textSecond }}>
            {kpi.kpi_dimension} · Target: {kpi.target}
            {kpi.measurement ? ` · ${kpi.measurement}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column',
          alignItems: 'flex-end', gap: 6, flexShrink: 0, marginLeft: 12 }}>
          <StatusPill status={kpi.status} />
          <div style={{ fontSize: 18, fontWeight: 600,
            color: C.text }}>
            {kpi.weight}%
          </div>
        </div>
      </div>

      {/* Weight adjustment for cascaded KPIs */}
      {isFixed && kpi.status !== 'LOCKED' && (
        <div style={{ marginTop: 8 }}>
          {!editWeight ? (
            <button onClick={() => { setEditWeight(true); setNewWeight(kpi.weight); }}
              style={{ fontSize: 11, padding: '3px 8px',
                border: `0.5px solid ${C.border}`,
                borderRadius: 6, background: 'transparent',
                cursor: 'pointer', color: C.textSecond,
                fontFamily: 'var(--font-sans)' }}>
              Adjust weight
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="number" min={rule?.min_weight || 0}
                max={rule?.max_weight || 100}
                style={{ ...S.input, width: 70 }}
                value={newWeight}
                onChange={e => setNewWeight(Number(e.target.value))} />
              <span style={{ fontSize: 12,
                color: C.textSecond }}>%</span>
              {rule && (
                <span style={{ fontSize: 11,
                  color: C.textTertiary }}>
                  ({rule.min_weight}–{rule.max_weight}%)
                </span>
              )}
              <button onClick={() => {
                onAdjustWeight(newWeight); setEditWeight(false);
              }} style={S.btnPrimary}>Save</button>
              <button onClick={() => setEditWeight(false)}
                style={S.btnSm}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {/* Actions for optional KPIs */}
      {!isFixed && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {canSubmit && (
            <button onClick={onSubmit} style={S.btnPrimary}>
              Submit for Approval
            </button>
          )}
          {canDelete && (
            <button onClick={onDelete}
              style={{ ...S.btnSm, color: '#991b1b',
                borderColor: '#fca5a5' }}>
              Delete
            </button>
          )}
          {kpi.status === 'REJECTED' && kpi.mgr_comment && (
            <div style={{ fontSize: 12, color: '#991b1b',
              padding: '3px 8px', background: '#fee2e2',
              borderRadius: 6, alignSelf: 'center' }}>
              Rejected: {kpi.mgr_comment}
            </div>
          )}
        </div>
      )}

      {/* Pending message */}
      {kpi.status === 'PENDING_DM' && (
        <div style={{ marginTop: 8, fontSize: 12,
          color: C.textSecond,
          fontStyle: 'italic' }}>
          Awaiting manager approval...
        </div>
      )}
    </div>
  );
}

// ── Manager Approval Panel ─────────────────────────────────────────────────

function ManagerApprovalPanel({
  cycleId, userId,
}: {
  cycleId: string; userId: string;
}) {
  const qc = useQueryClient();
  const { data: reports = [] } = useQuery({
    queryKey: ['direct-reports'],
    queryFn:  () => usersApi.directReports().then(r => r.data),
  });

  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [comment, setComment] = useState('');

  const { data: kpis = [] } = useQuery({
    queryKey: ['kpis', cycleId, selectedReport?.id],
    queryFn:  () => kpisApi.list(cycleId, selectedReport?.id).then(r => r.data),
    enabled:  !!cycleId && !!selectedReport,
  });

  const pendingKpis = (kpis as any[]).filter(k =>
    k.status === 'PENDING_DM' &&
    selectedReport?.direct_manager_id === userId
  );

  const evalMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      kpisApi.evaluate(id, 0, comment, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kpis'] });
      setComment('');
    },
  });

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: C.textSecond,
          marginBottom: 8 }}>
          Select employee to review their KPIs
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(reports as any[]).filter(r => r.direct_manager_id === userId)
            .map((r: any) => (
              <button key={r.id}
                onClick={() => setSelectedReport(r)}
                style={{ padding: '6px 12px', borderRadius: 8,
                  border: `0.5px solid ${selectedReport?.id === r.id
                    ? C.text
                    : C.border}`,
                  background: selectedReport?.id === r.id
                    ? C.text : 'transparent',
                  color: selectedReport?.id === r.id
                    ? C.bg
                    : C.textSecond,
                  cursor: 'pointer', fontSize: 13,
                  fontFamily: 'var(--font-sans)' }}>
                {r.full_name}
              </button>
            ))}
        </div>
      </div>

      {selectedReport && pendingKpis.length === 0 && (
        <div style={{ textAlign: 'center', padding: 24,
          color: C.textSecond, fontSize: 13 }}>
          No KPIs pending your approval for {selectedReport.full_name}
        </div>
      )}

      {pendingKpis.map((kpi: any) => (
        <div key={kpi.id} style={{ ...S.card, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 500,
                color: C.text }}>{kpi.name}</div>
              <div style={{ fontSize: 12,
                color: C.textSecond, marginTop: 2 }}>
                {kpi.kpi_dimension} · {kpi.weight}% · Target: {kpi.target}
              </div>
            </div>
            {kpi.kpi_type === 'FIXED' && (
              <span style={{ fontSize: 10, padding: '2px 6px',
                borderRadius: 6, background: '#e0f2fe',
                color: '#0369a1', fontWeight: 500, alignSelf: 'flex-start' }}>
                Cascaded (weight adjusted)
              </span>
            )}
          </div>
          <textarea
            placeholder="Comment (optional for approval, required for rejection)..."
            value={comment}
            onChange={e => setComment(e.target.value)}
            style={{ ...S.input, width: '100%', minHeight: 60,
              resize: 'vertical', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => evalMutation.mutate({ id: kpi.id, action: 'approve' })}
              disabled={evalMutation.isPending}
              style={S.btnPrimary}>
              Approve
            </button>
            <button
              onClick={() => evalMutation.mutate({ id: kpi.id, action: 'reject' })}
              disabled={!comment || evalMutation.isPending}
              style={{ ...S.btnSm, color: '#991b1b', borderColor: '#fca5a5',
                opacity: !comment ? 0.5 : 1 }}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function KpiSettingPage() {
  const { user } = useAuthStore();
  const isManager = ['MANAGER', 'MGR2', 'HOD', 'HR_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const isHrAdmin = ['HR_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const [cycleId,  setCycleId]  = useState('');
  const [tab, setTab] = useState<'my-kpis' | 'cascade' | 'approve' | 'weight-rules'>('my-kpis');

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'],
    queryFn:  () => cyclesApi.list().then(r => r.data),
    onSuccess: (d: any[]) => {
      if (d.length && !cycleId) setCycleId(d[0].id);
    },
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn:  () => groupsApi.list().then(r => r.data),
    enabled:  isHrAdmin,
  });

  const { data: depts = [] } = useQuery({
    queryKey: ['depts'],
    queryFn:  () => departmentsApi.list().then(r => r.data),
    enabled:  isHrAdmin,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn:  () => usersApi.list().then(r => r.data),
    enabled:  ['HR_ADMIN', 'SUPER_ADMIN', 'MANAGER', 'MGR2', 'HOD']
                .includes(user?.role || ''),
  });

  const { data: weightRules = [] } = useQuery({
    queryKey: ['weight-rules', cycleId],
    queryFn:  () => kpisApi.getWeightRules(cycleId).then(r => r.data),
    enabled:  !!cycleId,
  });


  const TABS = [
    { key: 'my-kpis',      label: 'My KPIs',      show: true },
    { key: 'approve',      label: 'Approve KPIs',  show: isManager },
    { key: 'cascade',      label: 'Cascade KPIs',  show: isManager },
    { key: 'weight-rules', label: 'Weight Rules',  show: isHrAdmin },
  ].filter(t => t.show);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4,
            color: C.text }}>KPI Setting</h1>
          <p style={{ fontSize: 13,
            color: C.textSecond }}>
            Set, cascade, and approve KPIs for this performance cycle
          </p>
        </div>
        <select style={{ ...S.input, width: 200 }}
          value={cycleId} onChange={e => setCycleId(e.target.value)}>
          <option value="">Select cycle...</option>
          {(cycles as any[]).map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {!cycleId && (
        <div style={{ textAlign: 'center', padding: 48,
          color: C.textSecond, fontSize: 13 }}>
          Select a performance cycle to get started
        </div>
      )}

      {cycleId && (
        <>
          <div style={{ display: 'flex', gap: 2,
            borderBottom: '0.5px solid var(--color-border-tertiary)',
            marginBottom: 20 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key as any)}
                style={{ padding: '8px 16px', border: 'none',
                  background: 'transparent', cursor: 'pointer', fontSize: 13,
                  color: tab === t.key
                    ? C.text
                    : C.textSecond,
                  fontWeight: tab === t.key ? 500 : 400,
                  borderBottom: tab === t.key
                    ? `2px solid ${C.text}`
                    : '2px solid transparent',
                  marginBottom: -0.5 }}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'my-kpis' && user && (
            <StaffKpiList
              cycleId={cycleId}
              userId={user.id}
              weightRules={weightRules as any[]}
            />
          )}

          {tab === 'cascade' && user && (
            <CascadePanel
              cycleId={cycleId}
              users={users as any[]}
              currentUserId={user.id}
            />
          )}

          {tab === 'approve' && user && (
            <ManagerApprovalPanel
              cycleId={cycleId}
              userId={user.id}
            />
          )}

          {tab === 'weight-rules' && (
            <WeightRulesPanel
              cycleId={cycleId}
              cycles={cycles as any[]}
              groups={groups as any[]}
              depts={depts as any[]}
            />
          )}
        </>
      )}
    </div>
  );
}

const S: Record<string, any> = {
  card:      { background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12 },
  grid2:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 },
  label:     { fontSize: 12, fontWeight: 500, color: C.textSecond, display: 'block', marginBottom: 4 },
  input:     { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none' },
  btnPrimary:{ padding: '8px 16px', border: 'none', borderRadius: 8, background: C.text, color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font },
  btnSm:     { padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.textSecond, fontSize: 12, cursor: 'pointer', fontFamily: C.font },
  th:        { textAlign: 'left', padding: '10px', borderBottom: `1px solid ${C.borderLight}`, fontSize: 11, color: C.textSecond, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' },
  td:        { padding: '10px', fontSize: 13, color: C.text },
};
