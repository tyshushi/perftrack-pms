import { useState } from 'react';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userProfileApi } from '../../api/client';

@@ -19,16 +19,133 @@ function RolePill({ role }: { role: string }) {
const c = colors[role] || colors.STAFF;
return (
<span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px',
      borderRadius: 10, background: c.bg, color: c.color, display: 'inline-block', marginTop: 4 }}>
      borderRadius: 10, background: c.bg, color: c.color,
      display: 'inline-block', marginTop: 4 }}>
{ROLE_LABELS[role] || role}
</span>
);
}

// ── Searchable manager select ─────────────────────────────────────────────

function ManagerSelect({
  value, onChange, managers, placeholder,
}: {
  value: string;
  onChange: (id: string) => void;
  managers: any[];
  placeholder?: string;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen]     = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return managers.filter(m =>
      !q ||
      m.full_name.toLowerCase().includes(q) ||
      m.employee_id.toLowerCase().includes(q) ||
      (m.position_title || '').toLowerCase().includes(q)
    );
  }, [search, managers]);

  const selected = managers.find(m => m.id === value);

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger */}
      <div
        onClick={() => { setOpen(!open); setSearch(''); }}
        style={{ ...S.input, cursor: 'pointer', display: 'flex',
          justifyContent: 'space-between', alignItems: 'center',
          background: '#fff', userSelect: 'none' }}>
        {selected ? (
          <span>
            <strong>{selected.full_name}</strong>
            <span style={{ color: '#888', fontSize: 11 }}> · {selected.employee_id}</span>
          </span>
        ) : (
          <span style={{ color: '#aaa' }}>{placeholder || '— Not assigned —'}</span>
        )}
        <span style={{ color: '#888', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#fff', border: '0.5px solid #d0d0cc', borderRadius: 8,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 200,
          maxHeight: 280, display: 'flex', flexDirection: 'column' }}>

          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: '0.5px solid #f0f0ee' }}>
            <input
              autoFocus
              style={{ ...S.input, fontSize: 12, padding: '5px 8px' }}
              placeholder="Search by name, code, or position..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>

          {/* Options */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Clear option */}
            <div
              onClick={() => { onChange(''); setOpen(false); }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12,
                color: '#888', borderBottom: '0.5px solid #f5f5f3',
                background: !value ? '#f9f9f7' : 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f9f9f7')}
              onMouseLeave={e => (e.currentTarget.style.background = !value ? '#f9f9f7' : 'transparent')}>
              — Not assigned —
            </div>

            {filtered.length === 0 && (
              <div style={{ padding: '12px', color: '#aaa', fontSize: 12, textAlign: 'center' }}>
                No results for "{search}"
              </div>
            )}

            {filtered.map(m => (
              <div
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false); setSearch(''); }}
                style={{ padding: '8px 12px', cursor: 'pointer',
                  background: m.id === value ? '#f0f9ff' : 'transparent',
                  borderBottom: '0.5px solid #f5f5f3' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f9f9f7')}
                onMouseLeave={e => (e.currentTarget.style.background = m.id === value ? '#f0f9ff' : 'transparent')}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.full_name}</div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {m.employee_id}
                  {m.position_title ? ` · ${m.position_title}` : ''}
                  {' · '}{ROLE_LABELS[m.role] || m.role}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backdrop */}
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 199 }}
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────

interface Props {
  user:   any;
  users:  any[];
  depts:  any[];
  user:    any;
  users:   any[];
  depts:   any[];
onClose: () => void;
}

@@ -65,30 +182,35 @@ export default function UserProfileDrawer({ user, users, depts, onClose }: Props
setEditing(true);
}

  const initials = user.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const initials = user.full_name
    .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

return (
<div
style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}
onClick={onClose}>
<div
        style={{ width: 440, background: '#fff', height: '100%',
          overflowY: 'auto', padding: 24, boxShadow: '-4px 0 24px rgba(0,0,0,0.1)' }}
        style={{ width: 460, background: '#fff', height: '100%',
          overflowY: 'auto', padding: 24,
          boxShadow: '-4px 0 24px rgba(0,0,0,0.1)' }}
onClick={e => e.stopPropagation()}>

{/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 20 }}>
<span style={{ fontWeight: 600, fontSize: 15 }}>Employee Profile</span>
<button onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: '#888' }}>✕</button>
            style={{ border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: 20, color: '#888' }}>✕</button>
