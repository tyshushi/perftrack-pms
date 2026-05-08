import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kpisApi, cyclesApi, groupsApi, departmentsApi } from '../api/client';

function buildEmptyTargetRows(cycle: any) {
  const ratingType = cycle?.rating_type || 'NUMERIC';
  const scaleMax   = cycle?.rating_scale_max || 5;
  const levels: any[] = cycle?.rating_levels || [];
  if (ratingType === 'NUMERIC') {
    const ordered = levels.length
      ? [...levels].sort((a, b) => Number(b.value) - Number(a.value))
      : Array.from({ length: scaleMax }, (_, i) => ({ value: scaleMax - i, label: `Level ${scaleMax - i}`, description: '' }));
    return ordered.map((lv: any) => ({ value: lv.value, label: lv.label, target: '' }));
  }
  if (ratingType === 'MET_NOT_MET') {
    const ordered = levels.length
      ? levels
      : [{ value: 'Met', label: 'Met' }, { value: 'Not Met', label: 'Not Met' }];
    return ordered.map((lv: any) => ({ value: lv.value, label: lv.label || lv.value, target: '' }));
  }
  return [{ value: 'OKR', label: 'OKR', target: '' }];
}

function hasCompleteTargets(rawTargets: any, cycle: any): boolean {
  const targets = Array.isArray(rawTargets) ? rawTargets : [];
  if (targets.length === 0) return false;
  const ratingType = cycle?.rating_type || 'NUMERIC';
  const scaleMax   = cycle?.rating_scale_max || 5;
  if (ratingType === 'NUMERIC') {
    if (targets.length !== scaleMax) return false;
  } else if (ratingType === 'MET_NOT_MET') {
    if (targets.length !== 2) return false;
  } else {
    if (targets.length !== 1) return false;
  }
  return targets.every((t: any) => typeof t.target === 'string' && t.target.trim().length > 0);
}

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

