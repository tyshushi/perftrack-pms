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
      fontSize: size * 0.3, fontWeight: 600 }}>
      {initials}
    </div>
  );
}

// ── Reporting Chain Modal ──────────────────────────────────────────────────

interface ManagerSlot {
  key:   'direct_manager_id' | 'reviewing_manager_id' | 'hod_id';
  label: string;
  color: string;
}

const SLOTS: ManagerSlot[] = [
  { key: 'direct_manager_id',    label: 'Direct Manager',    color: '#0369a1' },
  { key: 'reviewing_manager_id', label: 'Reviewing Manager', color: '#6d28d9' },
  { key: 'hod_id',               label: 'HOD',              color: '#92400e' },
];

function ReportingChainModal({
  user, profile, managers, onSave, onClose,
}: {
  user:     any;
  profile:  any;
  managers: any[];
  onSave:   (data: any) => void;
  onClose:  () => void;
}) {
  const [search,  setSearch]  = useState('');
  const [levels,  setLevels]  = useState<number>(profile?.approval_levels || 3);
  const [saving,  setSaving]  = useState(false);
  const [activeSlot, setActiveSlot] = useState<ManagerSlot['key'] | null>(null);

  // Assignment state — keyed by slot, value is user id or null
  const [assignments, setAssignments] = useState<Record<string, string | null>>({
    direct_manager_id:    profile?.direct_manager?.id    || null,
    reviewing_manager_id: profile?.reviewing_manager?.id || null,
    hod_id:               profile?.hod?.id               || null,
  });

  // Manager lookup map
  const managerMap = useMemo(
    () => Object.fromEntries(managers.map((m: any) => [m.id, m])),
    [managers]
  );

  // Search results
  const searchResults = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return [];
    return managers
      .filter(m =>
        m.full_name.toLowerCase().includes(q) ||
        m.employee_id.toLowerCase().includes(q) ||
        (m.position_title || '').toLowerCase().includes(q) ||
        (m.job_grade || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [search, managers]);

  function assign(slotKey: ManagerSlot['key'], userId: string) {
    setAssignments(p => ({ ...p, [slotKey]: userId }));
    setSearch('');
    setActiveSlot(null);
  }

  function clear(slotKey: ManagerSlot['key']) {
    setAssignments(p => ({ ...p, [slotKey]: null }));
  }

  async function handleSave() {
    setSaving(true);
    await onSave({
      direct_manager_id:    assignments.direct_manager_id    || null,
      reviewing_manager_id: assignments.reviewing_manager_id || null,
      hod_id:               assignments.hod_id               || null,
      approval_levels:      levels,
    });
    setSaving(false);
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div
        style={{ width: 560, background: 'var(--color-background-primary)',
          borderRadius: 16, border: '0.5px solid var(--color-border-secondary)',
          overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        {/* Modal header */}
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid var(--color-border-tertiary)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--color-background-secondary)' }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>Edit Reporting Chain</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {user.full_name} · {user.employee_id}
            </div>
          </div>
          <button onClick={onClose}
            style={{ border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: 18, color: 'var(--color-text-secondary)',
              lineHeight: 1, padding: '4px 8px' }}>✕</button>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>

          {/* Search bar */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 500,
              color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              Search employees
            </div>
            <input
              autoFocus
              style={{ width: '100%', padding: '9px 12px',
                border: '0.5px solid var(--color-border-secondary)',
                borderRadius: 8, fontSize: 13,
                background: 'var(--color-background-primary)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-sans)', outline: 'none',
                boxSizing: 'border-box' }}
              placeholder="Type name, employee code, or position..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            {/* Search results */}
            {searchResults.length > 0 && (
              <div style={{ marginTop: 6, border: '0.5px solid var(--color-border-tertiary)',
                borderRadius: 8, overflow: 'hidden',
                background: 'var(--color-background-primary)' }}>
                {searchResults.map((m: any, i: number) => (
                  <div key={m.id}
                    style={{ padding: '10px 14px',
                      borderBottom: i < searchResults.length - 1
                        ? '0.5px solid var(--color-border-tertiary)' : 'none',
                      background: 'var(--color-background-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center',
                      gap: 10, marginBottom: 6 }}>
                      <InitialsAvatar name={m.full_name} size={28} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500,
                          color: 'var(--color-text-primary)' }}>{m.full_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                          {m.employee_id}
                          {m.position_title ? ` · ${m.position_title}` : ''}
                          {m.job_grade ? ` · ${m.job_grade}` : ''}
                        </div>
                      </div>
                    </div>
                    {/* Assign buttons for each slot */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {SLOTS.map(slot => {
                        const isAssigned = assignments[slot.key] === m.id;
                        return (
                          <button key={slot.key}
                            onClick={() => isAssigned ? clear(slot.key) : assign(slot.key, m.id)}
                            style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8,
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

            {search.length > 0 && searchResults.length === 0 && (
              <div style={{ marginTop: 6, padding: '12px 14px', fontSize: 13,
                color: 'var(--color-text-tertiary)', textAlign: 'center',
                border: '0.5px solid var(--color-border-tertiary)', borderRadius: 8 }}>
                No results for "{search}"
              </div>
            )}
          </div>

          {/* Three assignment slots */}
          <div style={{ fontSize: 12, fontWeight: 500,
            color: 'var(--color-text-secondary)', marginBottom: 10 }}>
            Current assignments
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
            {SLOTS.map(slot => {
              const assignedId = assignments[slot.key];
              const assignedUser = assignedId ? managerMap[assignedId] : null;
              return (
                <div key={slot.key}
                  style={{ padding: 12, borderRadius: 10,
                    border: `0.5px solid ${assignedUser ? slot.color + '40' : 'var(--color-border-tertiary)'}`,
                    background: assignedUser ? slot.color + '08' : 'var(--color-background-secondary)',
                    minHeight: 80 }}>
                  <div style={{ fontSize: 10, fontWeight: 500, marginBottom: 8,
                    color: assignedUser ? slot.color : 'var(--color-text-tertiary)',
                    textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {slot.label}
                  </div>
                  {assignedUser ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                          <InitialsAvatar name={assignedUser.full_name} size={24} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500,
                              color: 'var(--color-text-primary)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {assignedUser.full_name}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                              {assignedUser.employee_id}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => clear(slot.key)}
                          style={{ border: 'none', background: 'transparent',
                            cursor: 'pointer', fontSize: 14,
                            color: 'var(--color-text-tertiary)', flexShrink: 0,
                            padding: '0 2px', lineHeight: 1 }}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)',
                      fontStyle: 'italic' }}>
                      Search above to assign
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Approval levels */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 500,
              color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              Approval levels
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { v: 1, label: '1 level', sub: 'Direct only' },
                { v: 2, label: '2 levels', sub: 'Direct + HOD' },
                { v: 3, label: '3 levels', sub: 'All three' },
              ].map(opt => (
                <button key={opt.v} onClick={() => setLevels(opt.v)}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
                    border: `0.5px solid ${levels === opt.v ? '#1a1a18' : 'var(--color-border-secondary)'}`,
                    background: levels === opt.v ? '#1a1a18' : 'transparent',
                    color: levels === opt.v ? '#fff' : 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-sans)', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
                  <div style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px',
          borderTop: '0.5px solid var(--color-border-tertiary)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          background: 'var(--color-background-secondary)' }}>
          <button onClick={onClose}
            style={{ padding: '8px 16px', border: '0.5px solid var(--color-border-secondary)',
              borderRadius: 8, background: 'transparent', fontSize: 13,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
              color: 'var(--color-text-secondary)' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: '8px 20px', border: 'none', borderRadius: 8,
              background: '#1a1a18', color: '#fff', fontSize: 13,
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-sans)', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
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
    <>
      {/* Side panel */}
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}
        onClick={onClose}>
        <div
          style={{ width: 440, background: 'var(--color-background-primary)',
            height: '100%', overflowY: 'auto', padding: 24,
            boxShadow: '-4px 0 24px rgba(0,0,0,0.1)' }}
          onClick={e => e.stopPropagation()}>

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
              {/* ── Personal details ── */}
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
                    textAlign: 'right', maxWidth: 240, wordBreak: 'break-word' }}>
                    {value}
                  </span>
                </div>
              ))}

              {/* ── Reporting chain summary ── */}
              <div style={{ ...S.sectionLabel, marginTop: 20 }}>Reporting Chain</div>

              {[
                ['Direct Manager',    profile.direct_manager,    '#0369a1'],
                ['Reviewing Manager', profile.reviewing_manager,  '#6d28d9'],
                ['HOD',              profile.hod,               '#92400e'],
                ['Approval Levels',  null,                      null],
              ].map(([label, mgr, color]: any) => {
                if (label === 'Approval Levels') {
                  return (
                    <div key={label} style={S.row}>
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                        {label}
                      </span>
                      <span style={{ fontWeight: 500, fontSize: 13,
                        color: 'var(--color-text-primary)' }}>
                        {profile.approval_levels || 3} level(s)
                      </span>
                    </div>
                  );
                }
                return (
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
                );
              })}

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

      {/* Reporting chain modal */}
      {showModal && profile && (
        <ReportingChainModal
          user={user}
          profile={profile}
          managers={managers}
          onClose={() => setShowModal(false)}
          onSave={async (data) => {
            await updateMutation.mutateAsync(data);
          }}
        />
      )}
    </>
  );
}

const S: Record<string, any> = {
  sectionLabel: {
    fontSize: 11, fontWeight: 500,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
  },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '9px 0', borderBottom: '0.5px solid var(--color-border-tertiary)',
  },
};
