import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { groupsApi, usersApi } from '../api/client';
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

function Avatar({ name }: { name: string }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{ width: 28, height: 28, borderRadius: '50%',
      background: '#e8f1fb', color: '#185fa5', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 10, fontWeight: 600 }}>
      {initials}
    </div>
  );
}

function GroupMembersPanel({
  group, allUsers, onClose,
}: {
  group: any; allUsers: any[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search,    setSearch]   = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [selected,  setSelected] = useState<string[]>([]);
  const [showAdd,   setShowAdd]  = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ['group-members', group.id],
    queryFn:  () => groupsApi.getMembers(group.id).then(r => r.data),
  });

  const memberIds = new Set((members as any[]).map((m: any) => m.user_id));

  const addMutation = useMutation({
    mutationFn: () => groupsApi.addMembers(group.id, selected),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['group-members', group.id] });
      qc.invalidateQueries({ queryKey: ['groups'] });
      setSelected([]); setAddSearch(''); setShowAdd(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => groupsApi.removeMember(group.id, userId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['group-members', group.id] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const filteredMembers = useMemo(() => {
    const q = search.toLowerCase();
    return (members as any[]).filter(m =>
      !q ||
      m.full_name.toLowerCase().includes(q) ||
      m.employee_id.toLowerCase().includes(q) ||
      (m.category || '').toLowerCase().includes(q)
    );
  }, [members, search]);

  const eligibleToAdd = useMemo(() => {
    const q = addSearch.toLowerCase();
    return allUsers.filter(u =>
      !memberIds.has(u.id) &&
      (!q ||
        u.full_name.toLowerCase().includes(q) ||
        u.employee_id.toLowerCase().includes(q) ||
        (u.category || '').toLowerCase().includes(q) ||
        (u.hierarchy || '').toLowerCase().includes(q) ||
        (u.job_grade || '').toLowerCase().includes(q)
      )
    );
  }, [allUsers, memberIds, addSearch]);

  function toggleSelect(id: string) {
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
      <div style={{ position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.35)' }} onClick={onClose} />
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0,
        width: 480, background: C.bg,
        overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        fontFamily: C.font }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: 24 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16, color: C.text }}>
                {group.name}
              </div>
              {group.description && (
                <div style={{ fontSize: 12, color: C.textSecond, marginTop: 2 }}>
                  {group.description}
                </div>
              )}
            </div>
            <button onClick={onClose}
              style={{ border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 20, color: C.textSecond,
                lineHeight: 1 }}>✕</button>
          </div>

          {/* Add members button */}
          {!showAdd ? (
            <button onClick={() => setShowAdd(true)} style={S.btnPrimary}>
              + Add Members
            </button>
          ) : (
            <div style={{ ...S.card, marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: C.text,
                marginBottom: 10 }}>Add Members</div>
              <input style={{ ...S.input, marginBottom: 8 }}
                autoFocus
                placeholder="Search by name, code, category, hierarchy, grade..."
                value={addSearch}
                onChange={e => { setAddSearch(e.target.value); setSelected([]); }} />

              <div style={{ border: `1px solid ${C.borderLight}`,
                borderRadius: 8, maxHeight: 220, overflowY: 'auto',
                marginBottom: 8, background: C.bg }}>
                {eligibleToAdd.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center',
                    color: C.textTertiary, fontSize: 13 }}>
                    {addSearch ? 'No results' : 'All employees are already members'}
                  </div>
                )}
                {eligibleToAdd.slice(0, 30).map((u: any, i: number) => (
                  <div key={u.id}
                    onClick={() => toggleSelect(u.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', cursor: 'pointer',
                      borderBottom: i < Math.min(eligibleToAdd.length, 30) - 1
                        ? `1px solid ${C.borderLight}` : 'none',
                      background: selected.includes(u.id) ? '#f0fdf4' : C.bg }}
                    onMouseEnter={e => {
                      if (!selected.includes(u.id))
                        e.currentTarget.style.background = C.bgSecondary;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background =
                        selected.includes(u.id) ? '#f0fdf4' : C.bg;
                    }}>
                    <input type="checkbox" readOnly
                      checked={selected.includes(u.id)} />
                    <Avatar name={u.full_name} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500,
                        color: C.text, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.full_name}
                      </div>
                      <div style={{ fontSize: 11, color: C.textSecond }}>
                        {u.employee_id}
                        {u.category  ? ` · ${u.category}`  : ''}
                        {u.hierarchy ? ` · ${u.hierarchy}`  : ''}
                        {u.job_grade ? ` · ${u.job_grade}`  : ''}
                      </div>
                    </div>
                    {selected.includes(u.id) && (
                      <span style={{ fontSize: 11, color: '#166534',
                        fontWeight: 600, flexShrink: 0 }}>✓</span>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button style={S.btnSm}
                  onClick={() => setSelected(eligibleToAdd.slice(0, 30).map(u => u.id))}>
                  Select all
                </button>
                <button style={S.btnSm} onClick={() => setSelected([])}>
                  Clear
                </button>
                <button
                  onClick={() => addMutation.mutate()}
                  disabled={selected.length === 0 || addMutation.isPending}
                  style={{ ...S.btnPrimary,
                    opacity: selected.length === 0 ? 0.5 : 1 }}>
                  {addMutation.isPending
                    ? 'Adding...'
                    : `Add ${selected.length} member(s)`}
                </button>
                <button style={S.btnSm}
                  onClick={() => { setShowAdd(false); setSelected([]); setAddSearch(''); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Current members */}
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textSecond,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              marginBottom: 10, marginTop: showAdd ? 0 : 16 }}>
              Current Members ({(members as any[]).length})
            </div>

            <input style={{ ...S.input, marginBottom: 10 }}
              placeholder="Search current members..."
              value={search}
              onChange={e => setSearch(e.target.value)} />

            {filteredMembers.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24,
                color: C.textSecond, fontSize: 13,
                border: `1px dashed ${C.border}`, borderRadius: 8 }}>
                No members yet. Click Add Members above.
              </div>
            )}

            {filteredMembers.map((m: any, i: number) => (
              <div key={m.user_id}
                style={{ display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 0',
                  borderBottom: i < filteredMembers.length - 1
                    ? `1px solid ${C.borderLight}` : 'none' }}>
                <Avatar name={m.full_name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.text,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap' }}>
                    {m.full_name}
                  </div>
                  <div style={{ fontSize: 11, color: C.textSecond }}>
                    {m.employee_id}
                    {m.category  ? ` · ${m.category}`  : ''}
                    {m.hierarchy ? ` · ${m.hierarchy}`  : ''}
                    {m.job_grade ? ` · ${m.job_grade}`  : ''}
                    {' · '}{ROLE_LABELS[m.role] || m.role}
                  </div>
                </div>
                <button
                  onClick={() => removeMutation.mutate(m.user_id)}
                  disabled={removeMutation.isPending}
                  style={{ border: 'none', background: 'transparent',
                    cursor: 'pointer', fontSize: 13,
                    color: C.textTertiary, padding: '2px 6px',
                    flexShrink: 0 }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GroupsPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName,  setNewName]  = useState('');
  const [newDesc,  setNewDesc]  = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [search,   setSearch]   = useState('');

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn:  () => groupsApi.list().then(r => r.data),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn:  () => usersApi.list().then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: () => groupsApi.create({ name: newName, description: newDesc }),
    onSuccess:  (res) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      setCreating(false); setNewName(''); setNewDesc('');
      setSelected(res.data);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => groupsApi.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (groups as any[]).filter(g =>
      !q ||
      g.name.toLowerCase().includes(q) ||
      (g.description || '').toLowerCase().includes(q)
    );
  }, [groups, search]);

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4,
            color: C.text }}>Employee Groups</h1>
          <p style={{ fontSize: 13, color: C.textSecond }}>
            Create and manage custom groups for KPI weight rules and templates
          </p>
        </div>
        <button onClick={() => setCreating(true)} style={S.btnPrimary}>
          + New Group
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div style={S.card}>
          <div style={{ fontWeight: 600, marginBottom: 12, color: C.text }}>
            New Group
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={S.label}>Group Name</label>
            <input style={S.input} value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Corporate Staff, Apex-1, FY2026 Bonus Pool"
              autoFocus />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Description (optional)</label>
            <input style={S.input} value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="e.g. All corporate employees with 30% Financials minimum" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => createMutation.mutate()}
              disabled={!newName || createMutation.isPending}
              style={{ ...S.btnPrimary, opacity: !newName ? 0.5 : 1 }}>
              {createMutation.isPending ? 'Creating...' : 'Create Group'}
            </button>
            <button onClick={() => { setCreating(false); setNewName(''); setNewDesc(''); }}
              style={S.btnSm}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input style={{ ...S.input, maxWidth: 340 }} value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search groups..." />
      </div>

      {/* Empty state */}
      {filtered.length === 0 && !creating && (
        <div style={{ textAlign: 'center', padding: 48,
          color: C.textSecond, fontSize: 13,
          border: `1px dashed ${C.border}`, borderRadius: 10 }}>
          No groups yet. Create your first group to assign KPI rules.
        </div>
      )}

      {/* Group cards */}
      <div style={{ display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 10 }}>
        {filtered.map((g: any) => (
          <div key={g.id} style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: C.text,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' }}>
                  {g.name}
                </div>
                {g.description && (
                  <div style={{ fontSize: 12, color: C.textSecond, marginTop: 2 }}>
                    {g.description}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  if (window.confirm(`Delete group "${g.name}"?`))
                    deleteMutation.mutate(g.id);
                }}
                style={{ border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: 13, flexShrink: 0,
                  color: C.textTertiary, padding: '0 4px', marginLeft: 8 }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: 10, borderTop: `1px solid ${C.borderLight}` }}>
              <span style={{ fontSize: 12, color: C.textSecond }}>
                {g.member_count} member{g.member_count !== 1 ? 's' : ''}
              </span>
              <button onClick={() => setSelected(g)} style={S.btnSm}>
                Manage Members →
              </button>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <GroupMembersPanel
          group={selected}
          allUsers={users as any[]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

const S: Record<string, any> = {
  card:      { background: C.bg, border: `1px solid ${C.borderLight}`, borderRadius: 10, padding: 16, marginBottom: 12 },
  label:     { fontSize: 12, fontWeight: 500, color: C.textSecond, display: 'block', marginBottom: 4 },
  input:     { width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, background: C.bg, color: C.text, fontFamily: C.font, outline: 'none' },
  btnPrimary:{ padding: '8px 16px', border: 'none', borderRadius: 8, background: C.text, color: '#ffffff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: C.font },
  btnSm:     { padding: '6px 10px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, color: C.textSecond, fontSize: 12, cursor: 'pointer', fontFamily: C.font },
};
