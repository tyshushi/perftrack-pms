import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kpisApi, cyclesApi, usersApi } from '../api/client';
import { useAuthStore } from '../store/auth';

const CATEGORIES = ['Core', 'Operational', 'Development', 'Optional'];

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

function WeightRulesPanel({ cycleId }: { cycleId: string }) {
  const qc = useQueryClient();
  const [rules, setRules] = useState<Record<string, { min: number; max: number }>>({});
  const [saved, setSaved] = useState(false);

  const { data: existingRules = [] } = useQuery({
    queryKey: ['weight-rules', cycleId],
    queryFn:  () => kpisApi.getWeightRules(cycleId).then(r => r.data),
    onSuccess: (data: any[]) => {
      const map: Record<string, { min: number; max: number }> = {};
      data.forEach(r => { map[r.category] = { min: r.min_weight, max: r.max_weight }; });
      setRules(map);
    },
    enabled: !!cycleId,
  });

  const saveMutation = useMutation({
    mutationFn: () => kpisApi.setWeightRules(cycleId,
      Object.entries(rules).map(([category, r]) => ({
        category,
        min_weight: r.min,
        max_weight: r.max,
      }))
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weight-rules', cycleId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  function update(category: string, field: 'min' | 'max', value: number) {
    setRules(p => ({ ...p, [category]: { ...p[category], [field]: value } }));
  }

  return (
    <div style={S.card}>
      <div style={{ fontWeight: 500, marginBottom: 4,
        color: 'var(--color-text-primary)' }}>
        KPI Weight Rules
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)',
        marginBottom: 14 }}>
        Set min and max weight % per KPI category. Total weights across
        all categories should add up to 100%.
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--color-background-secondary)' }}>
            {['Category', 'Min Weight %', 'Max Weight %'].map(h => (
              <th key={h} style={S.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CATEGORIES.map(cat => (
            <tr key={cat}>
              <td style={S.td}>{cat}</td>
              <td style={S.td}>
                <input
                  type="number" min={0} max={100}
                  style={{ ...S.input, width: 80 }}
                  value={rules[cat]?.min ?? 0}
                  onChange={e => update(cat, 'min', Number(e.target.value))}
                />
              </td>
              <td style={S.td}>
                <input
                  type="number" min={0} max={100}
                  style={{ ...S.input, width: 80 }}
                  value={rules[cat]?.max ?? 100}
                  onChange={e => update(cat, 'max', Number(e.target.value))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 8, marginTop: 12,
        alignItems: 'center' }}>
        <button onClick={() => saveMutation.mutate()} style={S.btnPrimary}
          disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving...' : 'Save Weight Rules'}
        </button>
        {saved && (
          <span style={{ fontSize: 12, color: '#166534' }}>✓ Saved</span>
        )}
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
  const [category,    setCategory]    = useState('Core');
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

  const rule = (weightRules as any[]).find((r: any) => r.category === category);

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
      name, description, category, weight, target, measurement,
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
        color: 'var(--color-text-primary)' }}>
        Cascade KPI
      </div>
      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)',
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
          <label style={S.label}>Category</label>
          <select style={S.input} value={category}
            onChange={e => setCategory(e.target.value)}>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.label}>
            Weight %
            {rule && (
              <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)',
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
              color: 'var(--color-text-tertiary)', fontSize: 13 }}>
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
                    'var(--color-background-secondary)';
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
                  color: 'var(--color-text-primary)' }}>
                  {u.full_name}
                </div>
                <div style={{ fontSize: 11,
                  color: 'var(--color-text-secondary)' }}>
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
      category: cat, weight, target, measurement: meas,
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
  const byCategory  = CATEGORIES.map(cat => ({
    cat,
    total:   (kpis as any[]).filter(k => k.category === cat)
                             .reduce((s, k) => s + k.weight, 0),
    rule:    weightRules.find((r: any) => r.category === cat),
  }));

  const rule = weightRules.find((r: any) => r.category === cat);

  return (
    <div>
      {/* Weight summary */}
      <div style={{ ...S.card, marginBottom: 12 }}>
        <div style={{ fontWeight: 500, marginBottom: 10,
          color: 'var(--color-text-primary)' }}>
          Weight Summary
        </div>
        <div style={{ display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 8, marginBottom: 10 }}>
          {byCategory.map(({ cat, total, rule }) => {
            const ok = !rule ||
              (total >= (rule.min_weight || 0) &&
               total <= (rule.max_weight || 100));
            return (
              <div key={cat} style={{ padding: '10px 12px', borderRadius: 8,
                background: ok
                  ? 'var(--color-background-secondary)'
                  : '#fee2e2',
                border: `0.5px solid ${ok
                  ? 'var(--color-border-tertiary)'
                  : '#fca5a5'}` }}>
                <div style={{ fontSize: 11,
                  color: 'var(--color-text-secondary)',
                  marginBottom: 4 }}>{cat}</div>
                <div style={{ fontSize: 20, fontWeight: 500,
                  color: ok ? 'var(--color-text-primary)' : '#991b1b' }}>
                  {total}%
                </div>
                {rule && (
                  <div style={{ fontSize: 10,
                    color: ok ? 'var(--color-text-tertiary)' : '#991b1b' }}>
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
            color: 'var(--color-text-secondary)' }}>Total</span>
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
          color: 'var(--color-text-secondary)', fontSize: 13,
          border: '0.5px dashed var(--color-border-secondary)',
          borderRadius: 10 }}>
          No KPIs yet. Add your first KPI or wait for your manager to
          cascade KPIs to you.
        </div>
      )}

      {/* Add optional KPI form */}
      {adding && (
        <div style={S.card}>
          <div style={{ fontWeight: 500, marginBottom: 12,
            color: 'var(--color-text-primary)' }}>
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
              <label style={S.label}>Category</label>
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
                    color: 'var(--color-text-tertiary)', marginLeft: 6 }}>
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
  const rule = weightRules.find((r: any) => r.category === kpi.category);
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
              color: 'var(--color-text-primary)' }}>{kpi.name}</span>
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
              color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              {kpi.description}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {kpi.category} · Target: {kpi.target}
            {kpi.measurement ? ` · ${kpi.measurement}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column',
          alignItems: 'flex-end', gap: 6, flexShrink: 0, marginLeft: 12 }}>
          <StatusPill status={kpi.status} />
          <div style={{ fontSize: 18, fontWeight: 600,
            color: 'var(--color-text-primary)' }}>
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
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: 6, background: 'transparent',
                cursor: 'pointer', color: 'var(--color-text-secondary)',
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
                color: 'var(--color-text-secondary)' }}>%</span>
              {rule && (
                <span style={{ fontSize: 11,
                  color: 'var(--color-text-tertiary)' }}>
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
          color: 'var(--color-text-secondary)',
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
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)',
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
                    ? 'var(--color-text-primary)'
                    : 'var(--color-border-secondary)'}`,
                  background: selectedReport?.id === r.id
                    ? 'var(--color-text-primary)' : 'transparent',
                  color: selectedReport?.id === r.id
                    ? 'var(--color-background-primary)'
                    : 'var(--color-text-secondary)',
                  cursor: 'pointer', fontSize: 13,
                  fontFamily: 'var(--font-sans)' }}>
                {r.full_name}
              </button>
            ))}
        </div>
      </div>

      {selectedReport && pendingKpis.length === 0 && (
        <div style={{ textAlign: 'center', padding: 24,
          color: 'var(--color-text-secondary)', fontSize: 13 }}>
          No KPIs pending your approval for {selectedReport.full_name}
        </div>
      )}

      {pendingKpis.map((kpi: any) => (
        <div key={kpi.id} style={{ ...S.card, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between',
            marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 500,
                color: 'var(--color-text-primary)' }}>{kpi.name}</div>
              <div style={{ fontSize: 12,
                color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {kpi.category} · {kpi.weight}% · Target: {kpi.target}
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
  const [cycleId,  setCycleId]  = useState('');
  const [tab, setTab] = useState<'my-kpis' | 'cascade' | 'approve' | 'weight-rules'>('my-kpis');

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'],
    queryFn:  () => cyclesApi.list().then(r => r.data),
    onSuccess: (d: any[]) => {
      if (d.length && !cycleId) setCycleId(d[0].id);
    },
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

  const isManager  = ['MANAGER', 'MGR2', 'HOD', 'HR_ADMIN', 'SUPER_ADMIN']
    .includes(user?.role || '');
  const isHrAdmin  = ['HR_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');

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
            color: 'var(--color-text-primary)' }}>KPI Setting</h1>
          <p style={{ fontSize: 13,
            color: 'var(--color-text-secondary)' }}>
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
          color: 'var(--color-text-secondary)', fontSize: 13 }}>
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
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-secondary)',
                  fontWeight: tab === t.key ? 500 : 400,
                  borderBottom: tab === t.key
                    ? '2px solid var(--color-text-primary)'
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
            <WeightRulesPanel cycleId={cycleId} />
          )}
        </>
      )}
    </div>
  );
}

const S: Record<string, any> = {
  card:      { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 10, padding: 16, marginBottom: 12 },
  grid2:     { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 },
  label:     { fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 },
  input:     { width: '100%', padding: '7px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 8, fontSize: 13, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', outline: 'none' },
  btnPrimary:{ padding: '7px 16px', border: 'none', borderRadius: 8, background: 'var(--color-text-primary)', color: 'var(--color-background-primary)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' },
  btnSm:     { padding: '5px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 8, background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' },
  th:        { textAlign: 'left', padding: '8px 10px', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500 },
  td:        { padding: '10px', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: 13, color: 'var(--color-text-primary)' },
};
