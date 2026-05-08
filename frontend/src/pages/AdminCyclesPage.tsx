import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cyclesApi } from '../api/client';
import { useForm } from 'react-hook-form';

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

const S: Record<string, any> = {
  card:       { background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12 },
  grid2:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 },
  fg:         { marginBottom: 10 },
  label:      { fontSize: 12, fontWeight: 500, color: C.textSecond, display: 'block', marginBottom: 4 },
  input:      { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none' },
  btnPrimary: { padding: '8px 16px', border: 'none', borderRadius: 8, background: C.text, color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font },
  th:         { textAlign: 'left', padding: '10px', borderBottom: `1px solid ${C.borderLight}`, fontSize: 11, color: C.textSecond, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' },
  td:         { padding: '10px', fontSize: 13, color: C.text },
  radioRow:   { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' as const },
  radioOpt:   { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.text, cursor: 'pointer' },
  note:       { fontSize: 11, color: C.textTertiary, marginTop: 4 },
  subCard:    { background: C.bgSecondary, border: `1px solid ${C.borderLight}`, borderRadius: 8, padding: 12, marginTop: 8 },
};

const NUMERIC_DEFAULTS_5: { value: number; label: string; description: string }[] = [
  { value: 5, label: 'Outstanding',          description: 'Significantly exceeds all targets' },
  { value: 4, label: 'Exceeds Expectations', description: 'Consistently exceeds most targets' },
  { value: 3, label: 'On Target',            description: 'Meets all targets as expected' },
  { value: 2, label: 'Needs Improvement',    description: 'Partially meets targets' },
  { value: 1, label: 'Underperforming',      description: 'Does not meet targets' },
];

function defaultNumericLevels(scaleMax: number) {
  if (scaleMax === 5) return [...NUMERIC_DEFAULTS_5];
  const labels: Record<number, { label: string; description: string }> = {};
  NUMERIC_DEFAULTS_5.forEach(d => { labels[d.value] = { label: d.label, description: d.description }; });
  const out: { value: number; label: string; description: string }[] = [];
  for (let v = scaleMax; v >= 1; v--) {
    const d = labels[v];
    out.push({
      value: v,
      label: d?.label || `Level ${v}`,
      description: d?.description || '',
    });
  }
  return out;
}

const MET_NOT_MET_DEFAULT = [
  { value: 'Met',     label: 'Met',     description: 'Achievement meets the target' },
  { value: 'Not Met', label: 'Not Met', description: 'Achievement does not meet the target' },
];

export default function AdminCyclesPage() {
  const qc = useQueryClient();
  const { register: rc, handleSubmit: hc, reset: resetC } = useForm();

  const [ratingType, setRatingType] = useState<'NUMERIC' | 'MET_NOT_MET' | 'OKR'>('NUMERIC');
  const [scaleMax, setScaleMax]     = useState(5);
  const [numericLevels, setNumericLevels] =
    useState(defaultNumericLevels(5));
  const [metLevels, setMetLevels]   = useState(MET_NOT_MET_DEFAULT);

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'],
    queryFn:  () => cyclesApi.list().then(r => r.data),
  });

  const createCycle = useMutation({
    mutationFn: (d: any) => cyclesApi.create(d),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['cycles'] });
      resetC();
      setRatingType('NUMERIC');
      setScaleMax(5);
      setNumericLevels(defaultNumericLevels(5));
      setMetLevels(MET_NOT_MET_DEFAULT);
    },
  });

  const onScaleMaxChange = (n: number) => {
    const clamped = Math.max(2, Math.min(10, n));
    setScaleMax(clamped);
    setNumericLevels(defaultNumericLevels(clamped));
  };

  const updateNumericLevel = (idx: number, field: 'label' | 'description', val: string) => {
    setNumericLevels(prev => prev.map((lv, i) => i === idx ? { ...lv, [field]: val } : lv));
  };

  const updateMetLevel = (idx: number, val: string) => {
    setMetLevels(prev => prev.map((lv, i) => i === idx ? { ...lv, description: val } : lv));
  };

  const onSubmit = (formData: any) => {
    const payload: any = {
      ...formData,
      year: Number(formData.year),
      rating_type: ratingType,
      rating_scale_max: ratingType === 'NUMERIC' ? scaleMax : null,
      rating_levels:
        ratingType === 'NUMERIC'    ? numericLevels :
        ratingType === 'MET_NOT_MET' ? metLevels :
        null,
    };
    createCycle.mutate(payload);
  };

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: C.text }}>
          Performance Cycles
        </h1>
        <p style={{ fontSize: 13, color: C.textSecond }}>
          Create and manage performance cycles
        </p>
      </div>

      {/* Create cycle form */}
      <div style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: 14, color: C.text }}>
          Create Performance Cycle
        </div>
        <form onSubmit={hc(onSubmit)}>
          <div style={S.grid2}>
            <div style={S.fg}>
              <label style={S.label}>Cycle Name</label>
              <input style={S.input}
                {...rc('name', { required: true })}
                placeholder="FY2026 Annual" />
            </div>
            <div style={S.fg}>
              <label style={S.label}>Year</label>
              <input style={S.input} type="number"
                {...rc('year', { required: true })} placeholder="2026" />
            </div>
            <div style={S.fg}>
              <label style={S.label}>KPI Setting Start</label>
              <input style={S.input} type="date"
                {...rc('kpi_setting_start', { required: true })} />
            </div>
            <div style={S.fg}>
              <label style={S.label}>KPI Setting End</label>
              <input style={S.input} type="date"
                {...rc('kpi_setting_end', { required: true })} />
            </div>
            <div style={S.fg}>
              <label style={S.label}>Self Eval Start</label>
              <input style={S.input} type="date"
                {...rc('self_eval_start', { required: true })} />
            </div>
            <div style={S.fg}>
              <label style={S.label}>Self Eval End</label>
              <input style={S.input} type="date"
                {...rc('self_eval_end', { required: true })} />
            </div>
            <div style={S.fg}>
              <label style={S.label}>Manager Eval Start</label>
              <input style={S.input} type="date"
                {...rc('mgr_eval_start', { required: true })} />
            </div>
            <div style={S.fg}>
              <label style={S.label}>Manager Eval End</label>
              <input style={S.input} type="date"
                {...rc('mgr_eval_end', { required: true })} />
            </div>
          </div>

          {/* Rating Framework */}
          <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 14, marginTop: 6 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: C.text }}>
              Rating Framework
            </div>
            <div style={{ fontSize: 12, color: C.textTertiary, marginBottom: 12 }}>
              This cannot be changed after the cycle starts
            </div>

            <div style={S.radioRow}>
              <label style={S.radioOpt}>
                <input type="radio" name="rating_type" value="NUMERIC"
                  checked={ratingType === 'NUMERIC'}
                  onChange={() => setRatingType('NUMERIC')} />
                Numeric Rating
              </label>
              <label style={S.radioOpt}>
                <input type="radio" name="rating_type" value="MET_NOT_MET"
                  checked={ratingType === 'MET_NOT_MET'}
                  onChange={() => setRatingType('MET_NOT_MET')} />
                Met / Not Met
              </label>
              <label style={S.radioOpt}>
                <input type="radio" name="rating_type" value="OKR"
                  checked={ratingType === 'OKR'}
                  onChange={() => setRatingType('OKR')} />
                OKR (0-100%)
              </label>
            </div>

            {ratingType === 'NUMERIC' && (
              <div style={S.subCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <label style={{ ...S.label, marginBottom: 0 }}>Rating Scale Max</label>
                  <input
                    type="number" min={2} max={10}
                    value={scaleMax}
                    onChange={e => onScaleMaxChange(Number(e.target.value))}
                    style={{ ...S.input, width: 80 }} />
                  <span style={S.note}>(2 to 10)</span>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      <th style={{ ...S.th, width: 60 }}>Rating</th>
                      <th style={S.th}>Label</th>
                      <th style={S.th}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {numericLevels.map((lv, idx) => (
                      <tr key={lv.value}>
                        <td style={{ ...S.td, fontWeight: 600 }}>{lv.value}</td>
                        <td style={S.td}>
                          <input style={S.input} value={lv.label}
                            onChange={e => updateNumericLevel(idx, 'label', e.target.value)} />
                        </td>
                        <td style={S.td}>
                          <input style={S.input} value={lv.description}
                            onChange={e => updateNumericLevel(idx, 'description', e.target.value)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {ratingType === 'MET_NOT_MET' && (
              <div style={S.subCard}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: C.bg }}>
                      <th style={{ ...S.th, width: 100 }}>Rating</th>
                      <th style={S.th}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metLevels.map((lv, idx) => (
                      <tr key={lv.value}>
                        <td style={{ ...S.td, fontWeight: 600 }}>{lv.value}</td>
                        <td style={S.td}>
                          <input style={S.input} value={lv.description}
                            onChange={e => updateMetLevel(idx, e.target.value)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {ratingType === 'OKR' && (
              <div style={{ ...S.subCard, fontSize: 13, color: C.textSecond }}>
                Staff will enter 0-100% achievement
              </div>
            )}
          </div>

          <button type="submit" style={{ ...S.btnPrimary, marginTop: 14 }}>
            {createCycle.isPending ? 'Creating...' : 'Create Cycle'}
          </button>
        </form>
      </div>

      {/* Existing cycles */}
      <div style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: 12, color: C.text }}>
          Existing Cycles
        </div>
        <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bgSecondary }}>
                {['Name', 'Year', 'Status', 'KPI Window', 'Rating'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(cycles as any[]).length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: C.textSecond }}>
                    No cycles yet
                  </td>
                </tr>
              )}
              {(cycles as any[]).map((c: any, i: number, arr: any[]) => (
                <tr key={c.id} style={{ background: C.bg }}>
                  <td style={{ ...S.td, borderBottom: i < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                    {c.name}
                  </td>
                  <td style={{ ...S.td, borderBottom: i < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                    {c.year}
                  </td>
                  <td style={{ ...S.td, borderBottom: i < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: C.bgInfo, color: C.textInfo }}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ ...S.td, borderBottom: i < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                    {c.kpi_setting_start} → {c.kpi_setting_end}
                  </td>
                  <td style={{ ...S.td, borderBottom: i < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                    {c.rating_type === 'NUMERIC'
                      ? `Numeric 1–${c.rating_scale_max || 5}`
                      : c.rating_type === 'MET_NOT_MET'
                      ? 'Met / Not Met'
                      : c.rating_type === 'OKR'
                      ? 'OKR (0-100%)'
                      : c.rating_type || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
