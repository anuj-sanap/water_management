import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  isWithin48Hours,
  canEditRecord,
  canDeleteRecord,
  canAccessProject,
  canAccessRoute,
  AUDITOR_DISABLED_TOOLTIP,
  getActionTooltip,
  FORTY_EIGHT_HOURS_MS,
} from './rbac';

describe('RBAC Permissions & Rules', () => {
  const now = new Date('2026-10-14T12:00:00Z').getTime();

  describe('Base Permission Map (hasPermission)', () => {
    it('PROJECT_MANAGER has all permissions enabled', () => {
      expect(hasPermission('PROJECT_MANAGER', 'project:create')).toBe(true);
      expect(hasPermission('PROJECT_MANAGER', 'project:manage_members')).toBe(true);
      expect(hasPermission('PROJECT_MANAGER', 'thresholds:edit')).toBe(true);
      expect(hasPermission('PROJECT_MANAGER', 'users:manage')).toBe(true);
      expect(hasPermission('PROJECT_MANAGER', 'supply:delete')).toBe(true);
      expect(hasPermission('PROJECT_MANAGER', 'consumption:delete')).toBe(true);
      expect(hasPermission('PROJECT_MANAGER', 'audit_log:view')).toBe(true);
      expect(hasPermission('PROJECT_MANAGER', 'reports:export')).toBe(true);
    });

    it('SITE_ENGINEER can view dashboard, log/edit records, export own reports, but not manage users/thresholds', () => {
      expect(hasPermission('SITE_ENGINEER', 'dashboard:view')).toBe(true);
      expect(hasPermission('SITE_ENGINEER', 'supply:create')).toBe(true);
      expect(hasPermission('SITE_ENGINEER', 'consumption:create')).toBe(true);
      expect(hasPermission('SITE_ENGINEER', 'reports:export')).toBe(true);

      // Forbidden administrative operations
      expect(hasPermission('SITE_ENGINEER', 'users:manage')).toBe(false);
      expect(hasPermission('SITE_ENGINEER', 'thresholds:edit')).toBe(false);
      expect(hasPermission('SITE_ENGINEER', 'project:create')).toBe(false);
      expect(hasPermission('SITE_ENGINEER', 'project:manage_members')).toBe(false);
      expect(hasPermission('SITE_ENGINEER', 'audit_log:view')).toBe(false);
    });

    it('AUDITOR has read-only access to all dashboards and audit logs, but cannot create or edit', () => {
      expect(hasPermission('AUDITOR', 'project:view')).toBe(true);
      expect(hasPermission('AUDITOR', 'supply:view')).toBe(true);
      expect(hasPermission('AUDITOR', 'consumption:view')).toBe(true);
      expect(hasPermission('AUDITOR', 'audit_log:view')).toBe(true);
      expect(hasPermission('AUDITOR', 'reports:export')).toBe(true);

      // Cannot create, edit, or delete anything
      expect(hasPermission('AUDITOR', 'supply:create')).toBe(false);
      expect(hasPermission('AUDITOR', 'supply:edit')).toBe(false);
      expect(hasPermission('AUDITOR', 'supply:delete')).toBe(false);
      expect(hasPermission('AUDITOR', 'consumption:create')).toBe(false);
      expect(hasPermission('AUDITOR', 'consumption:edit')).toBe(false);
      expect(hasPermission('AUDITOR', 'consumption:delete')).toBe(false);
      expect(hasPermission('AUDITOR', 'users:manage')).toBe(false);
      expect(hasPermission('AUDITOR', 'thresholds:edit')).toBe(false);
    });
  });

  describe('48-Hour Window Check (isWithin48Hours)', () => {
    it('returns true for timestamps within 48 hours', () => {
      const tenHoursAgo = new Date(now - 10 * 60 * 60 * 1000);
      expect(isWithin48Hours(tenHoursAgo, now)).toBe(true);

      const fortySevenHoursAgo = new Date(now - 47 * 60 * 60 * 1000);
      expect(isWithin48Hours(fortySevenHoursAgo, now)).toBe(true);

      const exactBoundary = new Date(now - FORTY_EIGHT_HOURS_MS);
      expect(isWithin48Hours(exactBoundary, now)).toBe(true);
    });

    it('returns false for timestamps older than 48 hours or in the future', () => {
      const fortyNineHoursAgo = new Date(now - 49 * 60 * 60 * 1000);
      expect(isWithin48Hours(fortyNineHoursAgo, now)).toBe(false);

      const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60 * 1000);
      expect(isWithin48Hours(fiveDaysAgo, now)).toBe(false);

      const futureDate = new Date(now + 10000);
      expect(isWithin48Hours(futureDate, now)).toBe(false);
    });
  });

  describe('Dynamic Record Edit/Delete (canEditRecord & canDeleteRecord)', () => {
    const engineer = { id: 'user-eng-1', role: 'SITE_ENGINEER' as const };
    const pm = { id: 'user-pm-1', role: 'PROJECT_MANAGER' as const };
    const auditor = { id: 'user-auditor-1', role: 'AUDITOR' as const };

    const recentOwnRecord = {
      id: 'rec-1',
      createdById: 'user-eng-1',
      createdAt: new Date(now - 12 * 60 * 60 * 1000), // 12 hours ago
    };

    const oldOwnRecord = {
      id: 'rec-2',
      createdById: 'user-eng-1',
      createdAt: new Date(now - 60 * 60 * 60 * 1000), // 60 hours ago
    };

    const otherUsersRecentRecord = {
      id: 'rec-3',
      createdById: 'user-eng-2',
      createdAt: new Date(now - 5 * 60 * 60 * 1000), // 5 hours ago
    };

    it('SITE_ENGINEER can edit/delete own record within 48 hours', () => {
      expect(canEditRecord(engineer, recentOwnRecord, now)).toBe(true);
      expect(canDeleteRecord(engineer, recentOwnRecord, now)).toBe(true);
    });

    it('SITE_ENGINEER cannot edit/delete own record after 48 hours', () => {
      expect(canEditRecord(engineer, oldOwnRecord, now)).toBe(false);
      expect(canDeleteRecord(engineer, oldOwnRecord, now)).toBe(false);
    });

    it('SITE_ENGINEER cannot edit/delete another user record even if recent', () => {
      expect(canEditRecord(engineer, otherUsersRecentRecord, now)).toBe(false);
      expect(canDeleteRecord(engineer, otherUsersRecentRecord, now)).toBe(false);
    });

    it('PROJECT_MANAGER can edit/delete any record regardless of age or owner', () => {
      expect(canEditRecord(pm, recentOwnRecord, now)).toBe(true);
      expect(canEditRecord(pm, oldOwnRecord, now)).toBe(true);
      expect(canEditRecord(pm, otherUsersRecentRecord, now)).toBe(true);

      expect(canDeleteRecord(pm, recentOwnRecord, now)).toBe(true);
      expect(canDeleteRecord(pm, oldOwnRecord, now)).toBe(true);
      expect(canDeleteRecord(pm, otherUsersRecentRecord, now)).toBe(true);
    });

    it('AUDITOR cannot edit or delete any record under any circumstances', () => {
      expect(canEditRecord(auditor, recentOwnRecord, now)).toBe(false);
      expect(canEditRecord(auditor, oldOwnRecord, now)).toBe(false);
      expect(canDeleteRecord(auditor, recentOwnRecord, now)).toBe(false);
      expect(canDeleteRecord(auditor, oldOwnRecord, now)).toBe(false);
    });
  });

  describe('Project Access Restrictions (canAccessProject)', () => {
    const engineer = { id: 'eng-1', role: 'SITE_ENGINEER' as const };
    const pm = { id: 'pm-1', role: 'PROJECT_MANAGER' as const };
    const auditor = { id: 'aud-1', role: 'AUDITOR' as const };

    const assigned = ['project-apex-1'];

    it('PROJECT_MANAGER can access any project', () => {
      expect(canAccessProject(pm, 'project-apex-1', [])).toBe(true);
      expect(canAccessProject(pm, 'project-green-2', [])).toBe(true);
    });

    it('AUDITOR can access any project', () => {
      expect(canAccessProject(auditor, 'project-apex-1', [])).toBe(true);
      expect(canAccessProject(auditor, 'project-green-2', [])).toBe(true);
    });

    it('SITE_ENGINEER can only access assigned projects', () => {
      expect(canAccessProject(engineer, 'project-apex-1', assigned)).toBe(true);
      expect(canAccessProject(engineer, 'project-green-2', assigned)).toBe(false);
    });
  });

  describe('Route Access Protection (canAccessRoute)', () => {
    it('allows public routes to everyone (including unauthenticated)', () => {
      expect(canAccessRoute(undefined, '/login').allowed).toBe(true);
      expect(canAccessRoute(undefined, '/403').allowed).toBe(true);
      expect(canAccessRoute(undefined, '/api/auth/session').allowed).toBe(true);
    });

    it('blocks unauthenticated access to internal routes', () => {
      expect(canAccessRoute(undefined, '/projects').allowed).toBe(false);
      expect(canAccessRoute(undefined, '/dashboard').allowed).toBe(false);
    });

    it('blocks AUDITOR from accessing create or edit routes even by typing URL', () => {
      expect(canAccessRoute('AUDITOR', '/projects/p1/supplies/new').allowed).toBe(false);
      expect(canAccessRoute('AUDITOR', '/projects/p1/supplies/s1/edit').allowed).toBe(false);
      expect(canAccessRoute('AUDITOR', '/projects/p1/consumption/new').allowed).toBe(false);
      expect(canAccessRoute('AUDITOR', '/projects/p1/consumption/c1/edit').allowed).toBe(false);
      expect(canAccessRoute('AUDITOR', '/projects/new').allowed).toBe(false);
      expect(canAccessRoute('AUDITOR', '/settings/thresholds').allowed).toBe(false);
      expect(canAccessRoute('AUDITOR', '/settings/users').allowed).toBe(false);
    });

    it('allows AUDITOR to access read-only routes and audit logs', () => {
      expect(canAccessRoute('AUDITOR', '/projects').allowed).toBe(true);
      expect(canAccessRoute('AUDITOR', '/projects/p1').allowed).toBe(true);
      expect(canAccessRoute('AUDITOR', '/projects/p1/supplies').allowed).toBe(true);
      expect(canAccessRoute('AUDITOR', '/projects/p1/consumption').allowed).toBe(true);
      expect(canAccessRoute('AUDITOR', '/audit-logs').allowed).toBe(true);
    });

    it('blocks SITE_ENGINEER from administrative routes', () => {
      expect(canAccessRoute('SITE_ENGINEER', '/settings/users').allowed).toBe(false);
      expect(canAccessRoute('SITE_ENGINEER', '/settings/thresholds').allowed).toBe(false);
      expect(canAccessRoute('SITE_ENGINEER', '/projects/new').allowed).toBe(false);
      expect(canAccessRoute('SITE_ENGINEER', '/audit-logs').allowed).toBe(false);
    });

    it('allows SITE_ENGINEER to access project create and view routes', () => {
      expect(canAccessRoute('SITE_ENGINEER', '/projects/p1').allowed).toBe(true);
      expect(canAccessRoute('SITE_ENGINEER', '/projects/p1/supplies/new').allowed).toBe(true);
      expect(canAccessRoute('SITE_ENGINEER', '/projects/p1/consumption/new').allowed).toBe(true);
    });

    it('allows PROJECT_MANAGER full access to everything', () => {
      expect(canAccessRoute('PROJECT_MANAGER', '/projects/new').allowed).toBe(true);
      expect(canAccessRoute('PROJECT_MANAGER', '/settings/users').allowed).toBe(true);
      expect(canAccessRoute('PROJECT_MANAGER', '/settings/thresholds').allowed).toBe(true);
      expect(canAccessRoute('PROJECT_MANAGER', '/projects/p1/supplies/new').allowed).toBe(true);
      expect(canAccessRoute('PROJECT_MANAGER', '/audit-logs').allowed).toBe(true);
    });
  });

  describe('UI Tooltip Helper', () => {
    it('returns tooltip for AUDITOR and undefined for others', () => {
      expect(getActionTooltip('AUDITOR')).toBe(AUDITOR_DISABLED_TOOLTIP);
      expect(getActionTooltip('PROJECT_MANAGER')).toBeUndefined();
      expect(getActionTooltip('SITE_ENGINEER')).toBeUndefined();
    });
  });
});
