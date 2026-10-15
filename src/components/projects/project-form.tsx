'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ProjectStatus, Role } from '@prisma/client';
import {
  Building2,
  Droplet,
  Users,
  Layers,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  ArrowLeft,
  Search,
} from 'lucide-react';
import { RoleBadge } from '@/components/role-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  createProjectAction,
  updateProjectAction,
  ProjectInput,
  ActivityTypeInput,
} from '@/app/actions/project-actions';
import Link from 'next/link';

export interface AvailableUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface ProjectFormProps {
  initialData?: {
    id?: string;
    name: string;
    location: string;
    clientName?: string | null;
    startDate: string;
    endDate?: string | null;
    status: ProjectStatus;
    unaccountedThresholdPercent: number;
    assumedVelocityInPerSec: number;
    memberUserIds: string[];
    activityTypes: ActivityTypeInput[];
  };
  availableUsers: AvailableUser[];
  isEdit?: boolean;
}

const PRESET_COLORS = [
  '#0284c7', // Sky
  '#059669', // Emerald
  '#d97706', // Amber
  '#7c3aed', // Violet
  '#db2777', // Pink
  '#2563eb', // Blue
  '#ea580c', // Orange
  '#0d9488', // Teal
  '#4f46e5', // Indigo
  '#64748b', // Slate
];

