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
};

export default function AdminCyclesPage() {
  const qc = useQueryClient();
  const { register: rc, handleSubmit: hc, reset: resetC } = useForm();

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'],
    queryFn:  () => cyclesApi.list().then(r => r.data),
  });

  const createCycle = useMutation({
    mutationFn: (d: any) => cyclesApi.create(d),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['cycles'] }); resetC(); },
  });

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
        <form onSubmit={hc(d => createCycle.mutate(d))}>
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
          <button type="submit" style={S.btnPrimary}>
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
                {['Name', 'Year', 'Status', 'KPI Window'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(cycles as any[]).length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 24, textAlign: 'center', color: C.textSecond }}>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
