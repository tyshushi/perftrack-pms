import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cyclesApi, kpisApi } from '../api/client';
import { useForm } from 'react-hook-form';
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

const S: Record<string, any> = {
  card:       { background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12 },
  grid2:      { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 },
  fg:         { marginBottom: 10 },
  label:      { fontSize: 12, fontWeight: 500, color: C.textSecond, display: 'block', marginBottom: 4 },
  input:      { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none' },
  btnPrimary: { padding: '8px 16px', border: 'none', borderRadius: 8, background: C.text, color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font },
  btnWarning: { padding: '6px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bgWarning, color: C.text, fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: C.font },
  btnDanger:  { padding: '6px 12px', border: 'none', borderRadius: 8, background: C.textDanger, color: '#ffffff', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: C.font },
  btnGhost:   { padding: '6px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.text, fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: C.font },
  modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal:        { background: C.bg, borderRadius: 10, padding: 20, width: 'min(480px, 90vw)', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' },
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
  const isSuperAdmin = useAuthStore(s => s.isSuperAdmin);
  const isHrAdmin    = useAuthStore(s => s.isHrAdmin);

  const [ratingType, setRatingType] = useState<'NUMERIC' | 'MET_NOT_MET' | 'OKR'>('NUMERIC');
  const [scaleMax, setScaleMax]     = useState(5);
  const [numericLevels, setNumericLevels] =
    useState(defaultNumericLevels(5));
  const [metLevels, setMetLevels]   = useState(MET_NOT_MET_DEFAULT);
  const [includeRM,  setIncludeRM]  = useState(false);
  const [includeHOD, setIncludeHOD] = useState(false);

  const [resetDialog, setResetDialog]   = useState<{ id: string; name: string } | null>(null);
  const [deleteStep1, setDeleteStep1]   = useState<{ id: string; name: string } | null>(null);
  const [deleteStep2, setDeleteStep2]   = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [actionMessage, setActionMessage]         = useState<string | null>(null);
  const [deleteCycleStep1, setDeleteCycleStep1]   = useState<{ id: string; name: string } | null>(null);
  const [deleteCycleStep2, setDeleteCycleStep2]   = useState<{ id: string; name: string } | null>(null);
  const [deleteCycleText,  setDeleteCycleText]    = useState('');

  const resetAllMut = useMutation({
    mutationFn: (cycleId: string) => kpisApi.resetAllScorecards(cycleId).then(r => r.data),
    onSuccess:  (data) => {
      setActionMessage(`${data.message} (${data.reset} KPI${data.reset === 1 ? '' : 's'} reset)`);
      setResetDialog(null);
    },
    onError: (e: any) => {
      setActionMessage(`Reset failed: ${e?.response?.data?.detail || e.message}`);
      setResetDialog(null);
    },
  });

  const deleteAllMut = useMutation({
    mutationFn: (cycleId: string) => kpisApi.deleteAllScorecards(cycleId).then(r => r.data),
    onSuccess:  (data) => {
      setActionMessage(`${data.message} (${data.deleted} KPI${data.deleted === 1 ? '' : 's'} deleted)`);
      setDeleteStep2(null);
      setDeleteConfirmText('');
    },
    onError: (e: any) => {
      setActionMessage(`Delete failed: ${e?.response?.data?.detail || e.message}`);
      setDeleteStep2(null);
      setDeleteConfirmText('');
    },
  });

  const deleteCycleMut = useMutation({
    mutationFn: (cycleId: string) => cyclesApi.delete(cycleId).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cycles'] });
      setActionMessage('Cycle deleted successfully.');
      setDeleteCycleStep2(null);
      setDeleteCycleText('');
    },
    onError: (e: any) => {
      setActionMessage(`Delete cycle failed: ${e?.response?.data?.detail || e.message}`);
      setDeleteCycleStep2(null);
      setDeleteCycleText('');
    },
  });

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
      setIncludeRM(false);
      setIncludeHOD(false);
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
    const approvalChain = ['DM'];
    if (includeRM)  approvalChain.push('RM');
    if (includeHOD) approvalChain.push('HOD');
    const payload: any = {
      ...formData,
      year: Number(formData.year),
      rating_type: ratingType,
      rating_scale_max: ratingType === 'NUMERIC' ? scaleMax : null,
      rating_levels:
        ratingType === 'NUMERIC'    ? numericLevels :
        ratingType === 'MET_NOT_MET' ? metLevels :
        null,
      approval_chain: approvalChain,
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

          {/* Approval Chain */}
          <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 14, marginTop: 6, marginBottom: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: C.text }}>
              Approval Chain
            </div>
            <div style={{ fontSize: 12, color: C.textTertiary, marginBottom: 10 }}>
              DM approval is always required
            </div>
            <div style={S.radioRow}>
              <label style={{ ...S.radioOpt, opacity: 0.7, cursor: 'not-allowed' }}>
                <input type="checkbox" checked disabled />
                Direct Manager (DM)
              </label>
              <label style={S.radioOpt}>
                <input type="checkbox" checked={includeRM}
                  onChange={e => setIncludeRM(e.target.checked)} />
                Reviewing Manager (RM)
              </label>
              <label style={S.radioOpt}>
                <input type="checkbox" checked={includeHOD}
                  onChange={e => setIncludeHOD(e.target.checked)} />
                HOD
              </label>
            </div>
            <div style={S.note}>
              Order: DM{includeRM ? ' → RM' : ''}{includeHOD ? ' → HOD' : ''}
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
                {['Name', 'Year', 'Status', 'KPI Window', 'Rating', 'Approval Chain', 'Scorecard Management'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(cycles as any[]).length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: C.textSecond }}>
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
                  <td style={{ ...S.td, borderBottom: i < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                    {Array.isArray(c.approval_chain) && c.approval_chain.length > 0
                      ? c.approval_chain.join(' → ')
                      : 'DM'}
                  </td>
                  <td style={{ ...S.td, borderBottom: i < arr.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {isHrAdmin() && (
                        <button
                          type="button"
                          style={S.btnWarning}
                          onClick={() => setResetDialog({ id: c.id, name: c.name })}>
                          Reset All Scorecards
                        </button>
                      )}
                      {isSuperAdmin() && (
                        <button
                          type="button"
                          style={S.btnDanger}
                          onClick={() => setDeleteStep1({ id: c.id, name: c.name })}>
                          Delete All Scorecards
                        </button>
                      )}
                      {isSuperAdmin() && (
                        <button
                          type="button"
                          style={{ ...S.btnDanger, background: '#7f1d1d', borderColor: '#7f1d1d' }}
                          onClick={() => setDeleteCycleStep1({ id: c.id, name: c.name })}>
                          Delete Cycle
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {actionMessage && (
        <div style={S.modalOverlay} onClick={() => setActionMessage(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 10, color: C.text }}>Result</div>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 16 }}>{actionMessage}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" style={S.btnPrimary} onClick={() => setActionMessage(null)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {resetDialog && (
        <div style={S.modalOverlay} onClick={() => setResetDialog(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 10, color: C.text }}>Reset All Scorecards</div>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 16 }}>
              Reset ALL scorecards for {resetDialog.name} to Draft? This affects all employees.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={S.btnGhost} onClick={() => setResetDialog(null)} disabled={resetAllMut.isPending}>
                Cancel
              </button>
              <button
                type="button"
                style={S.btnPrimary}
                disabled={resetAllMut.isPending}
                onClick={() => resetAllMut.mutate(resetDialog.id)}>
                {resetAllMut.isPending ? 'Resetting…' : 'Reset All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteStep1 && (
        <div style={S.modalOverlay} onClick={() => setDeleteStep1(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 10, color: C.textDanger }}>Delete All Scorecards</div>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 16 }}>
              Are you sure you want to DELETE ALL scorecards for {deleteStep1.name}? This is permanent.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={S.btnGhost} onClick={() => setDeleteStep1(null)}>Cancel</button>
              <button
                type="button"
                style={S.btnDanger}
                onClick={() => {
                  setDeleteStep2(deleteStep1);
                  setDeleteStep1(null);
                  setDeleteConfirmText('');
                }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteStep2 && (
        <div style={S.modalOverlay} onClick={() => { if (!deleteAllMut.isPending) { setDeleteStep2(null); setDeleteConfirmText(''); } }}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 10, color: C.textDanger }}>Final Confirmation</div>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 12 }}>
              Type <strong>DELETE</strong> to permanently remove ALL scorecards for {deleteStep2.name}.
            </div>
            <input
              autoFocus
              style={{ ...S.input, marginBottom: 16 }}
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={S.btnGhost}
                disabled={deleteAllMut.isPending}
                onClick={() => { setDeleteStep2(null); setDeleteConfirmText(''); }}>
                Cancel
              </button>
              <button
                type="button"
                style={{ ...S.btnDanger, opacity: deleteConfirmText === 'DELETE' && !deleteAllMut.isPending ? 1 : 0.5 }}
                disabled={deleteConfirmText !== 'DELETE' || deleteAllMut.isPending}
                onClick={() => deleteAllMut.mutate(deleteStep2.id)}>
                {deleteAllMut.isPending ? 'Deleting…' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteCycleStep1 && (
        <div style={S.modalOverlay} onClick={() => setDeleteCycleStep1(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 10, color: C.textDanger }}>Delete Cycle</div>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 16 }}>
              Delete cycle <strong>{deleteCycleStep1.name}</strong>? This cannot be undone if no KPIs exist.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={S.btnGhost} onClick={() => setDeleteCycleStep1(null)}>Cancel</button>
              <button
                type="button"
                style={S.btnDanger}
                onClick={() => {
                  setDeleteCycleStep2(deleteCycleStep1);
                  setDeleteCycleStep1(null);
                  setDeleteCycleText('');
                }}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteCycleStep2 && (
        <div style={S.modalOverlay} onClick={() => { if (!deleteCycleMut.isPending) { setDeleteCycleStep2(null); setDeleteCycleText(''); } }}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 10, color: C.textDanger }}>Final Confirmation</div>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 12 }}>
              Type <strong>DELETE</strong> to permanently delete cycle <strong>{deleteCycleStep2.name}</strong>.
            </div>
            <input
              autoFocus
              style={{ ...S.input, marginBottom: 16 }}
              value={deleteCycleText}
              onChange={e => setDeleteCycleText(e.target.value)}
              placeholder="Type DELETE to confirm" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={S.btnGhost}
                disabled={deleteCycleMut.isPending}
                onClick={() => { setDeleteCycleStep2(null); setDeleteCycleText(''); }}>
                Cancel
              </button>
              <button
                type="button"
                style={{ ...S.btnDanger, opacity: deleteCycleText === 'DELETE' && !deleteCycleMut.isPending ? 1 : 0.5 }}
                disabled={deleteCycleText !== 'DELETE' || deleteCycleMut.isPending}
                onClick={() => deleteCycleMut.mutate(deleteCycleStep2.id)}>
                {deleteCycleMut.isPending ? 'Deleting…' : 'Delete Cycle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
