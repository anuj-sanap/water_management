'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Role } from '@prisma/client';
import {
  LayoutDashboard,
  Truck,
  Droplet,
  BarChart3,
  History,
  Sliders,
  FileText,
  Bell,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { getOpenAlertsCountAction } from '@/app/actions/alert-actions';

interface ProjectNavProps {
  projectId: string;
  role: Role;
  openAlertsCount?: number;
}

export function ProjectNav({ projectId, role, openAlertsCount }: ProjectNavProps) {
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

  const isAuditor = role === 'AUDITOR';
  const isProjectManager = role === 'PROJECT_MANAGER';

  const navItems = [
    {
      label: 'Overview',
      href: `/projects/${projectId}`,
      icon: LayoutDashboard,
      active: pathname === `/projects/${projectId}`,
      visible: true,
    },
    {
      label: 'Telemetry Dashboard',
      href: `/dashboard?project=${projectId}`,
      icon: BarChart3,
      active: pathname === '/dashboard' || pathname.startsWith(`/projects/${projectId}/dashboard`),
      visible: true,
    },
    {
      label: 'Water Supplies',
      href: `/projects/${projectId}/supplies`,
      icon: Truck,
      active: pathname.startsWith(`/projects/${projectId}/supplies`),
      visible: true,
    },
    {
      label: 'Consumption',
      href: `/projects/${projectId}/consumption`,
      icon: Droplet,
      active: pathname.startsWith(`/projects/${projectId}/consumption`),
      visible: true,
    },
    {
      label: 'Water Balance & Analytics',
      href: `/projects/${projectId}/analytics`,
      icon: BarChart3,
      active: pathname.startsWith(`/projects/${projectId}/analytics`) || pathname.startsWith('/analytics'),
      visible: true,
    },
    {
      label: 'Alerts',
      href: `/alerts?project=${projectId}`,
      icon: Bell,
      active: pathname.startsWith('/alerts'),
      visible: true,
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    {
      label: 'Reports',
      href: `/reports?project=${projectId}`,
      icon: FileText,
      active: pathname.startsWith('/reports'),
      visible: true,
    },
    {
      label: 'Audit Trail',
      href: `/audit-logs?project=${projectId}`,
      icon: History,
      active: pathname.startsWith('/audit-logs'),
      visible: isProjectManager || isAuditor, // Hidden for Site Engineers!
    },
    {
      label: 'Thresholds & Velocity',
      href: `/projects/${projectId}/settings`,
      icon: Sliders,
      active: pathname.startsWith(`/projects/${projectId}/settings`),
      visible: isProjectManager || isAuditor, // Hidden for Site Engineers, view-only for Auditors!
    },
  ];

  return (
    <nav className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800 text-sm">
      {navItems
        .filter((item) => item.visible)
        .map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-medium transition-all whitespace-nowrap ${
                item.active
                  ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-rose-500 rounded-full animate-pulse">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
    </nav>
  );
}
