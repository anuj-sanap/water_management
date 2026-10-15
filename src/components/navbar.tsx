'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Droplets,
  LogOut,
  FolderKanban,
  LayoutDashboard,
  BarChart3,
  Bell,
  History,
  Users as UsersIcon,
  Settings,
} from 'lucide-react';
import { RoleBadge } from './role-badge';
import { ProjectSwitcher } from './project-switcher';
import { signOutAction } from '@/app/actions/water-actions';
import { getOpenAlertsCountAction } from '@/app/actions/alert-actions';
import { Role } from '@prisma/client';

interface NavbarProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  };
  currentProjectId?: string;
  projects?: Array<{ id: string; name: string; location: string }>;
  openAlertsCount?: number;
}

export function Navbar({ user, currentProjectId, projects = [], openAlertsCount }: NavbarProps) {
  const pathname = usePathname();
  const [fetchedUnreadCount, setFetchedUnreadCount] = useState(0);
  const unreadCount = openAlertsCount ?? fetchedUnreadCount;

  useEffect(() => {
    if (openAlertsCount !== undefined) return;
    let active = true;
    getOpenAlertsCountAction()
      .then((count) => {
        if (active) setFetchedUnreadCount(count);
      })
      .catch((error: unknown) => {
        console.error('Could not load open alert count.', error);
      });
    return () => {
      active = false;
    };
  }, [openAlertsCount]);

  const dashboardHref = currentProjectId ? `/dashboard?project=${currentProjectId}` : '/dashboard';
  const analyticsHref = currentProjectId ? `/projects/${currentProjectId}/analytics` : '/analytics';
  const alertsHref = currentProjectId ? `/alerts?project=${currentProjectId}` : '/alerts';

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand + Project Switcher */}
        <div className="flex items-center gap-4 sm:gap-6">
          <Link href="/projects" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-cyan-500 flex items-center justify-center text-white shadow-sm group-hover:shadow-md transition-shadow">
              <Droplets className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                HydroTrack
              </span>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-medium -mt-1">
                Civil Water Management
              </span>
            </div>
          </Link>

          {projects.length > 0 && (
            <div className="border-l border-slate-200 dark:border-slate-800 pl-4 sm:pl-6">
              <ProjectSwitcher currentProjectId={currentProjectId} projects={projects} />
            </div>
          )}
        </div>

        {/* Center: Global Quick Navigation */}
        <nav className="hidden lg:flex items-center gap-1">
          <Link
            href="/projects"
            prefetch={false}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              pathname === '/projects' || pathname.startsWith('/projects/new')
                ? 'bg-slate-100 dark:bg-slate-800 text-sky-600 dark:text-sky-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5" />
            <span>Projects</span>
          </Link>
          <Link
            href={dashboardHref}
            prefetch={false}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              pathname.startsWith('/dashboard')
                ? 'bg-slate-100 dark:bg-slate-800 text-sky-600 dark:text-sky-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </Link>
          <Link
            href={analyticsHref}
            prefetch={false}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              pathname.startsWith('/analytics') || pathname.endsWith('/analytics')
                ? 'bg-slate-100 dark:bg-slate-800 text-sky-600 dark:text-sky-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Analytics</span>
          </Link>
          <Link
            href={alertsHref}
            prefetch={false}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              pathname.startsWith('/alerts')
                ? 'bg-slate-100 dark:bg-slate-800 text-sky-600 dark:text-sky-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Alerts</span>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.2 text-[10px] font-bold text-white bg-rose-500 rounded-full animate-pulse">
                {unreadCount}
              </span>
            )}
          </Link>
          {(user.role === 'PROJECT_MANAGER' || user.role === 'AUDITOR') && (
            <Link
              href="/audit-log"
              prefetch={false}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                pathname.startsWith('/audit-log')
                  ? 'bg-slate-100 dark:bg-slate-800 text-sky-600 dark:text-sky-400'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Audit Trail</span>
            </Link>
          )}
          {user.role === 'PROJECT_MANAGER' && (
            <Link
              href="/users"
              prefetch={false}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                pathname.startsWith('/users')
                  ? 'bg-slate-100 dark:bg-slate-800 text-sky-600 dark:text-sky-400'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <UsersIcon className="w-3.5 h-3.5" />
              <span>Users</span>
            </Link>
          )}
        </nav>

        {/* Right: User Profile & Settings & Sign Out */}
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/settings"
            prefetch={false}
            title="Settings & Calculations"
            className={`p-2 rounded-xl border transition-all ${
              pathname.startsWith('/settings')
                ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-800'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white border-transparent hover:border-slate-200 dark:hover:border-slate-800'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="sr-only">Settings</span>
          </Link>
          <div className="flex items-center gap-2.5 text-right">
            <div className="hidden md:block">
              <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                {user.name}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {user.email}
              </div>
            </div>
            <RoleBadge role={user.role} />
          </div>

          <form action={signOutAction}>
            <button
              type="submit"
              title="Sign out of HydroTrack"
              className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 border border-transparent hover:border-rose-200 dark:hover:border-rose-800/50 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="sr-only">Sign out</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