const APPLIES_TO_OPTS = [
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

function appliesLabel(t: any): string {
  if (t.job_grade)     return `Grade: ${t.job_grade}`;
  if (t.department_id) return `Dept ID: ${String(t.department_id).slice(0, 8)}…`;
  if (t.hierarchy)     return `Hierarchy: ${t.hierarchy}`;
  if (t.user_category) return `Category: ${t.user_category}`;
  return 'Everyone';
}

export default function KpiTemplatesPage() {
  const qc = useQueryClient();
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

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['kpi-templates', cycleId],
    queryFn:  () => kpisApi.getTemplates(cycleId).then(r => r.data),
    enabled:  !!cycleId,
  });

  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [dimension,   setDimension]   = useState('Financials');
  const [appliesTo,   setAppliesTo]   = useState('everyone');
  const [groupId,     setGroupId]     = useState('');
  const [deptId,      setDeptId]      = useState('');
  const [jobGrade,    setJobGrade]    = useState('');
  const [hierarchy,   setHierarchy]   = useState('');
  const [category,    setCategory]    = useState('');
  const [minWeight,   setMinWeight]   = useState(0);
  const [maxWeight,   setMaxWeight]   = useState(100);
  const [target,      setTarget]      = useState('');
  const [measurement, setMeasurement] = useState('');
  const [cascading,   setCascading]   = useState<string | null>(null);
  const [adding,      setAdding]      = useState(false);
  const [inlineTargets, setInlineTargets] = useState<any[]>([]);

  useEffect(() => {
    if (adding) setInlineTargets(buildEmptyTargetRows(currentCycle));
  }, [adding, cycleId]);

  const createMutation = useMutation({
    mutationFn: () => kpisApi.createTemplate({
      cycle_id:      cycleId,
      name, description,
      kpi_dimension: dimension,
      min_weight:    minWeight,
      max_weight:    maxWeight,
      target, measurement,
      group_id:      appliesTo === 'group'      ? groupId   || null : null,
      department_id: appliesTo === 'department' ? deptId    || null : null,
      job_grade:     appliesTo === 'grade'      ? jobGrade  || null : null,
      hierarchy:     appliesTo === 'hierarchy'  ? hierarchy || null : null,
      user_category: appliesTo === 'category'   ? category  || null : null,
      rating_targets: inlineTargets,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kpi-templates', cycleId] });
      setName(''); setDescription(''); setTarget(''); setMeasurement('');
      setMinWeight(0); setMaxWeight(100); setGroupId(''); setDeptId('');
      setJobGrade(''); setHierarchy(''); setCategory('');
      setAppliesTo('everyone'); setAdding(false);
      setInlineTargets(buildEmptyTargetRows(currentCycle));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => kpisApi.deleteTemplate(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['kpi-templates', cycleId] }),
  });

  async function handleCascade(t: any) {
    setCascading(t.id);
    try {
      const res = await kpisApi.cascade({
        cycle_id:      cycleId,
        name:          t.name,
        description:   t.description,
        kpi_dimension: t.kpi_dimension,
        weight:        t.weight,
        target:        t.target,
        measurement:   t.measurement,
        employee_ids:  [],
        group_id:      null,
        hierarchy:     null,
        user_category: null,
        department_id: t.department_id || null,
        job_grade:     t.job_grade     || null,
        rating_targets: t.rating_targets || null,
      });
      qc.invalidateQueries({ queryKey: ['kpis'] });
      alert(res.data.message);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Cascade failed');
    } finally {
      setCascading(null);
    }
  }

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: C.text }}>
          Templates & Cascade
        </h1>
        <p style={{ fontSize: 13, color: C.textSecond }}>
          Create reusable KPI templates and cascade them to employees
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
        <div>
          {/* Template list */}
          {templatesLoading && (
            <div style={{ padding: 24, textAlign: 'center', color: C.textSecond, fontSize: 13 }}>
              Loading templates…
            </div>
          )}

          {!templatesLoading && (templates as any[]).length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: C.textSecond, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 10, marginBottom: 12 }}>
              No templates yet. Create one to cascade fixed KPIs to employees.
            </div>
          )}

          {(templates as any[]).map((t: any) => (
            <div key={t.id} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14, color: C.text, marginBottom: 4 }}>{t.name}</div>
                {t.description && (
                  <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 4 }}>{t.description}</div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, color: C.textSecond }}>
                  <span>{t.kpi_dimension}</span>
                  <span>·</span>
                  <span>{t.weight}–{t.max_weight ?? t.weight}%</span>
                  <span>·</span>
                  <span>Target: {t.target}</span>
                  <span>·</span>
                  <span style={{ color: C.textTertiary }}>{appliesLabel(t)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => handleCascade(t)} disabled={cascading === t.id} style={S.btnPrimary}>
                  {cascading === t.id ? 'Cascading…' : 'Cascade Now'}
                </button>
                <button onClick={() => deleteMutation.mutate(t.id)} disabled={deleteMutation.isPending}
                  style={{ ...S.btnSm, padding: '6px 10px', color: C.textTertiary, fontSize: 14, lineHeight: 1 }}>
                  ✕
                </button>
              </div>
            </div>
          ))}

          {/* Add template button */}
          {!adding && (
            <button onClick={() => setAdding(true)}
              style={{ ...S.btnSm, width: '100%', padding: '10px', borderStyle: 'dashed', marginBottom: 12 }}>
              + New KPI Template
            </button>
          )}

          {/* Create template form */}
          {adding && (
            <div style={S.card}>
              <div style={{ fontWeight: 500, marginBottom: 14, color: C.text }}>
                New KPI Template
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
                  <textarea style={{ ...S.input, minHeight: 54, resize: 'vertical' }}
                    value={description}
                    onChange={e => setDescription(e.target.value)} />
                </div>
                <div>
                  <label style={S.label}>KPI Dimension</label>
                  <select style={S.input} value={dimension}
                    onChange={e => setDimension(e.target.value)}>
                    {DIMENSIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Applies To</label>
                  <select style={S.input} value={appliesTo}
                    onChange={e => setAppliesTo(e.target.value)}>
                    {APPLIES_TO_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {appliesTo === 'group' && (
                  <div>
                    <label style={S.label}>Custom Group</label>
                    <select style={S.input} value={groupId} onChange={e => setGroupId(e.target.value)}>
                      <option value="">Select group…</option>
                      {(groups as any[]).map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  </div>
                )}
                {appliesTo === 'department' && (
                  <div>
                    <label style={S.label}>Department</label>
                    <select style={S.input} value={deptId} onChange={e => setDeptId(e.target.value)}>
                      <option value="">Select department…</option>
                      {(depts as any[]).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                )}
                {appliesTo === 'grade' && (
                  <div>
                    <label style={S.label}>Job Grade</label>
                    <input style={S.input} value={jobGrade} onChange={e => setJobGrade(e.target.value)} placeholder="e.g. G2" />
                  </div>
                )}
                {appliesTo === 'hierarchy' && (
                  <div>
                    <label style={S.label}>Hierarchy</label>
                    <input style={S.input} value={hierarchy} onChange={e => setHierarchy(e.target.value)} placeholder="e.g. Apex-1" />
                  </div>
                )}
                {appliesTo === 'category' && (
                  <div>
                    <label style={S.label}>Employee Category</label>
                    <input style={S.input} value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Corporate Staff" />
                  </div>
                )}
                <div>
                  <label style={S.label}>Min Weight %</label>
                  <input style={S.input} type="number" min={0} max={100} value={minWeight} onChange={e => setMinWeight(Number(e.target.value))} />
                </div>
                <div>
                  <label style={S.label}>Max Weight %</label>
                  <input style={S.input} type="number" min={0} max={100} value={maxWeight} onChange={e => setMaxWeight(Number(e.target.value))} />
                </div>
                <div>
                  <label style={S.label}>Target</label>
                  <input style={S.input} value={target} onChange={e => setTarget(e.target.value)} placeholder="e.g. ≥ 90% satisfaction" />
                </div>
                <div>
                  <label style={S.label}>Measurement</label>
                  <input style={S.input} value={measurement} onChange={e => setMeasurement(e.target.value)} placeholder="e.g. Monthly survey score" />
                </div>
              </div>

              {/* Rating Targets */}
              {currentCycle && (
                <div style={{ marginTop: 8, padding: 12, background: C.bgSecondary, borderRadius: 8, border: `0.5px solid ${C.borderLight}` }}>
                  <div style={{ fontWeight: 500, fontSize: 13, color: C.text, marginBottom: 4 }}>
                    Rating Targets <span style={{ color: C.textDanger }}>*</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 8 }}>
                    Define what achievement looks like for each rating level. Required before this template can be created.
                  </div>
                  {(currentCycle.rating_type || 'NUMERIC') === 'OKR' ? (
                    <div>
                      <label style={S.label}>Measurement description</label>
                      <input style={S.input}
                        value={inlineTargets[0]?.target || ''}
                        onChange={e => setInlineTargets(prev => prev.length
                          ? prev.map((r, i) => i === 0 ? { ...r, target: e.target.value } : r)
                          : [{ value: 'OKR', label: 'OKR', target: e.target.value }])}
                        placeholder="e.g. % of project milestones completed" />
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.textSecond, fontWeight: 600, width: 180 }}>Rating</th>
                          <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: C.textSecond, fontWeight: 600 }}>Target Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inlineTargets.map((r, i) => (
                          <tr key={String(r.value)}>
                            <td style={{ padding: '6px 8px', fontSize: 13, color: C.text }}>
                              <strong>{r.value}</strong>{r.label ? ` — ${r.label}` : ''}
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input style={S.input} value={r.target}
                                onChange={e => setInlineTargets(prev => prev.map((row, idx) => idx === i ? { ...row, target: e.target.value } : row))}
                                placeholder="What achievement looks like for this rating" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {createMutation.isError && (
                <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 8 }}>
                  {(createMutation.error as any)?.response?.data?.detail || 'Failed to create template'}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => createMutation.mutate()}
                  disabled={!name || !target || !hasCompleteTargets(inlineTargets, currentCycle) || createMutation.isPending}
                  style={{ ...S.btnPrimary, opacity: (!name || !target || !hasCompleteTargets(inlineTargets, currentCycle)) ? 0.5 : 1 }}>
                  {createMutation.isPending ? 'Creating…' : 'Create Template'}
                </button>
                <button onClick={() => setAdding(false)} style={S.btnSm}>Cancel</button>
              </div>
              {!hasCompleteTargets(inlineTargets, currentCycle) && (
                <div style={{ marginTop: 6, fontSize: 12, color: C.textDanger }}>
                  Fill in all rating target descriptions before creating the template.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
