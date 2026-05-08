import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userProfileApi, cyclesApi, kpisApi } from '../../api/client';
import { useAuthStore } from '../../store/auth';

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

const ROLE_LABELS: Record<string, string> = {
  STAFF: 'Staff', MANAGER: 'Manager', MGR2: "Mgr's Manager",
  HOD: 'HOD/CxO', HR_ADMIN: 'HR Admin', SUPER_ADMIN: 'Super Admin',
};

function RolePill({ role }: { role: string }) {
  const colors: Record<string, { bg: string; color: string }> = {
    STAFF:       { bg: '#f5f5f3', color: '#555' },
    MANAGER:     { bg: '#e0f2fe', color: '#0369a1' },
    MGR2:        { bg: '#ede9fe', color: '#6d28d9' },
    HOD:         { bg: '#fef3c7', color: '#92400e' },
    HR_ADMIN:    { bg: '#dcfce7', color: '#166534' },
    SUPER_ADMIN: { bg: '#fee2e2', color: '#991b1b' },
  };
  const c = colors[role] || colors.STAFF;
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px',
      borderRadius: 10, background: c.bg, color: c.color,
      display: 'inline-block', marginTop: 4 }}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%',
      background: '#e8f1fb', color: '#185fa5', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.32), fontWeight: 600 }}>
      {initials}
    </div>
  );
}

const SLOT_CONFIG = [
  { key: 'direct_manager_id',    label: 'Direct Manager',    color: '#0369a1', bg: '#e0f2fe' },
  { key: 'reviewing_manager_id', label: 'Reviewing Manager', color: '#6d28d9', bg: '#ede9fe' },
  { key: 'hod_id',               label: 'HOD',              color: '#92400e', bg: '#fef3c7' },
] as const;

type SlotKey = typeof SLOT_CONFIG[number]['key'];

