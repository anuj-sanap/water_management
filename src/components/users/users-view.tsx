'use client';

import * as React from 'react';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Role } from '@prisma/client';
import { RoleBadge } from '@/components/role-badge';
import {
  Users,
  UserPlus,
  CheckCircle2,
  XCircle,
  Search,
  Edit,
  Power,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  createUserAction,
  updateUserAction,
  toggleUserActiveAction,
} from '@/app/actions/user-actions';

export interface UserItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: Date | string;
  assignedProjects: Array<{ id: string; name: string; location: string }>;
}

interface UsersViewProps {
  initialUsers: UserItem[];
  allProjects: Array<{ id: string; name: string; location: string }>;
  currentUserId: string;
}

export function UsersView({ initialUsers, allProjects, currentUserId }: UsersViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Create User Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<{
    name: string;
    email: string;
    role: Role;
    password: string;
    projectIds: string[];
  }>({
    name: '',
    email: '',
    role: Role.SITE_ENGINEER,
    password: '',
    projectIds: [],
  });

  // Edit User Modal
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    role: Role;
    projectIds: string[];
  }>({
    name: '',
    role: Role.SITE_ENGINEER,
    projectIds: [],
  });

  const filteredUsers = initialUsers.filter((u) => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (statusFilter === 'ACTIVE' && !u.active) return false;
    if (statusFilter === 'DEACTIVATED' && u.active) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = u.name.toLowerCase().includes(q);
      const matchEmail = u.email.toLowerCase().includes(q);
      const matchProj = u.assignedProjects.some((p) => p.name.toLowerCase().includes(q));
      if (!matchName && !matchEmail && !matchProj) return false;
    }
    return true;
  });

  // Handlers
  const handleOpenCreate = () => {
    setCreateForm({
      name: '',
      email: '',
      role: Role.SITE_ENGINEER,
      password: '',
      projectIds: [],
    });
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createUserAction(createForm);
      if (res.success) {
        toast.success(`User ${createForm.name} created successfully`);
        setIsCreateOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to create user');
      }
    });
  };

  const handleOpenEdit = (user: UserItem) => {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      role: user.role,
      projectIds: user.assignedProjects.map((p) => p.id),
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    startTransition(async () => {
      const res = await updateUserAction({
        userId: editingUser.id,
        name: editForm.name,
        role: editForm.role,
        projectIds: editForm.projectIds,
      });
      if (res.success) {
        toast.success(`User ${editForm.name} updated successfully`);
        setEditingUser(null);
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to update user');
      }
    });
  };

  const handleToggleActive = (user: UserItem) => {
    startTransition(async () => {
      const res = await toggleUserActiveAction(user.id);
      if (res.success) {
        toast.success(
          res.active
            ? `User ${user.name} has been reactivated`
            : `User ${user.name} has been deactivated`
        );
        router.refresh();
      } else {
        toast.error(res.error || 'Failed to toggle status');
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-sky-600 dark:text-sky-400" />
            Team & User Administration
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage user roles, project memberships, and access lifecycle. Restrictive governance prevents removing the last Project Manager.
          </p>
        </div>

        <Button
          onClick={handleOpenCreate}
          className="bg-sky-600 hover:bg-sky-700 text-white gap-2 h-10 px-4 rounded-xl shadow-xs self-start sm:self-auto cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Invite New User</span>
        </Button>
      </div>

      {/* Filter toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder="Search users by name, email, or assigned project..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300"
          >
            <option value="ALL">All Roles</option>
            <option value={Role.PROJECT_MANAGER}>Project Manager</option>
            <option value={Role.SITE_ENGINEER}>Site Engineer</option>
            <option value={Role.AUDITOR}>Auditor</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="DEACTIVATED">Deactivated Only</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4">User</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Assigned Projects</th>
                <th className="py-3.5 px-4">Created Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No users match your criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${
                      !user.active ? 'opacity-60 bg-slate-50/30 dark:bg-slate-900/30' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {user.name}
                        {user.id === currentUserId && (
                          <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.2 rounded bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">{user.email}</div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <RoleBadge role={user.role} />
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {user.active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          <XCircle className="w-3 h-3 text-slate-400" />
                          Deactivated
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      {user.assignedProjects.length === 0 ? (
                        <span className="text-slate-400 text-xs italic">No projects assigned</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {user.assignedProjects.map((p) => (
                            <span
                              key={p.id}
                              className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-700 dark:text-slate-300"
                            >
                              {p.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap font-mono text-[11px] text-slate-500">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleOpenEdit(user)}
                        className="text-xs h-8"
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Edit
                      </Button>

                      <Button
                        variant={user.active ? 'ghost' : 'outline'}
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleToggleActive(user)}
                        className={`text-xs h-8 ${
                          user.active
                            ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                            : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                        }`}
                      >
                        <Power className="w-3 h-3 mr-1" />
                        {user.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite / Create User Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-sky-600" />
              Invite & Create User
            </DialogTitle>
            <DialogDescription>
              Assign role and initial project permissions. A temporary password allows first-time sign in.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Full Name
              </label>
              <Input
                required
                placeholder="e.g., Sarah Jenkins"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Email Address
              </label>
              <Input
                required
                type="email"
                placeholder="sarah.jenkins@watermgmt.io"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                System Role
              </label>
              <select
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as Role })}
                className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200"
              >
                <option value={Role.SITE_ENGINEER}>Site Engineer (Log records, 48hr edit)</option>
                <option value={Role.PROJECT_MANAGER}>Project Manager (Full project control)</option>
                <option value={Role.AUDITOR}>Auditor (Strict read-only oversight)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Temporary Password
              </label>
              <Input
                required
                type="password"
                placeholder="Minimum 8 characters"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Assign Projects
              </label>
              <div className="max-h-36 overflow-y-auto p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 space-y-1.5 text-xs">
                {allProjects.map((p) => {
                  const isChecked = createForm.projectIds.includes(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCreateForm({
                              ...createForm,
                              projectIds: [...createForm.projectIds, p.id],
                            });
                          } else {
                            setCreateForm({
                              ...createForm,
                              projectIds: createForm.projectIds.filter((id) => id !== p.id),
                            });
                          }
                        }}
                        className="rounded text-sky-600"
                      />
                      <span className="font-medium text-slate-800 dark:text-slate-200">{p.name}</span>
                      <span className="text-[10px] text-slate-400">({p.location})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isPending}
                className="bg-sky-600 hover:bg-sky-700 text-white"
              >
                {isPending ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User & Assignments Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-sky-600" />
              Edit User & Permissions
            </DialogTitle>
            <DialogDescription>
              Update name, system role, and assigned projects for {editingUser?.email}.
            </DialogDescription>
          </DialogHeader>

          {editingUser && (
            <form onSubmit={handleEditSubmit} className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Full Name
                </label>
                <Input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  System Role
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200"
                >
                  <option value={Role.SITE_ENGINEER}>Site Engineer (Log records, 48hr edit)</option>
                  <option value={Role.PROJECT_MANAGER}>Project Manager (Full project control)</option>
                  <option value={Role.AUDITOR}>Auditor (Strict read-only oversight)</option>
                </select>
                {editingUser.role === Role.PROJECT_MANAGER && editForm.role !== Role.PROJECT_MANAGER && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Demoting this Project Manager will be rejected if no other active Project Manager exists.
                  </p>
                )}
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  Assigned Projects
                </label>
                <div className="max-h-36 overflow-y-auto p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 space-y-1.5 text-xs">
                  {allProjects.map((p) => {
                    const isChecked = editForm.projectIds.includes(p.id);
                    return (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditForm({
                                ...editForm,
                                projectIds: [...editForm.projectIds, p.id],
                              });
                            } else {
                              setEditForm({
                                ...editForm,
                                projectIds: editForm.projectIds.filter((id) => id !== p.id),
                              });
                            }
                          }}
                          className="rounded text-sky-600"
                        />
                        <span className="font-medium text-slate-800 dark:text-slate-200">{p.name}</span>
                        <span className="text-[10px] text-slate-400">({p.location})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingUser(null)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending}
                  className="bg-sky-600 hover:bg-sky-700 text-white"
                >
                  {isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
