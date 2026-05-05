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

// ── Solid color tokens ────────────────────────────────────────────────────
// We deliberately do NOT use CSS variables for backgrounds here. The host
// app's --color-background-primary appears to resolve to a transparent
// value in this context, which made the drawer see-through. Hard hex
// values guarantee the drawer is always opaque.
const C = {
  bg:           '#ffffff',
  bgSecondary:  '#f7f7f5',
  bgTertiary:   '#efefec',
  text:         '#1a1a1a',
  textSecond:   '#6b6b6b',
  textTertiary: '#9a9a9a',
  border:       '#e2e2dd',
  borderLight:  '#ececea',
  danger:       '#b91c1c',
  font:         '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
};

// ── Inline searchable manager selector ────────────────────────────────────

const SLOT_CONFIG = [
  { key: 'direct_manager_id',    label: 'Direct Manager',    color: '#0369a1', bg: '#e0f2fe' },
  { key: 'reviewing_manager_id', label: 'Reviewing Manager', color: '#6d28d9', bg: '#ede9fe' },
  { key: 'hod_id',               label: 'HOD',               color: '#92400e', bg: '#fef3c7' },
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
      <div style={{ fontSize: 11, color: C.textSecond, marginBottom: 5 }}>
        {slot.label}
      </div>

      {/* Assigned pill or empty state */}
      {!isOpen && (
        assignedUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', borderRadius: 8,
            border: `1px solid ${slot.color}33`,
            background: slot.bg }}>
            <Avatar name={assignedUser.full_name} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600,
                color: slot.color,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {assignedUser.full_name}
              </div>
              <div style={{ fontSize: 10, color: C.textSecond }}>
                {assignedUser.employee_id}
                {assignedUser.job_grade ? ` · ${assignedUser.job_grade}` : ''}
              </div>
            </div>
            <button onClick={handleOpen} title="Change"
              style={{ border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 12,
                color: C.textSecond, padding: '2px 4px' }}>
              ✎
            </button>
            <button onClick={onClear} title="Remove"
              style={{ border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 13,
                color: C.textTertiary, padding: '2px 4px' }}>
              ✕
            </button>
          </div>
        ) : (
          <button onClick={handleOpen}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8,
              border: `1px dashed ${C.border}`,
              background: C.bg, cursor: 'pointer', textAlign: 'left',
              fontSize: 12, color: C.textTertiary,
              fontFamily: C.font }}>
            + Assign {slot.label}
          </button>
        )
      )}

      {/* Expanded search */}
      {isOpen && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input
              autoFocus
              style={{ flex: 1, padding: '8px 10px',
                border: `1px solid ${slot.color}`,
                borderRadius: 8, fontSize: 12,
                background: C.bg,
                color: C.text,
                fontFamily: C.font, outline: 'none' }}
              placeholder={`Search for ${slot.label.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button onClick={() => { onClose(); setSearch(''); }}
              style={{ padding: '6px 10px',
                border: `1px solid ${C.border}`,
                borderRadius: 8, background: C.bg, cursor: 'pointer',
                fontSize: 12, color: C.textSecond,
                fontFamily: C.font }}>
              Cancel
            </button>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div style={{ border: `1px solid ${C.borderLight}`,
              borderRadius: 8, overflow: 'hidden',
              background: C.bg,
              maxHeight: 220, overflowY: 'auto' }}>
              {results.map((m: any, i: number) => (
                <div key={m.id}
                  onClick={() => handleAssign(m)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', cursor: 'pointer',
                    borderBottom: i < results.length - 1
                      ? `1px solid ${C.borderLight}` : 'none',
                    background: C.bg }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.bgSecondary)}
                  onMouseLeave={e => (e.currentTarget.style.background = C.bg)}>
                  <Avatar name={m.full_name} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500,
                      color: C.text,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap' }}>
                      {m.full_name}
                    </div>
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
  const initials = user.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <>
      {/* Backdrop — opaque enough that the table behind doesn't bleed through */}
      <div style={{ position: 'fixed', inset: 0,
        background: 'rgba(15, 18, 22, 0.45)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        zIndex: 1000 }}
        onClick={onClose} />

      {/* Panel — hard white background. Do NOT use CSS vars here — if the
          host app's --color-background-primary is unset or transparent, the
          drawer becomes see-through. White is the safe choice in both themes
          since this drawer is always shown on a light surface. */}
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
        background: '#ffffff',
        overflowY: 'auto', zIndex: 1001,
        borderLeft: '1px solid #ececea',
        boxShadow: '-12px 0 32px rgba(0,0,0,0.18)',
        fontFamily: C.font,
        color: '#1a1a1a' }}
        onClick={e => e.stopPropagation()}>

        <div style={{ padding: 24 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 20 }}>
            <span style={{ fontWeight: 600, fontSize: 15,
              color: C.text }}>Employee Profile</span>
            <button onClick={onClose}
              style={{ border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 20,
                color: C.textSecond, lineHeight: 1, padding: 4 }}>✕</button>
          </div>

          {/* Avatar + name card */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14,
            padding: 16, background: C.bgSecondary,
            border: `1px solid ${C.borderLight}`,
            borderRadius: 12, marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%',
              background: '#e8f1fb', color: '#185fa5', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 600 }}>
              {initials}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16,
                color: C.text }}>{user.full_name}</div>
              <div style={{ fontSize: 12, color: C.textSecond,
                marginBottom: 2 }}>{user.email}</div>
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
              <div style={{ background: C.bg,
                border: `1px solid ${C.borderLight}`,
                borderRadius: 12, padding: '0 14px', marginBottom: 4 }}>
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
                  <div key={label} style={{
                    ...S.row,
                    borderBottom: i < arr.length - 1
                      ? `1px solid ${C.borderLight}` : 'none',
                  }}>
                    <span style={{ color: C.textSecond,
                      fontSize: 13, flexShrink: 0 }}>{label}</span>
                    <span style={{ fontWeight: 500, fontSize: 13,
                      color: C.text,
                      textAlign: 'right', maxWidth: 240,
                      wordBreak: 'break-word' }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Reporting chain */}
              <div style={{ ...S.sectionLabel, marginTop: 24,
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center' }}>
                <span>Reporting Chain</span>
                {!editing && (
                  <button onClick={startEditing}
                    style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6,
                      border: `1px solid ${C.border}`,
                      background: C.bg, cursor: 'pointer',
                      color: C.textSecond,
                      fontFamily: C.font, fontWeight: 500,
                      textTransform: 'none', letterSpacing: 0 }}>
                    Edit
                  </button>
                )}
              </div>

              {/* View mode */}
              {!editing && (
                <>
                  <div style={{ background: C.bg,
                    border: `1px solid ${C.borderLight}`,
                    borderRadius: 12, padding: '0 14px' }}>
                    {[
                      ['Direct Manager',    profile.direct_manager,    '#0369a1'],
                      ['Reviewing Manager', profile.reviewing_manager, '#6d28d9'],
                      ['HOD',               profile.hod,               '#92400e'],
                      ['Approval Levels',   null,                      null],
                    ].map(([label, mgr, color]: any, i, arr) => (
                      <div key={label} style={{
                        ...S.row,
                        borderBottom: i < arr.length - 1
                          ? `1px solid ${C.borderLight}` : 'none',
                      }}>
                        <span style={{ color: C.textSecond, fontSize: 13 }}>
                          {label}
                        </span>
                        {label === 'Approval Levels' ? (
                          <span style={{ fontWeight: 500, fontSize: 13,
                            color: C.text }}>
                            {profile.approval_levels || 3} level(s)
                          </span>
                        ) : mgr ? (
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 500, fontSize: 13, color }}>
                              {mgr.name}
                            </div>
                            <div style={{ fontSize: 11,
                              color: C.textTertiary }}>
                              {mgr.employee_id}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: C.textTertiary,
                            fontSize: 13 }}>Not assigned</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {saveOk && (
                    <div style={{ marginTop: 12, padding: '8px 12px',
                      background: '#dcfce7',
                      border: '1px solid #86efac',
                      borderRadius: 8,
                      fontSize: 12, color: '#166534', textAlign: 'center' }}>
                      ✓ Reporting chain saved
                    </div>
                  )}
                </>
              )}

              {/* Edit mode — inline slots */}
              {editing && (
                <div style={{ background: C.bg,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: 12, padding: 14 }}>
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
                    <div style={{ fontSize: 11, color: C.textSecond,
                      marginBottom: 6 }}>Approval Levels</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        { v: 1, label: '1 level',  sub: 'Direct only' },
                        { v: 2, label: '2 levels', sub: 'Direct + HOD' },
                        { v: 3, label: '3 levels', sub: 'All three' },
                      ].map(opt => (
                        <button key={opt.v} onClick={() => setLevels(opt.v)}
                          style={{ flex: 1, padding: '8px 6px', borderRadius: 8,
                            cursor: 'pointer', fontFamily: C.font,
                            border: `1px solid ${levels === opt.v
                              ? C.text
                              : C.border}`,
                            background: levels === opt.v
                              ? C.text : C.bg,
                            color: levels === opt.v
                              ? '#ffffff'
                              : C.textSecond,
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
                      style={{ flex: 1, padding: '10px', border: 'none',
                        borderRadius: 8,
                        background: C.text,
                        color: '#ffffff',
                        fontSize: 13, fontWeight: 500, cursor: 'pointer',
                        fontFamily: C.font,
                        opacity: updateMutation.isPending ? 0.7 : 1 }}>
                      {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button onClick={cancelEditing}
                      style={{ padding: '10px 16px',
                        border: `1px solid ${C.border}`,
                        borderRadius: 8, background: C.bg,
                        fontSize: 13, cursor: 'pointer',
                        fontFamily: C.font,
                        color: C.textSecond }}>
                      Cancel
                    </button>
                  </div>

                  {updateMutation.isError && (
                    <div style={{ marginTop: 8, fontSize: 12,
                      color: C.danger, textAlign: 'center' }}>
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
    fontSize: 11, fontWeight: 600,
    color: C.textSecond,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 10,
  },
  row: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '11px 0',
  },
};