function ManagerSlot({
  slot, assignedUser, isOpen, onOpen, onClose, onAssign, onClear, managers,
}: {
  slot:         typeof SLOT_CONFIG[number];
  assignedUser: any | null;
  isOpen:       boolean;
  onOpen:       () => void;
  onClose:      () => void;
  onAssign:     (user: any) => void;
  onClear:      () => void;
  managers:     any[];
}) {
  const [search, setSearch] = useState('');

  const results = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return managers.slice(0, 6);
    return managers.filter(m =>
      m.full_name.toLowerCase().includes(q) ||
      m.employee_id.toLowerCase().includes(q) ||
      (m.position_title || '').toLowerCase().includes(q) ||
      (m.job_grade || '').toLowerCase().includes(q)
    ).slice(0, 6);
  }, [search, managers]);

  function handleOpen() { setSearch(''); onOpen(); }
  function handleAssign(m: any) { onAssign(m); setSearch(''); onClose(); }

  return (
    <div>
      <div style={{ fontSize: 11, color: C.textSecond, marginBottom: 5,
        fontWeight: 500 }}>{slot.label}</div>

      {!isOpen && (
        assignedUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', borderRadius: 8,
            border: `1px solid ${C.borderLight}`,
            background: slot.bg + '40' }}>
            <Avatar name={assignedUser.full_name} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: slot.color,
                overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap' }}>
                {assignedUser.full_name}
              </div>
              <div style={{ fontSize: 10, color: C.textSecond }}>
                {assignedUser.employee_id}
                {assignedUser.job_grade ? ` · ${assignedUser.job_grade}` : ''}
              </div>
            </div>
            <button onClick={handleOpen} title="Change"
              style={{ border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 13, color: C.textSecond,
                padding: '2px 4px' }}>✎</button>
            <button onClick={onClear} title="Remove"
              style={{ border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 14, color: C.textTertiary,
                padding: '2px 4px' }}>✕</button>
          </div>
        ) : (
          <button onClick={handleOpen}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8,
              border: `1px dashed ${C.border}`, background: C.bgSecondary,
              cursor: 'pointer', textAlign: 'left', fontSize: 12,
              color: C.textTertiary, fontFamily: C.font }}>
            + Assign {slot.label}
          </button>
        )
      )}

      {isOpen && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input autoFocus
              style={{ flex: 1, padding: '7px 10px',
                border: `2px solid ${slot.color}`,
                borderRadius: 8, fontSize: 12, background: C.bg,
                color: C.text, fontFamily: C.font, outline: 'none' }}
              placeholder={`Search for ${slot.label.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)} />
            <button onClick={() => { onClose(); setSearch(''); }}
              style={{ padding: '6px 10px',
                border: `1px solid ${C.border}`,
                borderRadius: 8, background: C.bg, cursor: 'pointer',
                fontSize: 12, color: C.textSecond, fontFamily: C.font }}>
              Cancel
            </button>
          </div>

          {results.length > 0 && (
            <div style={{ border: `1px solid ${C.borderLight}`,
              borderRadius: 8, overflow: 'hidden', background: C.bg,
              maxHeight: 220, overflowY: 'auto' }}>
              {results.map((m: any, i: number) => (
                <div key={m.id} onClick={() => handleAssign(m)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', cursor: 'pointer',
                    borderBottom: i < results.length - 1
                      ? `1px solid ${C.borderLight}` : 'none',
                    background: C.bg }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.bgSecondary)}
                  onMouseLeave={e => (e.currentTarget.style.background = C.bg)}>
                  <Avatar name={m.full_name} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: C.text,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap' }}>{m.full_name}</div>
                    <div style={{ fontSize: 10, color: C.textSecond }}>
                      {m.employee_id}
                      {m.position_title ? ` · ${m.position_title}` : ''}
                      {m.job_grade ? ` · ${m.job_grade}` : ''}
                      {' · '}{ROLE_LABELS[m.role] || m.role}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: slot.color,
                    fontWeight: 600, flexShrink: 0 }}>Select</span>
                </div>
              ))}
            </div>
          )}

          {search.trim() && results.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12,
              color: C.textTertiary, textAlign: 'center',
              border: `1px solid ${C.borderLight}`, borderRadius: 8,
              background: C.bg }}>
              No results for "{search}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Scorecard status helpers ────────────────────────────────────────────────

function computeScorecardStatus(kpis: any[]): { label: string; bg: string; color: string } {
  if (!kpis.length) return { label: 'No KPIs', bg: C.bgTertiary, color: C.textTertiary };
  const statuses = new Set(kpis.map((k: any) => k.status));
  if ([...statuses].every(s => s === 'LOCKED'))
    return { label: 'Locked', bg: '#e0f2fe', color: '#0c4a6e' };
  if ([...statuses].every(s => s === 'LOCKED' || s === 'APPROVED'))
    return { label: 'Approved', bg: '#dcfce7', color: '#166534' };
  if ([...statuses].some(s => s === 'PENDING_DM' || s === 'PENDING_RM' || s === 'PENDING_HOD'))
    return { label: 'Pending Approval', bg: '#fef9c3', color: '#854d0e' };
  if ([...statuses].some(s => s === 'REJECTED'))
    return { label: 'Draft (Rejected)', bg: '#fee2e2', color: '#991b1b' };
  return { label: 'Draft', bg: '#f5f5f3', color: '#555' };
}

// ── Scorecard Management section ───────────────────────────────────────────

function ScorecardManagement({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const qc = useQueryClient();
  const [cycleId,      setCycleId]      = useState('');
  const [resetConfirm, setResetConfirm] = useState(false);
  // delete flow: null → 'warn1' → 'warn2'
  const [deleteStep,   setDeleteStep]   = useState<null | 'warn1' | 'warn2'>(null);
  const [deleteInput,  setDeleteInput]  = useState('');
  const [actionMsg,    setActionMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  const { data: cycles = [] } = useQuery({
    queryKey: ['cycles'],
    queryFn:  () => cyclesApi.list().then(r => r.data),
  });

  const sortedCycles = useMemo(() =>
    [...(cycles as any[])].sort((a: any, b: any) => b.name.localeCompare(a.name)),
    [cycles]
  );

  if (sortedCycles.length && !cycleId) setCycleId((sortedCycles[0] as any).id);

  const selectedCycle = (sortedCycles as any[]).find(c => c.id === cycleId) ?? null;

  const { data: kpis = [], isLoading: kpisLoading } = useQuery({
    queryKey: ['kpis-admin', cycleId, employeeId],
    queryFn:  () => kpisApi.list(cycleId, employeeId).then(r => r.data),
    enabled:  !!cycleId,
  });

  const scorecardStatus = computeScorecardStatus(kpis as any[]);

  function showMsg(ok: boolean, text: string) {
    setActionMsg({ ok, text });
    setTimeout(() => setActionMsg(null), 4000);
  }

  const resetMutation = useMutation({
    mutationFn: () => kpisApi.resetScorecard(cycleId, employeeId),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['kpis-admin', cycleId, employeeId] });
      setResetConfirm(false);
      showMsg(true, res.data?.message ?? 'Scorecard reset to draft');
    },
    onError: (err: any) => {
      setResetConfirm(false);
      showMsg(false, err?.response?.data?.detail ?? 'Reset failed');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => kpisApi.deleteScorecard(cycleId, employeeId),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['kpis-admin', cycleId, employeeId] });
      setDeleteStep(null);
      setDeleteInput('');
      showMsg(true, res.data?.message ?? 'Scorecard deleted');
    },
    onError: (err: any) => {
      setDeleteStep(null);
      setDeleteInput('');
      showMsg(false, err?.response?.data?.detail ?? 'Delete failed');
    },
  });

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.borderLight}` }}>
      <div style={S.sectionLabel}>Scorecard Management</div>

      {/* Cycle selector */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 500, color: C.textSecond, display: 'block', marginBottom: 4 }}>
          Select Cycle
        </label>
        <select
          value={cycleId}
          onChange={e => { setCycleId(e.target.value); setResetConfirm(false); setDeleteStep(null); setDeleteInput(''); setActionMsg(null); }}
          style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: cycleId ? C.text : C.textTertiary, fontFamily: C.font, outline: 'none', cursor: 'pointer' }}>
          <option value="">Select a cycle…</option>
          {(sortedCycles as any[]).map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Current status */}
      {cycleId && (
        <div style={{ marginBottom: 14 }}>
          {kpisLoading ? (
            <div style={{ fontSize: 12, color: C.textTertiary }}>Loading status…</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: C.textSecond }}>Current status:</span>
              <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 10, background: scorecardStatus.bg, color: scorecardStatus.color }}>
                {scorecardStatus.label}
              </span>
              <span style={{ fontSize: 11, color: C.textTertiary }}>
                ({(kpis as any[]).length} KPI{(kpis as any[]).length !== 1 ? 's' : ''})
              </span>
            </div>
          )}
        </div>
      )}

      {/* Action message */}
      {actionMsg && (
        <div style={{ marginBottom: 12, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: actionMsg.ok ? '#dcfce7' : '#fee2e2', color: actionMsg.ok ? '#166534' : '#991b1b', border: `1px solid ${actionMsg.ok ? '#86efac' : '#fca5a5'}` }}>
          {actionMsg.ok ? '✓ ' : '✕ '}{actionMsg.text}
        </div>
      )}

      {cycleId && (kpis as any[]).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Reset to Draft */}
          {!resetConfirm && deleteStep === null && (
            <button
              onClick={() => setResetConfirm(true)}
              style={{ width: '100%', padding: '8px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.textSecond, fontSize: 12, cursor: 'pointer', fontFamily: C.font, textAlign: 'left' }}>
              Reset to Draft
            </button>
          )}

          {resetConfirm && (
            <div style={{ padding: 12, background: C.bgWarning, borderRadius: 8, border: `1px solid #fde68a` }}>
              <div style={{ fontSize: 12, color: '#78350f', marginBottom: 10, fontWeight: 500 }}>
                Reset {employeeName}'s scorecard to Draft? This cannot be undone.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => resetMutation.mutate()}
                  disabled={resetMutation.isPending}
                  style={{ padding: '7px 14px', border: 'none', borderRadius: 8, background: '#92400e', color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, opacity: resetMutation.isPending ? 0.6 : 1 }}>
                  {resetMutation.isPending ? 'Resetting…' : 'Confirm Reset'}
                </button>
                <button
                  onClick={() => setResetConfirm(false)}
                  style={{ padding: '7px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.textSecond, fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Delete Scorecard */}
          {!resetConfirm && deleteStep === null && (
            <button
              onClick={() => setDeleteStep('warn1')}
              style={{ width: '100%', padding: '8px 14px', border: `1px solid #fca5a5`, borderRadius: 8, background: C.bg, color: '#991b1b', fontSize: 12, cursor: 'pointer', fontFamily: C.font, textAlign: 'left' }}>
              Delete Scorecard
            </button>
          )}

          {deleteStep === 'warn1' && (
            <div style={{ padding: 12, background: '#fee2e2', borderRadius: 8, border: `1px solid #fca5a5` }}>
              <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 10, fontWeight: 500 }}>
                Are you sure you want to delete {employeeName}'s scorecard
                {selectedCycle ? ` for ${selectedCycle.name}` : ''}?
                All KPIs will be permanently removed.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setDeleteStep('warn2'); setDeleteInput(''); }}
                  style={{ padding: '7px 14px', border: 'none', borderRadius: 8, background: '#991b1b', color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}>
                  Yes, continue
                </button>
                <button
                  onClick={() => setDeleteStep(null)}
                  style={{ padding: '7px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.textSecond, fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {deleteStep === 'warn2' && (
            <div style={{ padding: 12, background: '#fee2e2', borderRadius: 8, border: `2px solid #991b1b` }}>
              <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 4, fontWeight: 700 }}>
                This action is PERMANENT and cannot be undone.
              </div>
              <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 10 }}>
                Type <strong>DELETE</strong> to confirm.
              </div>
              <input
                value={deleteInput}
                onChange={e => setDeleteInput(e.target.value)}
                placeholder="Type DELETE"
                style={{ width: '100%', padding: '7px 10px', border: `1px solid #fca5a5`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteInput !== 'DELETE' || deleteMutation.isPending}
                  style={{ padding: '7px 14px', border: 'none', borderRadius: 8, background: '#991b1b', color: '#ffffff', fontSize: 12, fontWeight: 500, fontFamily: C.font, cursor: deleteInput !== 'DELETE' ? 'not-allowed' : 'pointer', opacity: deleteInput !== 'DELETE' ? 0.4 : 1 }}>
                  {deleteMutation.isPending ? 'Deleting…' : 'Delete Permanently'}
                </button>
                <button
                  onClick={() => { setDeleteStep(null); setDeleteInput(''); }}
                  style={{ padding: '7px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.textSecond, fontSize: 12, cursor: 'pointer', fontFamily: C.font }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {cycleId && !kpisLoading && (kpis as any[]).length === 0 && (
        <div style={{ fontSize: 12, color: C.textTertiary, fontStyle: 'italic' }}>
          No KPIs found for this cycle.
        </div>
      )}
    </div>
  );
}

// ── Main drawer ─────────────────────────────────────────────────────────────

interface Props {
  user: any; users: any[]; depts: any[]; onClose: () => void;
}

export default function UserProfileDrawer({ user, users, depts, onClose }: Props) {
  const qc = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const [editing,     setEditing]     = useState(false);
  const [openSlot,    setOpenSlot]    = useState<SlotKey | null>(null);
  const [assignments, setAssignments] = useState<Record<string, any>>({});
  const [levels,      setLevels]      = useState(3);
  const [saveOk,      setSaveOk]      = useState(false);

  const isHrAdmin = currentUser?.role === 'HR_ADMIN' || currentUser?.role === 'SUPER_ADMIN';

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile', user.id],
    queryFn:  () => userProfileApi.getProfile(user.id).then(r => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => userProfileApi.updateManagers(user.id, data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['user-profile', user.id] });
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditing(false); setOpenSlot(null);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    },
  });

  function startEditing() {
    if (!profile) return;
    setAssignments({
      direct_manager_id:    profile.direct_manager    ? { ...profile.direct_manager,    id: profile.direct_manager.id }    : null,
      reviewing_manager_id: profile.reviewing_manager ? { ...profile.reviewing_manager, id: profile.reviewing_manager.id } : null,
      hod_id:               profile.hod               ? { ...profile.hod,               id: profile.hod.id }               : null,
    });
    setLevels(profile.approval_levels || 3);
    setEditing(true); setOpenSlot(null);
  }

  async function handleSave() {
    await updateMutation.mutateAsync({
      direct_manager_id:    assignments.direct_manager_id?.id    || null,
      reviewing_manager_id: assignments.reviewing_manager_id?.id || null,
      hod_id:               assignments.hod_id?.id               || null,
      approval_levels:      levels,
    });
  }

  const managers = users.filter(u => u.id !== user.id);
  const initials = (user.full_name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <>
      <div style={{ position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.35)', zIndex: 1000 }}
        onClick={onClose} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
        background: C.bg, overflowY: 'auto', zIndex: 1001,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        fontFamily: C.font }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: 24 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 20 }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: C.text }}>
              Employee Profile
            </span>
            <button onClick={onClose}
              style={{ border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 20, color: C.textSecond,
                lineHeight: 1 }}>✕</button>
          </div>

          {/* Avatar card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14,
            padding: 16, background: C.bgSecondary,
            borderRadius: 12, marginBottom: 20,
            border: `1px solid ${C.borderLight}` }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%',
              background: '#e8f1fb', color: '#185fa5', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 700 }}>
              {initials}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.text }}>
                {user.full_name}
              </div>
              <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 2 }}>
                {user.email}
              </div>
              <RolePill role={user.role} />
            </div>
          </div>

          {isLoading && (
            <div style={{ color: C.textSecond, fontSize: 13,
              textAlign: 'center', padding: 32 }}>Loading...</div>
          )}

          {profile && (
            <>
              {/* Personal details */}
              <div style={S.sectionLabel}>Personal Details</div>
              <div style={{ display: 'flex',
                justifyContent: 'space-between', alignItems: 'center',
                padding: '11px 12px', marginBottom: 4,
                background: '#e0f2fe', borderRadius: 8,
                border: '1px solid #bae6fd' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#0c4a6e', fontSize: 13,
                    fontWeight: 600 }}>Email</span>
                  <span style={{ fontSize: 9, fontWeight: 700,
                    padding: '2px 6px', borderRadius: 4,
                    background: '#0369a1', color: '#ffffff',
                    textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Login ID
                  </span>
                </div>
                <span style={{ fontWeight: 600, fontSize: 13,
                  color: '#0c4a6e', textAlign: 'right',
                  maxWidth: 240, wordBreak: 'break-all',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                  {profile.email || '—'}
                </span>
              </div>
              {[
                ['Employee Code',   profile.employee_id],
                ['Position',        profile.position_title  || '—'],
                ['Grade',           profile.job_grade       || '—'],
                ['Department',      profile.department_name || '—'],
                ['Division',        profile.division        || '—'],
                ['Section',         profile.section         || '—'],
                ['Employment Unit', profile.employment_unit || '—'],
                ['Category',        profile.category        || '—'],
                ['Employee Type',   profile.employee_type   || '—'],
                ['Country',         profile.country         || '—'],
                ['Work Location',   profile.work_location   || '—'],
                ['Gender',          profile.gender          || '—'],
                ['Hire Date',       profile.hire_date       || '—'],
                ['Status',          profile.is_active ? 'Active' : 'Inactive'],
              ].map(([label, value], i, arr) => (
                <div key={label} style={{ display: 'flex',
                  justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '9px 0',
                  borderBottom: i < arr.length - 1
                    ? `1px solid ${C.borderLight}` : 'none' }}>
                  <span style={{ color: C.textSecond, fontSize: 13,
                    flexShrink: 0 }}>{label}</span>
                  <span style={{ fontWeight: 500, fontSize: 13, color: C.text,
                    textAlign: 'right', maxWidth: 240,
                    wordBreak: 'break-word' }}>{value}</span>
                </div>
              ))}

              {/* Reporting chain */}
              <div style={{ ...S.sectionLabel, marginTop: 20,
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center' }}>
                <span>Reporting Chain</span>
                {!editing && (
                  <button onClick={startEditing}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6,
                      border: `1px solid ${C.border}`, background: C.bg,
                      cursor: 'pointer', color: C.textSecond,
                      fontFamily: C.font, fontWeight: 500 }}>
                    Edit
                  </button>
                )}
              </div>

              {!editing && (
                <>
                  {[
                    ['Direct Manager',    profile.direct_manager,    '#0369a1'],
                    ['Reviewing Manager', profile.reviewing_manager,  '#6d28d9'],
                    ['HOD',              profile.hod,               '#92400e'],
                  ].map(([label, mgr, color]: any, i, arr) => (
                    <div key={label} style={{ display: 'flex',
                      justifyContent: 'space-between', alignItems: 'flex-start',
                      padding: '9px 0',
                      borderBottom: i < arr.length - 1
                        ? `1px solid ${C.borderLight}` : 'none' }}>
                      <span style={{ color: C.textSecond, fontSize: 13 }}>
                        {label}
                      </span>
                      {mgr ? (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color }}>
                            {mgr.name}
                          </div>
                          <div style={{ fontSize: 11, color: C.textTertiary }}>
                            {mgr.employee_id}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: C.textTertiary, fontSize: 13 }}>
                          Not assigned
                        </span>
                      )}
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                    padding: '9px 0' }}>
                    <span style={{ color: C.textSecond, fontSize: 13 }}>
                      Approval Levels
                    </span>
                    <span style={{ fontWeight: 500, fontSize: 13, color: C.text }}>
                      {profile.approval_levels || 3} level(s)
                    </span>
                  </div>
                  {saveOk && (
                    <div style={{ marginTop: 10, padding: '8px 12px',
                      background: '#dcfce7', borderRadius: 8,
                      fontSize: 12, color: '#166534', textAlign: 'center',
                      border: '1px solid #86efac' }}>
                      ✓ Reporting chain saved
                    </div>
                  )}
                </>
              )}

              {editing && (
                <div>
                  <div style={{ display: 'flex', flexDirection: 'column',
                    gap: 14, marginBottom: 16 }}>
                    {SLOT_CONFIG.map(slot => (
                      <ManagerSlot
                        key={slot.key}
                        slot={slot}
                        assignedUser={assignments[slot.key]}
                        isOpen={openSlot === slot.key}
                        onOpen={() => setOpenSlot(slot.key)}
                        onClose={() => setOpenSlot(null)}
                        onAssign={u => setAssignments(p => ({ ...p, [slot.key]: u }))}
                        onClear={() => setAssignments(p => ({ ...p, [slot.key]: null }))}
                        managers={managers}
                      />
                    ))}
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: C.textSecond,
                      marginBottom: 6, fontWeight: 500 }}>
                      Approval Levels
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        { v: 1, label: '1 level',  sub: 'Direct only' },
                        { v: 2, label: '2 levels', sub: 'Direct + HOD' },
                        { v: 3, label: '3 levels', sub: 'All three' },
                      ].map(opt => (
                        <button key={opt.v} onClick={() => setLevels(opt.v)}
                          style={{ flex: 1, padding: '8px 6px', borderRadius: 8,
                            cursor: 'pointer', fontFamily: C.font,
                            border: `1px solid ${levels === opt.v ? C.text : C.border}`,
                            background: levels === opt.v ? C.text : C.bg,
                            color: levels === opt.v ? '#ffffff' : C.textSecond,
                            textAlign: 'center' }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>
                            {opt.label}
                          </div>
                          <div style={{ fontSize: 10, marginTop: 1, opacity: 0.7 }}>
                            {opt.sub}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleSave}
                      disabled={updateMutation.isPending}
                      style={{ flex: 1, padding: '9px', border: 'none',
                        borderRadius: 8, background: C.text, color: '#ffffff',
                        fontSize: 13, cursor: 'pointer', fontFamily: C.font,
                        fontWeight: 500,
                        opacity: updateMutation.isPending ? 0.7 : 1 }}>
                      {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button onClick={() => { setEditing(false); setOpenSlot(null); }}
                      style={{ padding: '9px 16px',
                        border: `1px solid ${C.border}`,
                        borderRadius: 8, background: C.bg, fontSize: 13,
                        cursor: 'pointer', fontFamily: C.font,
                        color: C.textSecond }}>
                      Cancel
                    </button>
                  </div>

                  {updateMutation.isError && (
                    <div style={{ marginTop: 8, fontSize: 12,
                      color: '#991b1b', textAlign: 'center' }}>
                      Failed to save. Please try again.
                    </div>
                  )}
                </div>
              )}

              {/* Scorecard Management — HR Admin only */}
              {isHrAdmin && (
                <ScorecardManagement
                  employeeId={user.id}
                  employeeName={user.full_name}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

const S: Record<string, any> = {
  sectionLabel: {
    fontSize: 11, fontWeight: 600, color: C.textSecond,
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
  },
};