</div>

        {/* Avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16,
          background: '#f9f9f7', borderRadius: 12, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#e8f1fb',
            color: '#185fa5', display: 'flex', alignItems: 'center', justifyContent: 'center',
        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14,
          padding: 16, background: '#f9f9f7', borderRadius: 12, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%',
            background: '#e8f1fb', color: '#185fa5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
fontSize: 18, fontWeight: 600, flexShrink: 0 }}>
{initials}
</div>
@@ -111,8 +233,8 @@ export default function UserProfileDrawer({ user, users, depts, onClose }: Props
<div style={S.sectionLabel}>Personal Details</div>
{[
['Employee Code',   profile.employee_id],
              ['Position',        profile.position_title || '—'],
              ['Grade',           profile.job_grade      || '—'],
              ['Position',        profile.position_title  || '—'],
              ['Grade',           profile.job_grade       || '—'],
['Department',      profile.department_name || '—'],
['Division',        profile.division        || '—'],
['Section',         profile.section         || '—'],
@@ -127,8 +249,9 @@ export default function UserProfileDrawer({ user, users, depts, onClose }: Props
['Approval Levels', `${profile.approval_levels || 3} level(s)`],
].map(([label, value]) => (
<div key={label} style={S.row}>
                <span style={{ color: '#888', fontSize: 13 }}>{label}</span>
                <span style={{ fontWeight: 500, fontSize: 13, textAlign: 'right', maxWidth: 220 }}>
                <span style={{ color: '#888', fontSize: 13, flexShrink: 0 }}>{label}</span>
                <span style={{ fontWeight: 500, fontSize: 13,
                  textAlign: 'right', maxWidth: 240, wordBreak: 'break-word' }}>
{value}
</span>
</div>
@@ -149,44 +272,56 @@ export default function UserProfileDrawer({ user, users, depts, onClose }: Props
{mgr ? (
<div style={{ textAlign: 'right' }}>
<div style={{ fontWeight: 500, fontSize: 13, color }}>{mgr.name}</div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>{mgr.employee_id} · {mgr.role}</div>
                        <div style={{ fontSize: 11, color: '#aaa' }}>
                          {mgr.employee_id} · {mgr.role}
                        </div>
</div>
) : (
<span style={{ color: '#ccc', fontSize: 13 }}>Not assigned</span>
)}
</div>
))}

                <button onClick={startEdit} style={{ ...S.btnPrimary, width: '100%', marginTop: 16 }}>
                <button onClick={startEdit}
                  style={{ ...S.btnPrimary, width: '100%', marginTop: 16 }}>
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
                  <label style={S.label}>Direct Manager</label>
                  <ManagerSelect
                    value={dmId}
                    onChange={setDmId}
                    managers={managers}
                    placeholder="— Not assigned —"
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={S.label}>Reviewing Manager</label>
                  <ManagerSelect
                    value={rmId}
                    onChange={setRmId}
                    managers={managers}
                    placeholder="— Not assigned —"
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={S.label}>HOD</label>
                  <ManagerSelect
                    value={hodId}
                    onChange={setHodId}
                    managers={managers}
                    placeholder="— Not assigned —"
                  />
                </div>
                <div style={{ marginBottom: 16 }}>
<label style={S.label}>Approval Levels</label>
                  <select style={S.input} value={levels} onChange={e => setLevels(Number(e.target.value))}>
                  <select style={S.input} value={levels}
                    onChange={e => setLevels(Number(e.target.value))}>
<option value={1}>1 — Direct Manager only</option>
<option value={2}>2 — Direct Manager + HOD</option>
                    <option value={3}>3 — Direct Manager + Reviewing Manager + HOD</option>
                    <option value={3}>3 — Direct + Reviewing + HOD</option>
</select>
</div>

@@ -208,7 +343,9 @@ export default function UserProfileDrawer({ user, users, depts, onClose }: Props
style={S.btnPrimary}>
{updateMutation.isPending ? 'Saving...' : 'Save Changes'}
</button>
                  <button onClick={() => setEditing(false)} style={S.btnSm}>Cancel</button>
                  <button onClick={() => setEditing(false)} style={S.btnSm}>
                    Cancel
                  </button>
</div>
</div>
)}
@@ -224,12 +361,9 @@ const S: Record<string, any> = {
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
  row:   { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 0', borderBottom: '0.5px solid #f0f0ee' },
  label: { fontSize: 12, fontWeight: 500, color: '#666', display: 'block', marginBottom: 4 },
  input: { width: '100%', padding: '7px 10px', border: '0.5px solid #d0d0cc', borderRadius: 8, fontSize: 13, background: '#fff', color: '#1a1a18', fontFamily: 'inherit', outline: 'none' },
  btnPrimary: { padding: '8px 16px', border: 'none', borderRadius: 8, background: '#1a1a18', color: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  btnSm:      { padding: '8px 14px', border: '0.5px solid #d0d0cc', borderRadius: 8, background: 'transparent', color: '#444', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
};
