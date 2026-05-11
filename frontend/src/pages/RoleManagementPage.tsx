import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { rolesApi, usersApi } from '../api/client';
import { useAuthStore, ROLE_LABELS } from '../store/auth';

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

const PERMISSION_GROUPS: { label: string; perms: { key: string; label: string }[] }[] = [
  {
    label: 'Employees',
    perms: [
      { key: 'view_employees',          label: 'view_employees' },
      { key: 'edit_employee_profiles',  label: 'edit_employee_profiles' },
      { key: 'manage_reporting_lines',  label: 'manage_reporting_lines' },
      { key: 'deactivate_employees',    label: 'deactivate_employees' },
      { key: 'create_employees',        label: 'create_employees' },
    ],
  },
  {
    label: 'Scorecards',
    perms: [
      { key: 'view_own_scorecard',      label: 'view_own_scorecard' },
      { key: 'view_team_scorecards',    label: 'view_team_scorecards' },
      { key: 'view_all_scorecards',     label: 'view_all_scorecards' },
      { key: 'approve_scorecards',      label: 'approve_scorecards' },
      { key: 'reject_scorecards',       label: 'reject_scorecards' },
      { key: 'reset_scorecards',        label: 'reset_scorecards' },
    ],
  },
  {
    label: 'Cycles',
    perms: [
      { key: 'view_cycles',             label: 'view_cycles' },
      { key: 'manage_cycles',           label: 'manage_cycles' },
    ],
  },
  {
    label: 'KPI Setup',
    perms: [
      { key: 'manage_templates',        label: 'manage_templates' },
      { key: 'cascade_kpis',            label: 'cascade_kpis' },
      { key: 'manage_weight_rules',     label: 'manage_weight_rules' },
    ],
  },
  {
    label: 'Groups',
    perms: [
      { key: 'view_groups',             label: 'view_groups' },
      { key: 'manage_groups',           label: 'manage_groups' },
    ],
  },
  {
    label: 'Reports & Dashboard',
    perms: [
      { key: 'view_team_dashboard',     label: 'view_team_dashboard' },
      { key: 'view_org_dashboard',      label: 'view_org_dashboard' },
    ],
  },
  {
    label: 'System',
    perms: [
      { key: 'manage_roles',            label: 'manage_roles' },
    ],
  },
];

const SYSTEM_ROLE_ORDER = ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER', 'HOD', 'STAFF'];

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

function PermissionBadge({ perm }: { perm: string }) {
  return (
    <span style={{
      display: 'inline-block',
      fontSize: 11,
      padding: '2px 8px',
      borderRadius: 12,
      background: C.bgInfo,
      color: C.textInfo,
      margin: '2px 4px 2px 0',
      fontFamily: C.font,
    }}>
      {perm}
    </span>
  );
}

