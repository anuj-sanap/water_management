'use client';

import * as React from 'react';
import Link from 'next/link';
import { ProjectStatus, Role } from '@prisma/client';
import {
  Building2,
  Calendar,
  MapPin,
  Search,
  LayoutGrid,
  Table as TableIcon,
  Plus,
  ArrowRight,
  Edit,
  RotateCcw,
} from 'lucide-react';
import { ProjectSparkline } from './project-sparkline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface ProjectListItem {
  id: string;
  name: string;
  location: string;
  clientName: string | null;
  startDate: string;
  endDate: string | null;
  status: ProjectStatus;
  unaccountedThresholdPercent: number;
  assumedVelocityInPerSec: number;
  members: Array<{
    userId: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
    };
  }>;
  stats30d: {
    suppliedM3: number;
    consumedM3: number;
    unaccountedM3: number;
    unaccountedPercent: number;
    status: 'OK' | 'ATTENTION' | 'DATA_CHECK';
    sparklineData: number[];
  };
}

interface ProjectsViewProps {
  projects: ProjectListItem[];
  userRole: Role;
}

export function ProjectsView({ projects, userRole }: ProjectsViewProps) {
  const [viewMode, setViewMode] = React.useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('ALL');

  const isProjectManager = userRole === 'PROJECT_MANAGER';

  // Filter projects by search and status
  const filteredProjects = React.useMemo(() => {
    return projects.filter((project) => {
      // Status match
      if (statusFilter !== 'ALL' && project.status !== statusFilter) {
        return false;
      }
      // Search match
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = project.name.toLowerCase().includes(query);
        const matchesLocation = project.location.toLowerCase().includes(query);
        const matchesClient = project.clientName?.toLowerCase().includes(query) ?? false;
        return matchesName || matchesLocation || matchesClient;
      }
      return true;
    });
  }, [projects, searchQuery, statusFilter]);

  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = { ALL: projects.length };
    for (const p of projects) {
      counts[p.status] = (counts[p.status] || 0) + 1;
    }
    return counts;
  }, [projects]);

  function getStatusBadge(status: ProjectStatus) {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            Active
          </span>
        );
      case 'PLANNING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
            Planning
          </span>
        );
      case 'ON_HOLD':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            On Hold
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            Completed
          </span>
        );
    }
  }

  function formatDateRange(startDateStr: string, endDateStr: string | null) {
    const start = new Date(startDateStr);
    const startFmt = start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    if (!endDateStr) {
      return `Started ${startFmt}`;
    }

    const end = new Date(endDateStr);
    const endFmt = end.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return `${startFmt} – ${endFmt}`;
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
      {/* Search, Filter Bar and Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Search projects by name, location, or client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-sky-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Clear
            </button>
          )}
        </div>

        {/* View Toggle and Actions */}
        <div className="flex items-center gap-3">
          {/* Grid / Table Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              aria-label="Table view"
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <TableIcon className="w-4 h-4" />
            </button>
          </div>

          {/* New Project Button (Project Managers Only) */}
          {isProjectManager && (
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-all shadow-xs hover:shadow"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </Link>
          )}
        </div>
      </div>

      {/* Status Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {(['ALL', 'ACTIVE', 'PLANNING', 'ON_HOLD', 'COMPLETED'] as const).map((st) => {
          const count = statusCounts[st] || 0;
          const isActive = statusFilter === st;
          const label = st === 'ALL' ? 'All Projects' : st.replace('_', ' ');

          return (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-full font-semibold capitalize transition-all whitespace-nowrap flex items-center gap-1.5 ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <span>{label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isActive
                    ? 'bg-slate-700 text-slate-200 dark:bg-slate-200 dark:text-slate-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredProjects.length === 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-slate-400 mx-auto">
            <Building2 className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              No matching projects found
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {searchQuery || statusFilter !== 'ALL'
                ? 'Try adjusting your search keywords or switching your status filter.'
                : isProjectManager
                ? 'Get started by creating your first construction project to manage water telemetry.'
                : 'You have not been assigned to any civil engineering projects yet.'}
            </p>
          </div>
          <div className="pt-2 flex items-center justify-center gap-3">
            {(searchQuery || statusFilter !== 'ALL') && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                }}
                className="rounded-xl text-xs flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </Button>
            )}
            {isProjectManager && (
              <Link
                href="/projects/new"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Project</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && filteredProjects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => {
            const hasExceeded =
              project.stats30d.unaccountedPercent > project.unaccountedThresholdPercent;

            return (
              <div
                key={project.id}
                className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
              >
                <div className="space-y-4">
                  {/* Top Bar: Status, Client, and Edit Link */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(project.status)}
                        {project.clientName && (
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[150px]">
                            {project.clientName}
                          </span>
                        )}
                      </div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                        <Link href={`/projects/${project.id}`}>{project.name}</Link>
                      </h2>
                    </div>

                    {isProjectManager && (
                      <Link
                        href={`/projects/${project.id}/edit`}
                        title="Edit Project Settings & Team"
                        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </Link>
                    )}
                  </div>

                  {/* Location & Dates */}
                  <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{project.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{formatDateRange(project.startDate, project.endDate)}</span>
                    </div>
                  </div>

                  {/* Members Avatars Stack */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-slate-400">Team</span>
                      <div className="flex items-center -space-x-2 overflow-hidden">
                        {project.members.slice(0, 5).map((m) => (
                          <div
                            key={m.userId}
                            title={`${m.user.name} (${m.user.role.replace('_', ' ')})`}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 border-2 border-white dark:border-slate-900 text-[10px] font-bold text-slate-700 dark:text-slate-200 shadow-2xs"
                          >
                            {getInitials(m.user.name)}
                          </div>
                        ))}
                        {project.members.length > 5 && (
                          <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-white dark:border-slate-900 text-[10px] font-medium text-slate-500">
                            +{project.members.length - 5}
                          </div>
                        )}
                      </div>
                    </div>

                    <span className="text-[11px] text-slate-400 font-mono">
                      {project.members.length} {project.members.length === 1 ? 'member' : 'members'}
                    </span>
                  </div>

                  {/* Mini Stats (Last 30 Days) with Sparkline */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <span>Last 30 Days Telemetry</span>
                      {/* Tiny Sparkline */}
                      <ProjectSparkline
                        data={project.stats30d.sparklineData}
                        width={80}
                        height={22}
                        color={hasExceeded ? '#f59e0b' : '#0284c7'}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center divide-x divide-slate-200 dark:divide-slate-700">
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">
                          Supplied
                        </div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                          {project.stats30d.suppliedM3.toFixed(1)} <span className="font-normal text-[10px] text-slate-400">m³</span>
                        </div>
                      </div>

                      <div className="pl-2">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">
                          Recorded
                        </div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                          {project.stats30d.consumedM3.toFixed(1)} <span className="font-normal text-[10px] text-slate-400">m³</span>
                        </div>
                      </div>

                      <div className="pl-2">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">
                          Unaccounted
                        </div>
                        <div
                          className={`text-xs font-bold mt-0.5 ${
                            hasExceeded
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {project.stats30d.unaccountedPercent.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer link to project dashboard */}
                <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">
                    Threshold: {project.unaccountedThresholdPercent}%
                  </span>

                  <Link
                    href={`/projects/${project.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300"
                  >
                    <span>Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && filteredProjects.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Project & Client</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Location</th>
                  <th className="px-4 py-3.5">Date Range</th>
                  <th className="px-4 py-3.5">Team</th>
                  <th className="px-4 py-3.5 text-right">30d Supplied</th>
                  <th className="px-4 py-3.5 text-right">30d Recorded</th>
                  <th className="px-4 py-3.5 text-right">Unaccounted %</th>
                  <th className="px-4 py-3.5 text-center">30d Trend</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredProjects.map((project) => {
                  const hasExceeded =
                    project.stats30d.unaccountedPercent > project.unaccountedThresholdPercent;

                  return (
                    <tr
                      key={project.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-bold text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400"
                        >
                          {project.name}
                        </Link>
                        {project.clientName && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Client: {project.clientName}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">{getStatusBadge(project.status)}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                        {project.location}
                      </td>
                      <td className="px-4 py-4 text-slate-500 whitespace-nowrap">
                        {formatDateRange(project.startDate, project.endDate)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center -space-x-1.5">
                          {project.members.slice(0, 3).map((m) => (
                            <div
                              key={m.userId}
                              title={`${m.user.name} (${m.user.role.replace('_', ' ')})`}
                              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 border-2 border-white dark:border-slate-900 text-[9px] font-bold text-slate-700 dark:text-slate-200"
                            >
                              {getInitials(m.user.name)}
                            </div>
                          ))}
                          {project.members.length > 3 && (
                            <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-white dark:border-slate-900 text-[9px] font-medium text-slate-500">
                              +{project.members.length - 3}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-slate-900 dark:text-white">
                        {project.stats30d.suppliedM3.toFixed(1)} m³
                      </td>
                      <td className="px-4 py-4 text-right font-medium text-slate-900 dark:text-white">
                        {project.stats30d.consumedM3.toFixed(1)} m³
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span
                          className={`font-bold ${
                            hasExceeded
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {project.stats30d.unaccountedPercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <ProjectSparkline
                          data={project.stats30d.sparklineData}
                          width={75}
                          height={20}
                          color={hasExceeded ? '#f59e0b' : '#0284c7'}
                        />
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap space-x-2">
                        {isProjectManager && (
                          <Link
                            href={`/projects/${project.id}/edit`}
                            className="p-1.5 inline-flex text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit project"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Link>
                        )}
                        <Link
                          href={`/projects/${project.id}`}
                          className="inline-flex items-center gap-1 font-semibold text-sky-600 dark:text-sky-400 hover:text-sky-700"
                        >
                          <span>Open</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
