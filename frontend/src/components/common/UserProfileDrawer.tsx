import { useState } from 'react';
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
      borderRadius: 10, background: c.bg, color: c.color, display: 'inline-block', marginTop: 4 }}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

interface Props {
  user:   any;
  users:  any[];
  depts:  any[];
  onClose: () => void;
}

export default function UserProfileDrawer({ user, users, depts, onClose }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [dmId,    setDmId]    = useState('');
  const [rmId,    setRmId]    = useState('');
  const [hodId,   setHodId]   = useState('');
  const [levels,  setLevels]  = useState(3);

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
    },
  });

  const deptMap  = Object.fromEntries(depts.map((d: any) => [d.id, d.name]));
  const managers = users.filter((u: any) => u.id !== user.id);

  function startEdit() {
    setDmId(profile?.direct_manager?.id    || '');
    setRmId(profile?.reviewing_manager?.id || '');
    setHodId(profile?.hod?.id             || '');
    setLevels(profile?.approval_levels     || 3);
    setEditing(true);
  }

  const initials = user.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
        zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}>
      <div
        style={{ width: 440, background: '#fff', height: '100%',
          overflowY: 'auto', padding: 24, boxShadow: '-4px 0 24px rgba(0,0,0,0.1)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Employee Profile</span>
          <button onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: '#888' }}>✕</button>
        </div>

        {/* Avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16,
          background: '#f9f9f7', borderRadius: 12, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#e8f1fb',
            color: '#185fa5', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 600, flexShrink: 0 }}>
            {initials}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{user.full_name}</div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 2 }}>{user.email}</div>
            <RolePill role={user.role} />
          </div>
        </div>

        {isLoading && (
          <div style={{ color: '#888', fontSize: 13, textAlign: 'center', padding: 32 }}>
            Loading profile...
          </div>
        )}

        {profile && (
          <>
            {/* Personal details */}
            <div style={S.sectionLabel}>Personal Details</div>
            {[
              ['Employee Code',   profile.employee_id],
              ['Position',        profile.position_title || '—'],
              ['Grade',           profile.job_grade      || '—'],
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
              ['Approval Levels', `${profile.approval_levels || 3} level(s)`],
            ].map(([label, value]) => (
              <div key={label} style={S.row}>
                <span style={{ color: '#888', fontSize: 13 }}>{label}</span>
                <span style={{ fontWeight: 500, fontSize: 13, textAlign: 'right', maxWidth: 220 }}>
                  {value}
                </span>
              </div>
            ))}

            {/* Reporting chain */}
            <div style={{ ...S.sectionLabel, marginTop: 20 }}>Reporting Chain</div>

            {!editing ? (
              <>
                {[
                  ['Direct Manager',    profile.direct_manager,    '#0369a1'],
                  ['Reviewing Manager', profile.reviewing_manager,  '#6d28d9'],
                  ['HOD',              profile.hod,               '#92400e'],
                ].map(([label, mgr, color]: any) => (
                  <div key={label} style={S.row}>
                    <span style={{ color: '#888', fontSize: 13 }}>{label}</span>
                    {mgr ? (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 500, fontSize: 13, color }}>{mgr.name}</div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>{mgr.employee_id} · {mgr.role}</div>
                      </div>
                    ) : (
                      <span style={{ color: '#ccc', fontSize: 13 }}>Not assigned</span>
                    )}
                  </div>
                ))}

                <button onClick={startEdit} style={{ ...S.btnPrimary, width: '100%', marginTop: 16 }}>
                  Edit Reporting Managers
                </button>
              </>
            ) : (
              <div>
                {[
                  ['Direct Manager',    dmId,  setDmId],
                  ['Reviewing Manager', rmId,  setRmId],
                  ['HOD',              hodId, setHodId],
                ].map(([label, val, setter]: any) => (
                  <div key={label} style={{ marginBottom: 12 }}>
                    <label style={S.label}>{label}</label>
                    <select style={S.input} value={val} onChange={e => setter(e.target.value)}>
                      <option value="">— Not assigned —</option>
                      {managers.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.employee_id}) — {ROLE_LABELS[u.role] || u.role}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}

                <div style={{ marginBottom: 12 }}>
                  <label style={S.label}>Approval Levels</label>
                  <select style={S.input} value={levels} onChange={e => setLevels(Number(e.target.value))}>
                    <option value={1}>1 — Direct Manager only</option>
                    <option value={2}>2 — Direct Manager + HOD</option>
                    <option value={3}>3 — Direct Manager + Reviewing Manager + HOD</option>
                  </select>
                </div>

                {updateMutation.isError && (
                  <div style={{ color: '#991b1b', fontSize: 12, marginBottom: 10 }}>
                    Failed to update. Please try again.
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => updateMutation.mutate({
                      direct_manager_id:    dmId  || null,
                      reviewing_manager_id: rmId  || null,
                      hod_id:               hodId || null,
                      approval_levels:      levels,
                    })}
                    disabled={updateMutation.isPending}
                    style={S.btnPrimary}>
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => setEditing(false)} style={S.btnSm}>Cancel</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const S: Record<string, any> = {
  sectionLabel: {
    fontSize: 11, fontWeight: 500, color: '#888',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
  },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '9px 0', borderBottom: '0.5px solid #f0f0ee',
  },
  label:     { fontSize: 12, fontWeight: 500, color: '#666', display: 'block', marginBottom: 4 },
  input:     { width: '100%', padding: '7px 10px', border: '0.5px solid #d0d0cc', borderRadius: 8, fontSize: 13, background: '#fff', color: '#1a1a18', fontFamily: 'inherit', outline: 'none' },
  btnPrimary:{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#1a1a18', color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  btnSm:     { padding: '8px 14px', border: '0.5px solid #d0d0cc', borderRadius: 8, background: 'transparent', color: '#444', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
};
