'use client';

import * as React from 'react';
import Link from 'next/link';
import { Role, ProjectStatus } from '@prisma/client';
import {
  LayoutDashboard,
  Users,
  Layers,
  Settings as SettingsIcon,
  Truck,
  Droplet,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clock,
  Edit,
  Archive,
  CheckCircle,
} from 'lucide-react';
import { RoleBadge } from '@/components/role-badge';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { updateProjectStatusAction, toggleActivityTypeAction } from '@/app/actions/project-actions';

export interface ProjectDashboardData {
  project: {
    id: string;
    name: string;
    location: string;
    clientName: string | null;
    startDate: string;
    endDate: string | null;
    status: ProjectStatus;
    unaccountedThresholdPercent: number;
    assumedVelocityInPerSec: number;
  };
  members: Array<{
    userId: string;
    createdAt: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
    };
  }>;
  activityTypes: Array<{
    id: string;
    name: string;
    color: string;
    active: boolean;
    recordsCount: number;
  }>;
  metrics: {
    totalSuppliedM3: number;
    totalConsumedM3: number;
    unaccountedM3: number;
    unaccountedPercent: number;
    thresholdExceeded: boolean;
    assumedVelocityCount: number;
  };
  recentSupplies: Array<{
    id: string;
    date: string;
    volumeM3: number;
    source: string;
    supplier: string | null;
    referenceNo: string | null;
  }>;
  recentConsumption: Array<{
    id: string;
    date: string;
    volumeM3: number;
    method: string;
    usedAssumedVelocity: boolean;
    locationOrZone: string | null;
    activityType: {
      name: string;
      color: string;
    };
  }>;
  counts: {
    suppliesCount: number;
    consumptionCount: number;
  };
}

interface ProjectDashboardTabsProps {
  data: ProjectDashboardData;
  currentUserRole: Role;
}

