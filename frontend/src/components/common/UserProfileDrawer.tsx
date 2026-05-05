import { useState, useMemo } from 'react';
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

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: '50%',
      background: '#e8f1fb', color: '#185fa5', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.32), fontWeight: 600 }}>
      {initials}
    </div>
  );
}

// ── Inline searchable manager selector ────────────────────────────────────

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

  function handleOpen() {
    setSearch('');
    onOpen();
  }

  function handleAssign(m: any) {
    onAssign(m);
    setSearch('');
    onClose();
  }

  return (
    <div style={{ marginBottom: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)',
        marginBottom: 5 }}>{slot.label}</div>

      {/* Assigned pill or empty state */}
      {!isOpen && (
        assignedUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', borderRadius: 8,
            border: '0.5px solid var(--color-border-tertiary)',
            background: slot.bg + '30' }}>
            <Avatar name={assignedUser.full_name} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500,
                color: slot.color,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {assignedUser.full_name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                {assignedUser.employee_id}
                {assignedUser.job_grade ? ` · ${assignedUser.job_grade}` : ''}
              </div>
            </div>
            <button onClick={handleOpen} title="Change"
              style={{ border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 12,
                color: 'var(--color-text-secondary)', padding: '2px 4px' }}>
              ✎
            </button>
            <button onClick={onClear} title="Remove"
              style={{ border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 13,
                color: 'var(--color-text-tertiary)', padding: '2px 4px' }}>
              ✕
            </button>
          </div>
        ) : (
          <button onClick={handleOpen}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8,
              border: '0.5px dashed var(--color-border-secondary)',
              background: 'transparent', cursor: 'pointer', textAlign: 'left',
              fontSize: 12, color: 'var(--color-text-tertiary)',
              fontFamily: 'var(--font-sans)' }}>
            + Assign {slot.label}
          </button>
        )
      )}

      {/* Expanded search */}
      {isOpen && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <input
              autoFocus
              style={{ flex: 1, padding: '7px 10px',
                border: `1px solid ${slot.color}`,
                borderRadius: 8, fontSize: 12,
                background: 'var(--color-background-primary)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-sans)', outline: 'none' }}
              placeholder={`Search for ${slot.label.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button onClick={() => { onClose(); setSearch(''); }}
              style={{ padding: '6px 10px', border: '0.5px solid var(--color-border-secondary)',
                borderRadius: 8, background: 'transparent', cursor: 'pointer',
                fontSize: 12, color: 'var(--color-text-secondary)',
                fontFamily: 'var(--font-sans)' }}>
              Cancel
            </button>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div style={{ border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 8, overflow: 'hidden',
              background: 'var(--color-background-primary)',
              maxHeight: 220, overflowY: 'auto' }}>
              {results.map((m: any, i: number) => (
                <div key={m.id}
                  onClick={() => handleAssign(m)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', cursor: 'pointer',
                    borderBottom: i < results.length - 1
                      ? '0.5px solid var(--color-border-tertiary)' : 'none',
                    background: 'var(--color-background-primary)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-background-primary)')}>
                  <Avatar name={m.full_name} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500,
                      color: 'var(--color-text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap' }}>
                      {m.full_name}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                      {m.employee_id}
                      {m.position_title ? ` · ${m.position_title}` : ''}
                      {m.job_grade ? ` · ${m.job_grade}` : ''}
                      {' · '}{ROLE_LABELS[m.role] || m.role}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, color: slot.color,
                    fontWeight: 500, flexShrink: 0 }}>Select</span>
                </div>
              ))}
            </div>
          )}

          {search.trim() && results.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 12,
              color: 'var(--color-text-tertiary)', textAlign: 'center',
              border: '0.5px solid var(--color-border-tertiary)', borderRadius: 8 }}>
              No results for "{search}"
            </div>
          )}
        </div>
      )}
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
  const [editing,    setEditing]    = useState(false);
  const [openSlot,   setOpenSlot]   = useState<SlotKey | null>(null);
  const [assignments, setAssignments] = useState<Record<string, any>>({});
  const [levels,     setLevels]     = useState(3);
  const [saveOk,     setSaveOk]     = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile', user.id],
    queryFn:  () => userProfileApi.getProfile(user.id).then(r => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => userProfileApi.updateManagers(user.id, data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['user-profile', user.id] });
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditing(false);
      setOpenSlot(null);
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
    setEditing(true);
    setOpenSlot(null);
  }

  function cancelEditing() {
    setEditing(false);
    setOpenSlot(null);
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
  const deptMap  = Object.fromEntries(depts.map((d: any) => [d.id, d.name]));
  const initials = user.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.3)', zIndex: 1000 }}
        onClick={onClose} />

      {/* Panel */}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
        background: 'var(--color-background-primary)',
        overflowY: 'auto', zIndex: 1001,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}
        onClick={e => e.stopPropagation()}>

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

          {/* Avatar + name card */}
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
                    style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6,
                      border: '0.5px solid var(--color-border-secondary)',
                      background: 'transparent', cursor: 'pointer',
                      color: 'var(--color-text-secondary)',
                      fontFamily: 'var(--font-sans)', fontWeight: 400,
                      textTransform: 'none', letterSpacing: 0 }}>
                    Edit
                  </button>
                )}
              </div>

              {/* View mode */}
              {!editing && (
                <>
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
                        <span style={{ color: 'var(--color-text-tertiary)',
                          fontSize: 13 }}>Not assigned</span>
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
                  {saveOk && (
                    <div style={{ marginTop: 10, padding: '8px 12px',
                      background: '#dcfce7', borderRadius: 8,
                      fontSize: 12, color: '#166534', textAlign: 'center' }}>
                      ✓ Reporting chain saved
                    </div>
                  )}
                </>
              )}

              {/* Edit mode — inline slots */}
              {editing && (
                <div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14,
                    marginBottom: 16 }}>
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

                  {/* Approval levels */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)',
                      marginBottom: 6 }}>Approval Levels</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        { v: 1, label: '1 level',  sub: 'Direct only' },
                        { v: 2, label: '2 levels', sub: 'Direct + HOD' },
                        { v: 3, label: '3 levels', sub: 'All three' },
                      ].map(opt => (
                        <button key={opt.v} onClick={() => setLevels(opt.v)}
                          style={{ flex: 1, padding: '8px 6px', borderRadius: 8,
                            cursor: 'pointer', fontFamily: 'var(--font-sans)',
                            border: `0.5px solid ${levels === opt.v
                              ? 'var(--color-text-primary)'
                              : 'var(--color-border-secondary)'}`,
                            background: levels === opt.v
                              ? 'var(--color-text-primary)' : 'transparent',
                            color: levels === opt.v
                              ? 'var(--color-background-primary)'
                              : 'var(--color-text-secondary)',
                            textAlign: 'center' }}>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{opt.label}</div>
                          <div style={{ fontSize: 10, marginTop: 1, opacity: 0.7 }}>
                            {opt.sub}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleSave}
                      disabled={updateMutation.isPending}
                      style={{ flex: 1, padding: '9px', border: 'none',
                        borderRadius: 8,
                        background: 'var(--color-text-primary)',
                        color: 'var(--color-background-primary)',
                        fontSize: 13, cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        opacity: updateMutation.isPending ? 0.7 : 1 }}>
                      {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button onClick={cancelEditing}
                      style={{ padding: '9px 16px',
                        border: '0.5px solid var(--color-border-secondary)',
                        borderRadius: 8, background: 'transparent',
                        fontSize: 13, cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        color: 'var(--color-text-secondary)' }}>
                      Cancel
                    </button>
                  </div>

                  {updateMutation.isError && (
                    <div style={{ marginTop: 8, fontSize: 12,
                      color: 'var(--color-text-danger)', textAlign: 'center' }}>
                      Failed to save. Please try again.
                    </div>
                  )}
                </div>
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
    fontSize: 11, fontWeight: 500,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 8,
  },
  row: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '9px 0',
    borderBottom: '0.5px solid var(--color-border-tertiary)',
  },
};
