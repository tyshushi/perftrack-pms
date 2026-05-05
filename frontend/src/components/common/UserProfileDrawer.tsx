import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userProfileApi } from '../../api/client';

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

function InitialsAvatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%',
      background: '#e8f1fb', color: '#185fa5', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.3), fontWeight: 600 }}>
      {initials}
    </div>
  );
}

// ── Slot config ────────────────────────────────────────────────────────────

const SLOTS = [
  { key: 'direct_manager_id',    label: 'Direct Manager',    color: '#0369a1' },
  { key: 'reviewing_manager_id', label: 'Reviewing Manager', color: '#6d28d9' },
  { key: 'hod_id',               label: 'HOD',              color: '#92400e' },
] as const;

type SlotKey = typeof SLOTS[number]['key'];

// ── Reporting chain modal content ──────────────────────────────────────────

function ReportingChainModal({
  user, profile, managers, onSave, onClose,
}: {
  user:     any;
  profile:  any;
  managers: any[];
  onSave:   (data: any) => Promise<void>;
  onClose:  () => void;
}) {
  const [search,  setSearch]  = useState('');
  const [levels,  setLevels]  = useState<number>(profile?.approval_levels || 3);
  const [saving,  setSaving]  = useState(false);
  const [assignments, setAssignments] = useState<Record<string, string | null>>({
    direct_manager_id:    profile?.direct_manager?.id    || null,
    reviewing_manager_id: profile?.reviewing_manager?.id || null,
    hod_id:               profile?.hod?.id               || null,
  });

  const managerMap = useMemo(
    () => Object.fromEntries(managers.map((m: any) => [m.id, m])),
    [managers]
  );

  const searchResults = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    return managers
      .filter(m =>
        m.full_name.toLowerCase().includes(q) ||
        m.employee_id.toLowerCase().includes(q) ||
        (m.position_title || '').toLowerCase().includes(q) ||
        (m.job_grade || '').toLowerCase().includes(q)
      )
      .slice(0, 7);
  }, [search, managers]);

  function assign(slotKey: SlotKey, userId: string) {
    setAssignments(p => ({ ...p, [slotKey]: userId }));
  }

  function clear(slotKey: SlotKey) {
    setAssignments(p => ({ ...p, [slotKey]: null }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        direct_manager_id:    assignments.direct_manager_id    || null,
        reviewing_manager_id: assignments.reviewing_manager_id || null,
        hod_id:               assignments.hod_id               || null,
        approval_levels:      levels,
      });
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>

      {/* Modal header */}
      <div style={{ padding: '14px 18px',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        background: 'var(--color-background-secondary)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexShrink: 0 }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: 14,
            color: 'var(--color-text-primary)' }}>Edit Reporting Chain</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 1 }}>
            {user.full_name} · {user.employee_id}
          </div>
        </div>
        <button onClick={onClose}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 18, color: 'var(--color-text-secondary)', lineHeight: 1,
            padding: '2px 6px' }}>✕</button>
      </div>

      {/* Modal body */}
      <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1 }}>

        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 5,
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Search employees
          </div>
          <input
            autoFocus
            style={{ width: '100%', padding: '8px 11px',
              border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 8, fontSize: 13,
              background: 'var(--color-background-primary)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-sans)', outline: 'none',
              boxSizing: 'border-box' }}
            placeholder="Name, employee code, or position..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {/* Results */}
          {searchResults.length > 0 && (
            <div style={{ marginTop: 4,
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 8, overflow: 'hidden',
              background: 'var(--color-background-primary)' }}>
              {searchResults.map((m: any, i: number) => (
                <div key={m.id}
                  style={{ padding: '9px 12px',
                    borderBottom: i < searchResults.length - 1
                      ? '0.5px solid var(--color-border-tertiary)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center',
                    gap: 8, marginBottom: 6 }}>
                    <InitialsAvatar name={m.full_name} size={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500,
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap' }}>
                        {m.full_name}
                      </div>
                      <div style={{ fontSize: 11,
                        color: 'var(--color-text-secondary)' }}>
                        {m.employee_id}
                        {m.position_title ? ` · ${m.position_title}` : ''}
                        {m.job_grade ? ` · ${m.job_grade}` : ''}
                      </div>
                    </div>
                  </div>
                  {/* Assign buttons */}
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {SLOTS.map(slot => {
                      const isAssigned = assignments[slot.key] === m.id;
                      return (
                        <button key={slot.key}
                          onClick={() => isAssigned ? clear(slot.key) : assign(slot.key, m.id)}
                          style={{ fontSize: 11, padding: '3px 9px', borderRadius: 6,
                            cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `0.5px solid ${isAssigned ? slot.color : 'var(--color-border-secondary)'}`,
                            background: isAssigned ? slot.color + '18' : 'transparent',
                            color: isAssigned ? slot.color : 'var(--color-text-secondary)',
                            fontWeight: isAssigned ? 500 : 400 }}>
                          {isAssigned ? '✓ ' : '+ '}{slot.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {search.trim().length > 0 && searchResults.length === 0 && (
            <div style={{ marginTop: 4, padding: '10px 12px', fontSize: 12,
              color: 'var(--color-text-tertiary)', textAlign: 'center',
              border: '0.5px solid var(--color-border-tertiary)', borderRadius: 8 }}>
              No results for "{search}"
            </div>
          )}
        </div>

        {/* Current assignment slots */}
        <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8,
          color: 'var(--color-text-secondary)',
          textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Current assignments
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8, marginBottom: 16 }}>
          {SLOTS.map(slot => {
            const assignedId   = assignments[slot.key];
            const assignedUser = assignedId ? managerMap[assignedId] : null;
            return (
              <div key={slot.key}
                style={{ padding: 10, borderRadius: 8,
                  border: `0.5px solid ${assignedUser
                    ? slot.color + '50'
                    : 'var(--color-border-tertiary)'}`,
                  background: assignedUser
                    ? slot.color + '0a'
                    : 'var(--color-background-secondary)',
                  minHeight: 72 }}>
                <div style={{ fontSize: 9, fontWeight: 500, marginBottom: 6,
                  color: assignedUser ? slot.color : 'var(--color-text-tertiary)',
                  textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {slot.label}
                </div>
                {assignedUser ? (
                  <div style={{ display: 'flex', alignItems: 'flex-start',
                    justifyContent: 'space-between', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center',
                      gap: 5, flex: 1, minWidth: 0 }}>
                      <InitialsAvatar name={assignedUser.full_name} size={22} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 500,
                          color: 'var(--color-text-primary)',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap' }}>
                          {assignedUser.full_name}
                        </div>
                        <div style={{ fontSize: 10,
                          color: 'var(--color-text-secondary)' }}>
                          {assignedUser.employee_id}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => clear(slot.key)}
                      style={{ border: 'none', background: 'transparent',
                        cursor: 'pointer', fontSize: 12, lineHeight: 1,
                        color: 'var(--color-text-tertiary)',
                        flexShrink: 0, padding: '0 1px' }}>✕</button>
                  </div>
                ) : (
                  <div style={{ fontSize: 11,
                    color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                    Not assigned
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Approval levels */}
        <div style={{ fontSize: 11, fontWeight: 500, marginBottom: 8,
          color: 'var(--color-text-secondary)',
          textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Approval levels
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {[
            { v: 1, label: '1 level',  sub: 'Direct only' },
            { v: 2, label: '2 levels', sub: 'Direct + HOD' },
            { v: 3, label: '3 levels', sub: 'All three' },
          ].map(opt => (
            <button key={opt.v} onClick={() => setLevels(opt.v)}
              style={{ padding: '9px 6px', borderRadius: 8, cursor: 'pointer',
                border: `0.5px solid ${levels === opt.v
                  ? 'var(--color-text-primary)'
                  : 'var(--color-border-secondary)'}`,
                background: levels === opt.v
                  ? 'var(--color-text-primary)'
                  : 'transparent',
                color: levels === opt.v
                  ? 'var(--color-background-primary)'
                  : 'var(--color-text-secondary)',
                fontFamily: 'var(--font-sans)', textAlign: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{opt.label}</div>
              <div style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>{opt.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Modal footer */}
      <div style={{ padding: '12px 18px',
        borderTop: '0.5px solid var(--color-border-tertiary)',
        background: 'var(--color-background-secondary)',
        display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
        <button onClick={onClose}
          style={{ padding: '7px 14px',
            border: '0.5px solid var(--color-border-secondary)',
            borderRadius: 8, background: 'transparent', fontSize: 13,
            cursor: 'pointer', fontFamily: 'var(--font-sans)',
            color: 'var(--color-text-secondary)' }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          style={{ padding: '7px 18px', border: 'none', borderRadius: 8,
            background: 'var(--color-text-primary)',
            color: 'var(--color-background-primary)',
            fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-sans)', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ── Main drawer ────────────────────────────────────────────────────────────

interface Props {
  user:    any;
  users:   any[];
  depts:   any[];
  onClose: () => void;
}

export default function UserProfileDrawer({ user, users, depts, onClose }: Props) {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile', user.id],
    queryFn:  () => userProfileApi.getProfile(user.id).then(r => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => userProfileApi.updateManagers(user.id, data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['user-profile', user.id] });
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowModal(false);
    },
  });

  const deptMap  = Object.fromEntries(depts.map((d: any) => [d.id, d.name]));
  const managers = users.filter((u: any) => u.id !== user.id);
  const initials = user.full_name
    .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>

      {/* Page backdrop */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }}
        onClick={onClose}
      />

      {/* Side panel */}
      <div
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 440,
          background: 'var(--color-background-primary)',
          overflowY: showModal ? 'hidden' : 'auto',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.1)' }}
        onClick={e => e.stopPropagation()}>

        {/* ── Modal overlay (sits on top of panel) ── */}
        {showModal && profile && (
          <div
            style={{ position: 'absolute', inset: 0, zIndex: 10,
              background: 'rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16 }}
            onClick={() => setShowModal(false)}>
            <div
              style={{ width: '100%', maxWidth: 420,
                background: 'var(--color-background-primary)',
                borderRadius: 14,
                border: '0.5px solid var(--color-border-secondary)',
                overflow: 'hidden', maxHeight: '90%',
                display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}>
              <ReportingChainModal
                user={user}
                profile={profile}
                managers={managers}
                onClose={() => setShowModal(false)}
                onSave={async (data) => {
                  await updateMutation.mutateAsync(data);
                }}
              />
            </div>
          </div>
        )}

        {/* ── Panel content ── */}
        <div style={{ padding: 24 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 20 }}>
            <span style={{ fontWeight: 600, fontSize: 15,
              color: 'var(--color-text-primary)' }}>Employee Profile</span>
            <button onClick={onClose}
              style={{ border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 20,
                color: 'var(--color-text-secondary)' }}>✕</button>
          </div>

          {/* Avatar + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14,
            padding: 16, background: 'var(--color-background-secondary)',
            borderRadius: 12, marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%',
              background: '#e8f1fb', color: '#185fa5', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 600 }}>
              {initials}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16,
                color: 'var(--color-text-primary)' }}>{user.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)',
                marginBottom: 2 }}>{user.email}</div>
              <RolePill role={user.role} />
            </div>
          </div>

          {isLoading && (
            <div style={{ color: 'var(--color-text-secondary)', fontSize: 13,
              textAlign: 'center', padding: 32 }}>Loading...</div>
          )}

          {profile && (
            <>
              {/* Personal details */}
              <div style={S.sectionLabel}>Personal Details</div>
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
              ].map(([label, value]) => (
                <div key={label} style={S.row}>
                  <span style={{ color: 'var(--color-text-secondary)',
                    fontSize: 13, flexShrink: 0 }}>{label}</span>
                  <span style={{ fontWeight: 500, fontSize: 13,
                    color: 'var(--color-text-primary)',
                    textAlign: 'right', maxWidth: 240,
                    wordBreak: 'break-word' }}>
                    {value}
                  </span>
                </div>
              ))}

              {/* Reporting chain summary */}
              <div style={{ ...S.sectionLabel, marginTop: 20 }}>Reporting Chain</div>
              {[
                ['Direct Manager',    profile.direct_manager,    '#0369a1'],
                ['Reviewing Manager', profile.reviewing_manager,  '#6d28d9'],
                ['HOD',              profile.hod,               '#92400e'],
              ].map(([label, mgr, color]: any) => (
                <div key={label} style={S.row}>
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                    {label}
                  </span>
                  {mgr ? (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 500, fontSize: 13, color }}>
                        {mgr.name}
                      </div>
                      <div style={{ fontSize: 11,
                        color: 'var(--color-text-tertiary)' }}>
                        {mgr.employee_id}
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                      Not assigned
                    </span>
                  )}
                </div>
              ))}

              <div style={S.row}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                  Approval Levels
                </span>
                <span style={{ fontWeight: 500, fontSize: 13,
                  color: 'var(--color-text-primary)' }}>
                  {profile.approval_levels || 3} level(s)
                </span>
              </div>

              {/* Edit button */}
              <button
                onClick={() => setShowModal(true)}
                style={{ width: '100%', marginTop: 16, padding: '10px',
                  border: '0.5px solid var(--color-border-secondary)',
                  borderRadius: 8, background: 'transparent',
                  color: 'var(--color-text-primary)', fontSize: 13,
                  cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  fontWeight: 500 }}>
                Edit Reporting Chain →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const S: Record<string, any> = {
  sectionLabel: {
    fontSize: 11, fontWeight: 500,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 8,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '9px 0',
    borderBottom: '0.5px solid var(--color-border-tertiary)',
  },
};