export function ProjectDashboardTabs({ data, currentUserRole }: ProjectDashboardTabsProps) {
  const [activeTab, setActiveTab] = React.useState<'overview' | 'team' | 'activities' | 'settings'>('overview');
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<'complete' | 'archive'>('complete');
  const [isLoading, setIsLoading] = React.useState(false);
  const [activityList, setActivityList] = React.useState(data.activityTypes);

  const { project, members, metrics, recentSupplies, recentConsumption, counts } = data;
  const isProjectManager = currentUserRole === 'PROJECT_MANAGER';
  const isAuditor = currentUserRole === 'AUDITOR';
  const isSiteEngineer = currentUserRole === 'SITE_ENGINEER';

  async function handleStatusChange() {
    try {
      setIsLoading(true);
      const targetStatus = confirmAction === 'complete' ? ProjectStatus.COMPLETED : ProjectStatus.ON_HOLD;
      await updateProjectStatusAction(project.id, targetStatus);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleToggleActivity(activityId: string) {
    if (!isProjectManager) return;
    try {
      const res = await toggleActivityTypeAction(activityId);
      setActivityList((prev) =>
        prev.map((a) => (a.id === activityId ? { ...a, active: res.active } : a))
      );
    } catch (err) {
      console.error(err);
    }
  }

  function getInitials(name: string) {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <div className="space-y-6">
      {/* Tabs Header */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-fit text-xs font-semibold">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            activeTab === 'overview'
              ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('team')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            activeTab === 'team'
              ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Team ({members.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('activities')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            activeTab === 'activities'
              ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Activity Types ({activityList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
            activeTab === 'settings'
              ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs font-bold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </div>

      {/* Tab 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Supplied */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Total Water Supplied</span>
                <Truck className="w-4 h-4 text-sky-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {metrics.totalSuppliedM3.toFixed(1)}{' '}
                <span className="text-xs font-normal text-slate-500">m³</span>
              </div>
              <div className="text-xs text-slate-500">
                {(metrics.totalSuppliedM3 * 1000).toLocaleString()} Litres ({counts.suppliesCount} deliveries)
              </div>
            </div>

            {/* Card 2: Total Consumed */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Recorded Consumption</span>
                <Droplet className="w-4 h-4 text-cyan-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {metrics.totalConsumedM3.toFixed(1)}{' '}
                <span className="text-xs font-normal text-slate-500">m³</span>
              </div>
              <div className="text-xs text-slate-500">
                Engine calculated ({counts.consumptionCount} records)
              </div>
            </div>

            {/* Card 3: Unaccounted Balance */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Unaccounted Water</span>
                {metrics.thresholdExceeded ? (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                )}
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white flex items-baseline gap-2">
                <span>{metrics.unaccountedM3.toFixed(1)} m³</span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    metrics.thresholdExceeded
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  }`}
                >
                  {metrics.unaccountedPercent.toFixed(1)}%
                </span>
              </div>
              <div className="text-xs text-slate-500">
                Configured threshold: {project.unaccountedThresholdPercent}%
              </div>
            </div>

            {/* Card 4: Assumed Velocity Telemetry */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>Assumed Velocity Records</span>
                <Info className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white">
                {metrics.assumedVelocityCount}{' '}
                <span className="text-xs font-normal text-slate-500">records</span>
              </div>
              <div className="text-xs text-slate-500">
                Used default {project.assumedVelocityInPerSec} in/s
              </div>
            </div>
          </div>

          {/* Role Notices */}
          {isSiteEngineer && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/60 text-xs text-sky-800 dark:text-sky-300">
              <Clock className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <div>
                <strong>48-Hour Edit Window Active:</strong> Site engineers can log new records and modify or delete their own records within 48 hours of creation. Records older than 48 hours are permanently locked.
              </div>
            </div>
          )}

          {isAuditor && (
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/60 text-xs text-purple-800 dark:text-purple-300">
              <Info className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
              <div>
                <strong>Auditor Read-Only Mode:</strong> All create, edit, and delete controls are disabled with full tamper-protection. You can inspect all telemetry, audit trails, and export reports.
              </div>
            </div>
          )}

          {/* Two-Column Recent Telemetry Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Supplies */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-sky-600" />
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Recent Water Supplies
                  </h3>
                </div>
                <Link
                  href={`/projects/${project.id}/supplies`}
                  className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                >
                  View all ({counts.suppliesCount})
                </Link>
              </div>

              {recentSupplies.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No water supply deliveries logged yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {recentSupplies.map((s) => (
                    <div key={s.id} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {s.volumeM3.toFixed(2)} m³ ({s.source})
                        </div>
                        <div className="text-slate-500 text-[11px]">
                          {new Date(s.date).toLocaleDateString()} • {s.supplier || 'Direct'}
                        </div>
                      </div>
                      <span className="font-mono text-slate-500 text-[11px]">{s.referenceNo || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Consumption */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Droplet className="w-4 h-4 text-cyan-600" />
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Recent Consumption Records
                  </h3>
                </div>
                <Link
                  href={`/projects/${project.id}/consumption`}
                  className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                >
                  View all ({counts.consumptionCount})
                </Link>
              </div>

              {recentConsumption.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No consumption activities recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {recentConsumption.map((c) => (
                    <div key={c.id} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{c.volumeM3.toFixed(2)} m³</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                            {c.method}
                          </span>
                          {c.usedAssumedVelocity && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-medium">
                              Assumed v
                            </span>
                          )}
                        </div>
                        <div className="text-slate-500 text-[11px]">
                          {c.activityType.name} • {c.locationOrZone || 'General Site'}
                        </div>
                      </div>
                      <span className="text-slate-400 text-[11px]">
                        {new Date(c.date).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: TEAM */}
      {activeTab === 'team' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Assigned Project Personnel ({members.length})
              </h2>
              <p className="text-xs text-slate-500">
                Engineers, managers, and compliance auditors with access to this site.
              </p>
            </div>

            {isProjectManager && (
              <Link
                href={`/projects/${project.id}/edit`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition-all"
              >
                <Users className="w-3.5 h-3.5" />
                <span>Manage Team Members</span>
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 font-bold flex items-center justify-center text-xs shrink-0">
                    {getInitials(m.user.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {m.user.name}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{m.user.email}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Assigned: {new Date(m.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <RoleBadge role={m.user.role} showIcon={false} className="shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: ACTIVITY TYPES */}
      {activeTab === 'activities' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Site Activity Types ({activityList.length})
              </h2>
              <p className="text-xs text-slate-500">
                Categories utilized by site engineers when recording water consumption.
              </p>
            </div>

            {isProjectManager && (
              <Link
                href={`/projects/${project.id}/edit`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition-all"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>Configure Activity Types</span>
              </Link>
            )}
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {activityList.map((act) => (
              <div key={act.id} className="py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full shrink-0 border border-white dark:border-slate-900 shadow-2xs"
                    style={{ backgroundColor: act.color }}
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>{act.name}</span>
                      <span
                        className={`text-[10px] px-2 py-0.2 rounded-full font-semibold ${
                          act.active
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {act.active ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {act.recordsCount} consumption records logged
                    </div>
                  </div>
                </div>

                {isProjectManager && (
                  <button
                    type="button"
                    onClick={() => handleToggleActivity(act.id)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {act.active ? 'Disable' : 'Enable'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: SETTINGS */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Hydraulic Parameters & Project Settings
                </h2>
                <p className="text-xs text-slate-500">
                  Global parameters applied by the calculation engine for water balance computation.
                </p>
              </div>

              {isProjectManager && (
                <Link
                  href={`/projects/${project.id}/edit`}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition-all"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit Project Parameters</span>
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="text-[11px] font-semibold uppercase text-slate-400">
                  Unaccounted Water Attention Threshold
                </div>
                <div className="text-xl font-black text-slate-900 dark:text-white">
                  {project.unaccountedThresholdPercent}%
                </div>
                <p className="text-[11px] text-slate-500">
                  Exceeding this tolerance triggers an ATTENTION status on the daily water balance.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="text-[11px] font-semibold uppercase text-slate-400">
                  Assumed Pipe Velocity Default
                </div>
                <div className="text-xl font-black text-slate-900 dark:text-white">
                  {project.assumedVelocityInPerSec} in/s
                </div>
                <p className="text-[11px] text-purple-700 dark:text-purple-300 font-medium">
                  Used only when a pipe record has no measured velocity. This is an assumption, not a measurement.
                </p>
              </div>
            </div>

            {/* Project Details Readout */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <span className="text-slate-400">Project Status:</span>{' '}
                <span className="font-semibold text-slate-900 dark:text-white">{project.status}</span>
              </div>
              <div>
                <span className="text-slate-400">Site Location:</span>{' '}
                <span className="font-semibold text-slate-900 dark:text-white">{project.location}</span>
              </div>
              <div>
                <span className="text-slate-400">Client / Developer:</span>{' '}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {project.clientName || 'Not specified'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Schedule:</span>{' '}
                <span className="font-semibold text-slate-900 dark:text-white">
                  {new Date(project.startDate).toLocaleDateString()}
                  {project.endDate ? ` – ${new Date(project.endDate).toLocaleDateString()}` : ' (Ongoing)'}
                </span>
              </div>
            </div>
          </div>

          {/* Project Lifecycle / Archival Card (Project Managers only) */}
          {isProjectManager && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/70 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Archive className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Project Lifecycle Operations
                  </h3>
                  <p className="text-xs text-slate-500">
                    Change operational status or complete civil works. All status adjustments are written to the tamper-evident audit log.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                {project.status !== 'COMPLETED' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setConfirmAction('complete');
                      setIsConfirmOpen(true);
                    }}
                    className="rounded-xl text-xs flex items-center gap-2 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Mark as Completed</span>
                  </Button>
                )}

                {project.status !== 'ON_HOLD' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setConfirmAction('archive');
                      setIsConfirmOpen(true);
                    }}
                    className="rounded-xl text-xs flex items-center gap-2 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/50"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Archive / Set On Hold</span>
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ConfirmDialog for Archive / Complete */}
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={confirmAction === 'complete' ? 'Mark Project as Completed' : 'Archive Project'}
        description={
          confirmAction === 'complete'
            ? 'Are you sure you want to mark this civil construction project as COMPLETED? This will update the project lifecycle and record this administrative action in the audit trail.'
            : 'Are you sure you want to archive this project and set its status to ON_HOLD? Site records remain preserved for audit compliance.'
        }
        confirmLabel={confirmAction === 'complete' ? 'Mark Completed' : 'Archive Project'}
        variant={confirmAction === 'complete' ? 'default' : 'warning'}
        isLoading={isLoading}
        onConfirm={handleStatusChange}
      />
    </div>
  );
}
