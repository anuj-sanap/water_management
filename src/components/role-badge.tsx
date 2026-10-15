import { Role } from '@prisma/client';
import { Shield, HardHat, ClipboardCheck } from 'lucide-react';

interface RoleBadgeProps {
  role: Role;
  className?: string;
  showIcon?: boolean;
}

export function RoleBadge({ role, className = '', showIcon = true }: RoleBadgeProps) {
  switch (role) {
    case 'PROJECT_MANAGER':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800 ${className}`}
        >
          {showIcon && <Shield className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
          <span>Project Manager</span>
        </span>
      );
    case 'SITE_ENGINEER':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-200 dark:border-sky-800 ${className}`}
        >
          {showIcon && <HardHat className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />}
          <span>Site Engineer</span>
        </span>
      );
    case 'AUDITOR':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800 ${className}`}
        >
          {showIcon && <ClipboardCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />}
          <span>Auditor (Read-Only)</span>
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 ${className}`}>
          {role}
        </span>
      );
  }
}