function PermissionEditor({
  selected, onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(key: string) {
    onChange(selected.includes(key)
      ? selected.filter(p => p !== key)
      : [...selected, key]);
  }
  function selectAll(group: string[]) {
    const next = Array.from(new Set([...selected, ...group]));
    onChange(next);
  }
  function clearAll(group: string[]) {
    const set = new Set(group);
    onChange(selected.filter(p => !set.has(p)));
  }

  return (
    <div>
      {PERMISSION_GROUPS.map(g => {
        const groupKeys = g.perms.map(p => p.key);
        const selectedInGroup = groupKeys.filter(k => selected.includes(k)).length;
        return (
          <div key={g.label} style={{
            border: `1px solid ${C.borderLight}`, borderRadius: 8,
            padding: 12, marginBottom: 10, background: C.bgSecondary,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>
                {g.label}
                <span style={{ marginLeft: 6, fontSize: 11,
                  color: C.textSecond, fontWeight: 400 }}>
                  ({selectedInGroup}/{groupKeys.length})
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" style={S.btnXs}
                  onClick={() => selectAll(groupKeys)}>
                  Select All
                </button>
                <button type="button" style={S.btnXs}
                  onClick={() => clearAll(groupKeys)}>
                  Clear All
                </button>
              </div>
            </div>
            <div style={{ display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 4 }}>
              {g.perms.map(p => (
                <label key={p.key} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: C.text, cursor: 'pointer',
                  padding: '4px 6px', borderRadius: 4,
                }}>
                  <input type="checkbox"
                    checked={selected.includes(p.key)}
                    onChange={() => toggle(p.key)} />
                  <span style={{ fontFamily: C.font }}>{p.label}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RoleForm({
  role, onSave, onCancel, saving,
}: {
  role?: any;
  onSave: (data: { name: string; description: string; permissions: string[] }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(role?.name || '');
  const [description, setDescription] = useState(role?.description || '');
  const [permissions, setPermissions] = useState<string[]>(role?.permissions || []);

  return (
    <div style={S.card}>
      <div style={{ fontWeight: 600, marginBottom: 12, color: C.text, fontSize: 14 }}>
        {role ? `Edit Role: ${role.name}` : 'New Custom Role'}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={S.label}>Role Name</label>
        <input style={S.input} value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Regional HR Lead, Audit Reviewer"
          autoFocus />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={S.label}>Description</label>
        <input style={S.input} value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What this role can do" />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={S.label}>Permissions ({permissions.length} selected)</label>
        <PermissionEditor selected={permissions} onChange={setPermissions} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onSave({ name, description, permissions })}
          disabled={!name || saving}
          style={{ ...S.btnPrimary, opacity: !name ? 0.5 : 1 }}>
          {saving ? 'Saving...' : (role ? 'Save Changes' : 'Create Role')}
        </button>
        <button onClick={onCancel} style={S.btnSm}>Cancel</button>
      </div>
    </div>
  );
}

function SystemRoleRow({ role, expanded, onToggle }: {
  role: any; expanded: boolean; onToggle: () => void;
}) {
  return (
    <>
      <tr style={{ borderBottom: `1px solid ${C.borderLight}` }}>
        <td style={S.td}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: C.textTertiary }}>🔒</span>
            <span style={{ fontWeight: 600, color: C.text }}>{role.name}</span>
          </div>
        </td>
        <td style={S.td}>
          <span style={{ fontSize: 12, color: C.textSecond }}>
            {role.description || '—'}
          </span>
        </td>
        <td style={{ ...S.td, textAlign: 'right' }}>
          <span style={{ fontSize: 12, color: C.textSecond }}>
            {role.permissions.length}
          </span>
        </td>
        <td style={{ ...S.td, textAlign: 'right' }}>
          <span style={{ fontSize: 12, color: C.textSecond }}>
            {role.user_count ?? 0}
          </span>
        </td>
        <td style={{ ...S.td, textAlign: 'right' }}>
          <button onClick={onToggle} style={S.btnSm}>
            {expanded ? 'Hide' : 'Show'} permissions
          </button>
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: C.bgSecondary }}>
          <td colSpan={5} style={{ padding: '10px 14px' }}>
            {role.permissions.length === 0 ? (
              <span style={{ fontSize: 12, color: C.textTertiary }}>
                No permissions
              </span>
            ) : (
              <div>
                {role.permissions.map((p: string) => (
                  <PermissionBadge key={p} perm={p} />
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function CustomRoleCard({
  role, onEdit, onDelete, deleting,
}: {
  role: any;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const qc = useQueryClient();
  const [showMembers, setShowMembers] = useState(false);
  const userCount = role.user_count ?? 0;
  const canDelete = userCount === 0;

  const membersQuery = useQuery({
    queryKey: ['role-users', role.id],
    queryFn: () => rolesApi.getUsers(role.id).then(r => r.data),
    enabled: showMembers,
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => rolesApi.removeUser(role.id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['role-users', role.id] });
      qc.invalidateQueries({ queryKey: ['all-role-users'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
  });

  const members = (membersQuery.data as any[]) || [];

  return (
    <div style={S.card}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>
          {role.name}
        </div>
        {role.description && (
          <div style={{ fontSize: 12, color: C.textSecond, marginTop: 2 }}>
            {role.description}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: C.textSecond }}>
          {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 12, color: C.textSecond }}>
          {userCount} member{userCount !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6,
        paddingTop: 10, borderTop: `1px solid ${C.borderLight}` }}>
        <button onClick={onEdit} style={S.btnSm}>
          Edit
        </button>
        <button
          onClick={() => setShowMembers(v => !v)}
          style={S.btnSm}>
          {showMembers ? 'Hide Members' : 'View Members'}
        </button>
        <span title={canDelete
          ? ''
          : 'Cannot delete: users are still assigned to this role'}>
          <button
            onClick={onDelete}
            disabled={!canDelete || deleting}
            style={{ ...S.btnSm,
              color: canDelete ? C.textDanger : C.textTertiary,
              cursor: canDelete ? 'pointer' : 'not-allowed',
              opacity: canDelete ? 1 : 0.6 }}>
            Delete
          </button>
        </span>
      </div>
      {showMembers && (
        <div style={{ marginTop: 12, paddingTop: 12,
          borderTop: `1px solid ${C.borderLight}` }}>
          {membersQuery.isLoading ? (
            <div style={{ fontSize: 12, color: C.textTertiary }}>Loading...</div>
          ) : members.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textTertiary }}>
              No members assigned
            </div>
          ) : (
            <div>
              {members.map((m: any) => (
                <div key={m.user_id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 0',
                  borderBottom: `1px solid ${C.borderLight}`,
                }}>
                  <Avatar name={m.full_name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>
                      {m.full_name}
                    </div>
                    <div style={{ fontSize: 11, color: C.textSecond }}>
                      {m.employee_id}
                    </div>
                  </div>
                  <button
                    onClick={() => removeMutation.mutate(m.user_id)}
                    disabled={removeMutation.isPending}
                    style={{ ...S.btnSm,
                      color: C.textDanger,
                      opacity: removeMutation.isPending ? 0.6 : 1 }}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UserRoleAssignmentSection({
  customRoles, allUsers,
}: {
  customRoles: any[];
  allUsers: any[];
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [roleToAssign, setRoleToAssign] = useState('');

  const selectedUser = useMemo(
    () => allUsers.find((u: any) => u.id === selectedUserId) || null,
    [allUsers, selectedUserId]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return [];
    return allUsers.filter((u: any) =>
      u.full_name?.toLowerCase().includes(q) ||
      u.employee_id?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [allUsers, search]);

  const roleUsersQueries = useQuery({
    queryKey: ['all-role-users', customRoles.map(r => r.id).join(',')],
    queryFn: async () => {
      const map: Record<string, any[]> = {};
      for (const r of customRoles) {
        try {
          const res = await rolesApi.getUsers(r.id);
          map[r.id] = res.data || [];
        } catch {
          map[r.id] = [];
        }
      }
      return map;
    },
    enabled: customRoles.length > 0,
  });

  const userAssignedRoles = useMemo(() => {
    if (!selectedUser || !roleUsersQueries.data) return [];
    const out: any[] = [];
    customRoles.forEach(r => {
      const users = roleUsersQueries.data[r.id] || [];
      if (users.find((u: any) => u.user_id === selectedUser.id)) {
        out.push(r);
      }
    });
    return out;
  }, [selectedUser, customRoles, roleUsersQueries.data]);

  const totalPermissions = useMemo(() => {
    if (!selectedUser) return [];
    const set = new Set<string>(selectedUser.permissions || []);
    userAssignedRoles.forEach((r: any) => {
      (r.permissions || []).forEach((p: string) => set.add(p));
    });
    return Array.from(set).sort();
  }, [selectedUser, userAssignedRoles]);

  const assignMutation = useMutation({
    mutationFn: (roleId: string) =>
      rolesApi.assignUsers(roleId, [selectedUser.id]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-role-users'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
      setRoleToAssign('');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (roleId: string) =>
      rolesApi.removeUser(roleId, selectedUser.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-role-users'] });
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
  });

  const assignableRoles = customRoles.filter(
    (r: any) => !userAssignedRoles.find((ar: any) => ar.id === r.id)
  );

  return (
    <div style={S.card}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: C.text }}>
        User Role Assignment
      </div>
      <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 12 }}>
        Search a user, then add or remove custom roles. System roles are managed in User Management.
      </div>

      <input
        style={{ ...S.input, marginBottom: 8 }}
        value={search}
        onChange={e => { setSearch(e.target.value); setSelectedUserId(null); }}
        placeholder="Search by name, employee code, or email..."
      />

      {!selectedUser && search && (
        <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8,
          maxHeight: 220, overflowY: 'auto', background: C.bg }}>
          {filtered.length === 0 && (
            <div style={{ padding: 14, textAlign: 'center',
              color: C.textTertiary, fontSize: 12 }}>No matches</div>
          )}
          {filtered.map((u: any, i: number) => (
            <div key={u.id}
              onClick={() => { setSelectedUserId(u.id); setSearch(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', cursor: 'pointer',
                borderBottom: i < filtered.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}
              onMouseEnter={e => e.currentTarget.style.background = C.bgSecondary}
              onMouseLeave={e => e.currentTarget.style.background = C.bg}>
              <Avatar name={u.full_name} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>
                  {u.full_name}
                </div>
                <div style={{ fontSize: 11, color: C.textSecond }}>
                  {u.employee_id} · {ROLE_LABELS[u.role] || u.role}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedUser && (
        <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 8,
          padding: 14, background: C.bg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 14, paddingBottom: 12,
            borderBottom: `1px solid ${C.borderLight}` }}>
            <Avatar name={selectedUser.full_name} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                {selectedUser.full_name}
              </div>
              <div style={{ fontSize: 12, color: C.textSecond }}>
                {selectedUser.employee_id} · {selectedUser.email}
              </div>
              <div style={{ fontSize: 11, color: C.textTertiary, marginTop: 2 }}>
                System role: <strong>{ROLE_LABELS[selectedUser.role] || selectedUser.role}</strong>
              </div>
            </div>
            <button onClick={() => setSelectedUserId(null)} style={S.btnSm}>
              Change user
            </button>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textSecond,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              marginBottom: 8 }}>
              Assigned Roles ({userAssignedRoles.length + 1})
            </div>
            {roleUsersQueries.isLoading ? (
              <div style={{ fontSize: 12, color: C.textTertiary }}>Loading...</div>
            ) : (
              <div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, padding: '4px 10px', borderRadius: 14,
                  background: '#f3f4f6', color: '#4b5563',
                  margin: '2px 6px 2px 0', fontFamily: C.font,
                }}>
                  {ROLE_LABELS[selectedUser.role] || selectedUser.role}
                </span>
                {userAssignedRoles.map((r: any) => (
                  <span key={r.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 12, padding: '4px 10px', borderRadius: 14,
                    background: '#ccfbf1', color: '#0d9488',
                    margin: '2px 6px 2px 0', fontFamily: C.font,
                  }}>
                    {r.name}
                    <button
                      onClick={() => removeMutation.mutate(r.id)}
                      disabled={removeMutation.isPending}
                      style={{ border: 'none', background: 'transparent',
                        cursor: 'pointer', fontSize: 12, color: '#0d9488',
                        padding: 0, lineHeight: 1 }}>
                      ✕
                    </button>
                  </span>
                ))}
                {userAssignedRoles.length === 0 && (
                  <span style={{ fontSize: 12, color: C.textTertiary,
                    marginLeft: 4 }}>
                    No custom roles assigned
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textSecond,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              marginBottom: 8 }}>
              Assign a Custom Role
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                value={roleToAssign}
                onChange={e => setRoleToAssign(e.target.value)}
                style={{ ...S.input, flex: 1 }}>
                <option value="">Select a role...</option>
                {assignableRoles.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <button
                onClick={() => roleToAssign && assignMutation.mutate(roleToAssign)}
                disabled={!roleToAssign || assignMutation.isPending}
                style={{ ...S.btnPrimary, opacity: !roleToAssign ? 0.5 : 1 }}>
                {assignMutation.isPending ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textSecond,
              textTransform: 'uppercase', letterSpacing: '0.05em',
              marginBottom: 8 }}>
              Effective Permissions ({totalPermissions.length})
            </div>
            {totalPermissions.length === 0 ? (
              <div style={{ fontSize: 12, color: C.textTertiary }}>
                No permissions
              </div>
            ) : (
              <div>
                {totalPermissions.map(p => <PermissionBadge key={p} perm={p} />)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function RoleManagementPage() {
  const qc = useQueryClient();
  const isSuperAdmin = useAuthStore(s => s.isSuperAdmin());
  const [systemExpanded, setSystemExpanded] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn:  () => rolesApi.list().then(r => r.data),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn:  () => usersApi.list().then(r => r.data),
  });

  const systemRoles = useMemo(() => {
    const list = (roles as any[]).filter(r => r.is_system);
    return list.sort((a, b) => {
      const ai = SYSTEM_ROLE_ORDER.indexOf(a.name);
      const bi = SYSTEM_ROLE_ORDER.indexOf(b.name);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [roles]);

  const customRoles = useMemo(
    () => (roles as any[]).filter(r => !r.is_system),
    [roles]
  );

  const createMutation = useMutation({
    mutationFn: (data: any) => rolesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      setCreating(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      rolesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => rolesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
    onError: (err: any) => {
      alert(err.response?.data?.detail || 'Delete failed');
    },
  });

  function toggleSystem(id: string) {
    setSystemExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!isSuperAdmin) {
    return (
      <div style={{ padding: 24, fontSize: 13, color: C.textSecond, fontFamily: C.font }}>
        Role management is restricted to Super Admins.
      </div>
    );
  }

  return (
    <div style={{ fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4, color: C.text }}>
          Role Management
        </h1>
        <p style={{ fontSize: 13, color: C.textSecond }}>
          Manage system roles, custom roles, and user role assignments
        </p>
      </div>

      {isLoading && (
        <div style={{ fontSize: 13, color: C.textTertiary }}>Loading roles...</div>
      )}

      {/* SECTION A — System Roles */}
      <div style={{ marginBottom: 24 }}>
        <div style={S.sectionHeader}>System Roles</div>
        <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 10 }}>
          Built-in roles. Cannot be modified or deleted.
        </div>
        <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 10,
          overflow: 'hidden', background: C.bg }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.bgSecondary }}>
                <th style={S.th}>Name</th>
                <th style={S.th}>Description</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Permissions</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Users</th>
                <th style={{ ...S.th, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {systemRoles.length === 0 && !isLoading && (
                <tr><td colSpan={5} style={{ ...S.td, color: C.textTertiary,
                  textAlign: 'center' }}>No system roles found</td></tr>
              )}
              {systemRoles.map((r: any) => (
                <SystemRoleRow key={r.id} role={r}
                  expanded={systemExpanded.has(r.id)}
                  onToggle={() => toggleSystem(r.id)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION B — Custom Roles */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 4 }}>
          <div style={S.sectionHeader}>Custom Roles</div>
          {!creating && !editing && (
            <button onClick={() => setCreating(true)} style={S.btnPrimary}>
              + New Custom Role
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 10 }}>
          Custom roles with selected permissions. Cannot be deleted while users are assigned.
        </div>

        {creating && (
          <RoleForm
            onSave={(data) => createMutation.mutate(data)}
            onCancel={() => setCreating(false)}
            saving={createMutation.isPending} />
        )}

        {editing && (
          <RoleForm
            role={editing}
            onSave={(data) => updateMutation.mutate({ id: editing.id, data })}
            onCancel={() => setEditing(null)}
            saving={updateMutation.isPending} />
        )}

        {!creating && !editing && (
          <>
            {customRoles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32,
                color: C.textSecond, fontSize: 13,
                border: `1px dashed ${C.border}`, borderRadius: 10 }}>
                No custom roles yet. Create your first custom role above.
              </div>
            ) : (
              <div style={{ display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 10 }}>
                {customRoles.map((r: any) => (
                  <CustomRoleCard
                    key={r.id}
                    role={r}
                    onEdit={() => setEditing(r)}
                    onDelete={() => {
                      if (window.confirm(`Delete role "${r.name}"?`))
                        deleteMutation.mutate(r.id);
                    }}
                    deleting={deleteMutation.isPending}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* SECTION D — User Role Assignment */}
      <div>
        <div style={S.sectionHeader}>User Role Assignment</div>
        <UserRoleAssignmentSection
          customRoles={customRoles}
          allUsers={users as any[]} />
      </div>
    </div>
  );
}

const S: Record<string, any> = {
  card: {
    background: C.bg, border: `1px solid ${C.borderLight}`,
    borderRadius: 10, padding: 16, marginBottom: 12,
  },
  label: {
    fontSize: 12, fontWeight: 500, color: C.textSecond,
    display: 'block', marginBottom: 4,
  },
  input: {
    width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`,
    borderRadius: 8, fontSize: 13, background: C.bg, color: C.text,
    fontFamily: C.font, outline: 'none',
  },
  btnPrimary: {
    padding: '8px 16px', border: 'none', borderRadius: 8,
    background: C.text, color: '#ffffff', fontSize: 12,
    fontWeight: 500, cursor: 'pointer', fontFamily: C.font,
  },
  btnSm: {
    padding: '6px 10px', border: `1px solid ${C.border}`,
    borderRadius: 8, background: C.bg, color: C.textSecond,
    fontSize: 12, cursor: 'pointer', fontFamily: C.font,
  },
  btnXs: {
    padding: '3px 8px', border: `1px solid ${C.border}`,
    borderRadius: 6, background: C.bg, color: C.textSecond,
    fontSize: 11, cursor: 'pointer', fontFamily: C.font,
  },
  sectionHeader: {
    fontSize: 11, fontWeight: 600, color: C.textSecond,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 8,
  },
  th: {
    textAlign: 'left', fontSize: 11, fontWeight: 600,
    color: C.textSecond, textTransform: 'uppercase',
    letterSpacing: '0.05em', padding: '10px 14px',
    borderBottom: `1px solid ${C.borderLight}`,
  },
  td: {
    padding: '10px 14px', fontSize: 13, color: C.text,
    verticalAlign: 'top',
  },
};
