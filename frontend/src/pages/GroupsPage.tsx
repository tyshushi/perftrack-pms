import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { groupsApi, usersApi } from '../api/client';

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

// ── Group Members Panel ────────────────────────────────────────────────────

function GroupMembersPanel({
  group, allUsers, onClose,
}: {
  group:    any;
  allUsers: any[];
  onClose:  () => void;
}) {
  const qc = useQueryClient();
  const [search,    setSearch]    = useState('');
  const [addSearch, setAddSearch] = useState('');
  const [selected,  setSelected]  = useState<string[]>([]);

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
      setSelected([]);
      setAddSearch('');
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
        background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0,
        width: 520, background: 'var(--color-background-primary)',
        overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: 24 }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15,
                color: 'var(--color-text-primary)' }}>{group.name}</div>
              {group.description && (
                <div style={{ fontSize: 12,
                  color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  {group.description}
                </div>
              )}
            </div>
            <button onClick={onClose}
              style={{ border: 'none', background: 'transparent',
                cursor: 'pointer', fontSize: 20,
                color: 'var(--color-text-secondary)' }}>✕</button>
          </div>

          {/* Add members section */}
          <div style={S.card}>
            <div style={{ fontWeight: 500, marginBottom: 8,
              fontSize: 13, color: 'var(--color-text-primary)' }}>
              Add Members
            </div>
            <input style={{ ...S.input, marginBottom: 8 }}
              placeholder="Search by name, code, category, hierarchy, grade..."
              value={addSearch}
              onChange={e => { setAddSearch(e.target.value); setSelected([]); }} />

            {addSearch && (
              <>
                <div style={{ border: '0.5px solid var(--color-border-tertiary)',
                  borderRadius: 8, maxHeight: 200, overflowY: 'auto',
                  marginBottom: 8 }}>
                  {eligibleToAdd.length === 0 && (
                    <div style={{ padding: 12, textAlign: 'center',
                      color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                      No results
                    </div>
                  )}
                  {eligibleToAdd.slice(0, 20).map((u: any, i: number) => (
                    <div key={u.id}
                      onClick={() => toggleSelect(u.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 10px', cursor: 'pointer',
                        borderBottom: i < eligibleToAdd.length - 1
                          ? '0.5px solid var(--color-border-tertiary)' : 'none',
                        background: selected.includes(u.id)
                          ? '#f0fdf4' : 'transparent' }}
                      onMouseEnter={e => {
                        if (!selected.includes(u.id))
                          e.currentTarget.style.background =
                            'var(--color-background-secondary)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background =
                          selected.includes(u.id) ? '#f0fdf4' : 'transparent';
                      }}>
                      <input type="checkbox" readOnly
                        checked={selected.includes(u.id)} />
                      <Avatar name={u.full_name} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500,
                          color: 'var(--color-text-primary)' }}>
                          {u.full_name}
                        </div>
                        <div style={{ fontSize: 11,
                          color: 'var(--color-text-secondary)' }}>
                          {u.employee_id}
                          {u.category ? ` · ${u.category}` : ''}
                          {u.hierarchy ? ` · ${u.hierarchy}` : ''}
                          {u.job_grade ? ` · ${u.job_grade}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={() => setSelected(eligibleToAdd.slice(0, 20).map(u => u.id))}
                    style={S.btnSm}>
                    Select all
                  </button>
                  <button onClick={() => setSelected([])} style={S.btnSm}>
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
                </div>
              </>
            )}
          </div>

          {/* Current members */}
          <div style={{ ...S.sectionLabel, marginTop: 4 }}>
            Current Members ({(members as any[]).length})
          </div>

          <input style={{ ...S.input, marginBottom: 10 }}
            placeholder="Search current members..."
            value={search}
            onChange={e => setSearch(e.target.value)} />

          {filteredMembers.length === 0 && (
            <div style={{ textAlign: 'center', padding: 24,
              color: 'var(--color-text-secondary)', fontSize: 13,
              border: '0.5px dashed var(--color-border-secondary)',
              borderRadius: 8 }}>
              No members yet. Search above to add employees.
            </div>
          )}

          {filteredMembers.map((m: any) => (
            <div key={m.user_id}
              style={{ display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 0',
                borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <Avatar name={m.full_name} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500,
                  color: 'var(--color-text-primary)' }}>
                  {m.full_name}
                </div>
                <div style={{ fontSize: 11,
                  color: 'var(--color-text-secondary)' }}>
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
                  cursor: 'pointer', fontSize: 12,
                  color: 'var(--color-text-tertiary)', padding: '2px 6px' }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function GroupsPage() {
  const qc = useQueryClient();
  const [creating,  setCreating]  = useState(false);
  const [newName,   setNewName]   = useState('');
  const [newDesc,   setNewDesc]   = useState('');
  const [selected,  setSelected]  = useState<any>(null);
  const [search,    setSearch]    = useState('');

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
      setCreating(false);
      setNewName(''); setNewDesc('');
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4,
            color: 'var(--color-text-primary)' }}>Employee Groups</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Create and manage custom groups for KPI weight rules and templates
          </p>
        </div>
        <button onClick={() => setCreating(true)} style={S.btnPrimary}>
          + New Group
        </button>
      </div>

      {/* Create group form */}
      {creating && (
        <div style={S.card}>
          <div style={{ fontWeight: 500, marginBottom: 12,
            color: 'var(--color-text-primary)' }}>New Group</div>
          <div style={{ marginBottom: 10 }}>
            <label style={S.label}>Group Name</label>
            <input style={S.input} value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Corporate Staff, Apex-1, FY2026 Bonus Pool" />
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
        <input style={S.input} value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search groups..." />
      </div>

      {/* Group list */}
      {filtered.length === 0 && !creating && (
        <div style={{ textAlign: 'center', padding: 48,
          color: 'var(--color-text-secondary)', fontSize: 13,
          border: '0.5px dashed var(--color-border-secondary)',
          borderRadius: 10 }}>
          No groups yet. Create your first group to assign KPI rules.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
        {filtered.map((g: any) => (
          <div key={g.id} style={{ ...S.card, marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: 14,
                  color: 'var(--color-text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' }}>
                  {g.name}
                </div>
                {g.description && (
                  <div style={{ fontSize: 12,
                    color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {g.description}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  if (confirm(`Delete group "${g.name}"?`))
                    deleteMutation.mutate(g.id);
                }}
                style={{ border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: 12, flexShrink: 0,
                  color: 'var(--color-text-tertiary)', padding: '2px 4px',
                  marginLeft: 8 }}>
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginTop: 12 }}>
              <span style={{ fontSize: 12,
                color: 'var(--color-text-secondary)' }}>
                {g.member_count} member{g.member_count !== 1 ? 's' : ''}
              </span>
              <button onClick={() => setSelected(g)}
                style={S.btnSm}>
                Manage Members →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Members panel */}
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
  card:        { background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 10, padding: 16, marginBottom: 12 },
  sectionLabel:{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 },
  label:       { fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 },
  input:       { width: '100%', padding: '7px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 8, fontSize: 13, background: 'var(--color-background-primary)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', outline: 'none' },
  btnPrimary:  { padding: '7px 16px', border: 'none', borderRadius: 8, background: 'var(--color-text-primary)', color: 'var(--color-background-primary)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' },
  btnSm:       { padding: '5px 10px', border: '0.5px solid var(--color-border-secondary)', borderRadius: 8, background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' },
};
