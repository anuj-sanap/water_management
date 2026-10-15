import type { Role } from '@prisma/client';

export type { Role };

export type Permission =
  | 'project:view'
  | 'project:create'
  | 'project:edit'
  | 'project:delete'
  | 'project:manage_members'
  | 'thresholds:edit'
  | 'activity_types:manage'
  | 'users:manage'
  | 'supply:view'
  | 'supply:create'
  | 'supply:edit'
  | 'supply:delete'
  | 'consumption:view'
  | 'consumption:create'
  | 'consumption:edit'
  | 'consumption:delete'
  | 'dashboard:view'
  | 'analytics:view'
  | 'alerts:view'
  | 'audit_log:view'
  | 'reports:view'
  | 'reports:export';

export const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

/**
 * Base Permission Map per Role
 */
export const ROLE_PERMISSIONS: Record<Role, Record<Permission, boolean>> = {
  PROJECT_MANAGER: {
    'project:view': true,
    'project:create': true,
    'project:edit': true,
    'project:delete': true,
    'project:manage_members': true,
    'thresholds:edit': true,
    'activity_types:manage': true,
    'users:manage': true,
    'supply:view': true,
    'supply:create': true,
    'supply:edit': true,
    'supply:delete': true,
    'consumption:view': true,
    'consumption:create': true,
    'consumption:edit': true,
    'consumption:delete': true,
    'dashboard:view': true,
    'analytics:view': true,
    'alerts:view': true,
    'audit_log:view': true,
    'reports:view': true,
    'reports:export': true,
  },
  SITE_ENGINEER: {
    'project:view': true,
    'project:create': false,
    'project:edit': false,
    'project:delete': false,
    'project:manage_members': false,
    'thresholds:edit': false,
    'activity_types:manage': false,
    'users:manage': false,
    'supply:view': true,
    'supply:create': true,
    'supply:edit': true, // Subject to 48-hour own-record rule
    'supply:delete': true, // Subject to 48-hour own-record rule
    'consumption:view': true,
    'consumption:create': true,
    'consumption:edit': true, // Subject to 48-hour own-record rule
    'consumption:delete': true, // Subject to 48-hour own-record rule
    'dashboard:view': true,
    'analytics:view': true,
    'alerts:view': true,
    'audit_log:view': false,
    'reports:view': true,
    'reports:export': true,
  },
  AUDITOR: {
    'project:view': true,
    'project:create': false,
    'project:edit': false,
    'project:delete': false,
    'project:manage_members': false,
    'thresholds:edit': false,
    'activity_types:manage': false,
    'users:manage': false,
    'supply:view': true,
    'supply:create': false,
    'supply:edit': false,
    'supply:delete': false,
    'consumption:view': true,
    'consumption:create': false,
    'consumption:edit': false,
    'consumption:delete': false,
    'dashboard:view': true,
    'analytics:view': true,
    'alerts:view': true,
    'audit_log:view': true, // Auditors have full read-only access to audit log
    'reports:view': true,
    'reports:export': true,
  },
};

/**
 * Check if a timestamp is within the 48-hour window
 */
export function isWithin48Hours(
  createdAt: Date | string | number,
  referenceTime: number = Date.now()
): boolean {
  const createdMs = new Date(createdAt).getTime();
  if (isNaN(createdMs)) return false;
  const age = referenceTime - createdMs;
  return age >= 0 && age <= FORTY_EIGHT_HOURS_MS;
}

/**
 * Check if a user has a base permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return Boolean(ROLE_PERMISSIONS[role]?.[permission]);
}

/**
 * Record interface for edit/delete validation
 */
export interface RecordWithOwnership {
  id?: string;
  createdById: string;
  createdAt: Date | string | number;
}

/**
 * Dynamic permission check for editing a supply or consumption record
 * - PM: can edit any record at any time
 * - Site Engineer: can edit only own records created within the last 48 hours
 * - Auditor: cannot edit anything
 */
export function canEditRecord(
  user: { id: string; role: Role },
  record: RecordWithOwnership,
  referenceTime: number = Date.now()
): boolean {
  if (user.role === 'PROJECT_MANAGER') {
    return true;
  }
  if (user.role === 'AUDITOR') {
    return false;
  }
  if (user.role === 'SITE_ENGINEER') {
    if (record.createdById !== user.id) {
      return false;
    }
    return isWithin48Hours(record.createdAt, referenceTime);
  }
  return false;
}

/**
 * Dynamic permission check for deleting a supply or consumption record
 * - PM: can delete any record at any time
 * - Site Engineer: can delete only own records created within the last 48 hours
 * - Auditor: cannot delete anything
 */
export function canDeleteRecord(
  user: { id: string; role: Role },
  record: RecordWithOwnership,
  referenceTime: number = Date.now()
): boolean {
  return canEditRecord(user, record, referenceTime);
}

/**
 * Project Access Check
 * - PM: can access all projects
 * - Auditor: can access all projects (read-only)
 * - Site Engineer: can only access projects they are assigned to
 */
export function canAccessProject(
  user: { id: string; role: Role },
  projectId: string,
  assignedProjectIds: string[] = []
): boolean {
  if (user.role === 'PROJECT_MANAGER' || user.role === 'AUDITOR') {
    return true;
  }
  if (user.role === 'SITE_ENGINEER') {
    return assignedProjectIds.includes(projectId);
  }
  return false;
}

/**
 * Tooltip message for disabled buttons when logged in as an Auditor
 */
export const AUDITOR_DISABLED_TOOLTIP = 'Read-only for auditors';

export function getActionTooltip(role: Role): string | undefined {
  if (role === 'AUDITOR') {
    return AUDITOR_DISABLED_TOOLTIP;
  }
  return undefined;
}

/**
 * Route protection validator for middleware and server-side checks.
 * Returns whether the route is allowed for the given role.
 */
export function canAccessRoute(
  role: Role | undefined,
  pathname: string
): { allowed: boolean; reason?: string } {
  // Public assets and authentication routes are always allowed
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/403'
  ) {
    return { allowed: true };
  }

  // If not authenticated, not allowed
  if (!role) {
    return { allowed: false, reason: 'unauthenticated' };
  }

  // 1. AUDITOR restrictions:
  // Cannot access any create or edit routes even by typing the URL
  if (role === 'AUDITOR') {
    const isCreateOrEditRoute =
      pathname.includes('/new') ||
      pathname.includes('/create') ||
      pathname.includes('/edit') ||
      pathname.startsWith('/projects/new') ||
      pathname.startsWith('/settings/thresholds') ||
      pathname.startsWith('/settings/members') ||
      pathname.startsWith('/settings/users');

    if (isCreateOrEditRoute) {
      return { allowed: false, reason: 'read_only_for_auditors' };
    }
    return { allowed: true };
  }

  // 2. SITE_ENGINEER restrictions:
  // Cannot manage users, cannot create new projects, cannot modify global settings/thresholds, cannot view audit log
  if (role === 'SITE_ENGINEER') {
    if (
      pathname.startsWith('/projects/new') ||
      pathname.startsWith('/settings/users') ||
      pathname.startsWith('/settings/thresholds') ||
      pathname.startsWith('/audit-logs') ||
      pathname.includes('/settings/members')
    ) {
      return { allowed: false, reason: 'unauthorized_for_site_engineer' };
    }
    return { allowed: true };
  }

  // 3. PROJECT_MANAGER:
  // Full access to all application routes
  if (role === 'PROJECT_MANAGER') {
    return { allowed: true };
  }

  return { allowed: false, reason: 'unknown_role' };
}