export function ProjectForm({
  initialData,
  availableUsers,
  isEdit = false,
}: ProjectFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Section 1: Details
  const [name, setName] = React.useState(initialData?.name || '');
  const [location, setLocation] = React.useState(initialData?.location || '');
  const [clientName, setClientName] = React.useState(initialData?.clientName || '');
  const [startDate, setStartDate] = React.useState(
    initialData?.startDate
      ? initialData.startDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = React.useState(
    initialData?.endDate ? initialData.endDate.slice(0, 10) : ''
  );
  const [status, setStatus] = React.useState<ProjectStatus>(
    initialData?.status || ProjectStatus.ACTIVE
  );

  // Section 2: Water settings
  const [unaccountedThresholdPercent, setUnaccountedThresholdPercent] = React.useState<number>(
    initialData?.unaccountedThresholdPercent ?? 15.0
  );
  const [assumedVelocityInPerSec, setAssumedVelocityInPerSec] = React.useState<number>(
    initialData?.assumedVelocityInPerSec ?? 47.24
  );

  // Section 3: Team
  const [selectedUserIds, setSelectedUserIds] = React.useState<string[]>(
    initialData?.memberUserIds || []
  );
  const [userSearch, setUserSearch] = React.useState('');

  // Section 4: Activity Types
  const defaultActivities: ActivityTypeInput[] = [
    { name: 'Curing', color: '#0284c7', active: true },
    { name: 'Dust Suppression', color: '#059669', active: true },
    { name: 'Concrete Mixing', color: '#d97706', active: true },
    { name: 'Site Cleaning', color: '#7c3aed', active: true },
    { name: 'Soil Compaction', color: '#db2777', active: true },
  ];

  const [activities, setActivities] = React.useState<ActivityTypeInput[]>(
    initialData?.activityTypes && initialData.activityTypes.length > 0
      ? initialData.activityTypes
      : defaultActivities
  );

  function toggleUser(userId: string) {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function handleAddActivity() {
    const nextColor = PRESET_COLORS[activities.length % PRESET_COLORS.length];
    setActivities((prev) => [
      ...prev,
      { name: 'New Activity', color: nextColor, active: true },
    ]);
  }

  function handleUpdateActivity(index: number, updates: Partial<ActivityTypeInput>) {
    setActivities((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  }

  function handleRemoveActivity(index: number) {
    setActivities((prev) => prev.filter((_, i) => i !== index));
  }

  const filteredUsers = availableUsers.filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('Please enter a project name.');
      return;
    }
    if (!location.trim()) {
      setErrorMsg('Please enter a project location.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: ProjectInput = {
        name: name.trim(),
        location: location.trim(),
        clientName: clientName.trim() || null,
        startDate: new Date(startDate).toISOString(),
        endDate: endDate ? new Date(endDate).toISOString() : null,
        status,
        unaccountedThresholdPercent: Number(unaccountedThresholdPercent),
        assumedVelocityInPerSec: Number(assumedVelocityInPerSec),
        memberUserIds: selectedUserIds,
        activityTypes: activities,
      };

      if (isEdit && initialData?.id) {
        await updateProjectAction(initialData.id, payload);
        router.push(`/projects/${initialData.id}`);
      } else {
        const res = await createProjectAction(payload);
        router.push(`/projects/${res.projectId}`);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save project. Please verify inputs.');
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto pb-16">
      {/* Top Bar with back link and title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href={isEdit && initialData?.id ? `/projects/${initialData.id}` : '/projects'}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{isEdit ? 'Back to Project' : 'Back to Projects'}</span>
          </Link>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            {isEdit ? `Edit Project: ${name || 'Project'}` : 'Register New Construction Project'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure site identity, hydraulic water threshold parameters, team assignments, and activity tracking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
            className="rounded-xl text-xs"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs px-5"
          >
            {isSubmitting ? 'Saving Project...' : isEdit ? 'Save Changes' : 'Create Project'}
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start gap-3 text-xs text-rose-800 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Section 1: Details */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/70 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">1. Project Details</h2>
            <p className="text-xs text-slate-500">Core identification, client, and operational schedule.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Project Name <span className="text-rose-500">*</span>
            </label>
            <Input
              required
              placeholder="e.g. Skyline Commercial Tower - Phase 2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Site Location <span className="text-rose-500">*</span>
            </label>
            <Input
              required
              placeholder="e.g. Sector 44, Gurgaon, Haryana"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="rounded-xl text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Client / Developer Name
            </label>
            <Input
              placeholder="e.g. DLF Cybercity Developers Ltd."
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="rounded-xl text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Start Date <span className="text-rose-500">*</span>
            </label>
            <Input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Estimated Completion Date
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-xl text-sm"
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Operational Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-sky-500"
            >
              <option value="PLANNING">PLANNING - Site Preparation & Preliminaries</option>
              <option value="ACTIVE">ACTIVE - Ongoing Civil Construction & Logging</option>
              <option value="ON_HOLD">ON_HOLD - Temporarily Suspended</option>
              <option value="COMPLETED">COMPLETED - Finished Site Works</option>
            </select>
          </div>
        </div>
      </div>

      {/* Section 2: Water Settings */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-cyan-50 dark:bg-cyan-950/70 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
            <Droplet className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">2. Water Settings</h2>
            <p className="text-xs text-slate-500">
              Engineering thresholds and hydraulic assumption defaults.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Unaccounted-Water Attention Threshold (%) <span className="text-rose-500">*</span>
            </label>
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              required
              value={unaccountedThresholdPercent}
              onChange={(e) => setUnaccountedThresholdPercent(parseFloat(e.target.value) || 0)}
              className="rounded-xl text-sm"
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Tolerance threshold for unaccounted water balance before triggering an attention alert. Default is 15.0%.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Assumed Pipe Velocity Default (in/s) <span className="text-rose-500">*</span>
            </label>
            <Input
              type="number"
              step="0.01"
              min="0.1"
              required
              value={assumedVelocityInPerSec}
              onChange={(e) => setAssumedVelocityInPerSec(parseFloat(e.target.value) || 0)}
              className="rounded-xl text-sm"
            />
            <p className="text-[11px] text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50 p-2.5 rounded-xl border border-purple-100 dark:border-purple-900/60 font-medium">
              Used only when a pipe record has no measured velocity. This is an assumption, not a measurement.
            </p>
          </div>
        </div>
      </div>

      {/* Section 3: Team (Member Picker) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">3. Team Members</h2>
              <p className="text-xs text-slate-500">
                Select site engineers and team members authorized to access this project.
              </p>
            </div>
          </div>

          <div className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {selectedUserIds.length} {selectedUserIds.length === 1 ? 'member' : 'members'} selected
          </div>
        </div>

        {/* User Search Bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Search by name, email, or role..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="pl-10 rounded-xl text-xs bg-slate-50 dark:bg-slate-950"
          />
        </div>

        {/* User Multi-select Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
          {filteredUsers.map((user) => {
            const isSelected = selectedUserIds.includes(user.id);
            return (
              <div
                key={user.id}
                onClick={() => toggleUser(user.id)}
                className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/40 shadow-2xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${
                      isSelected
                        ? 'bg-sky-600 border-sky-600 text-white'
                        : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {user.name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
                  </div>
                </div>

                <RoleBadge role={user.role} showIcon={false} className="shrink-0 scale-90" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 4: Activity Type Manager */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/70 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                4. Activity Type Manager
              </h2>
              <p className="text-xs text-slate-500">
                Customize water consumption activity categories (add, rename, recolor, disable).
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddActivity}
            className="rounded-xl text-xs flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Activity</span>
          </Button>
        </div>

        <div className="space-y-3">
          {activities.map((act, idx) => (
            <div
              key={act.id || idx}
              className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
            >
              {/* Color Swatch & Palette */}
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="color"
                  value={act.color}
                  onChange={(e) => handleUpdateActivity(idx, { color: e.target.value })}
                  title="Pick activity color"
                  className="w-8 h-8 rounded-xl border-0 cursor-pointer p-0 bg-transparent"
                />
                <div className="flex items-center gap-1">
                  {PRESET_COLORS.slice(0, 5).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleUpdateActivity(idx, { color: c })}
                      className="w-4 h-4 rounded-full border border-white dark:border-slate-900 transition-transform hover:scale-125"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Name Input */}
              <div className="flex-1">
                <Input
                  value={act.name}
                  onChange={(e) => handleUpdateActivity(idx, { name: e.target.value })}
                  placeholder="Activity Name (e.g. Curing, Dust Control)"
                  className="rounded-xl text-xs bg-white dark:bg-slate-900"
                />
              </div>

              {/* Status Toggle & Remove */}
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => handleUpdateActivity(idx, { active: !act.active })}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    act.active
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {act.active ? 'Active' : 'Disabled'}
                </button>

                <button
                  type="button"
                  onClick={() => handleRemoveActivity(idx)}
                  title="Remove activity"
                  className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Sticky Submit Bar */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
          className="rounded-xl text-xs"
        >
          Cancel
        </Button>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs px-6 py-2.5 shadow-xs"
        >
          {isSubmitting ? 'Saving Project...' : isEdit ? 'Save Project Changes' : 'Create Project'}
        </Button>
      </div>
    </form>
  );
}
