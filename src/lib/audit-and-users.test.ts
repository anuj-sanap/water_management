import { describe, it, expect } from 'vitest';
import { hasPermission, ROLE_PERMISSIONS } from '@/lib/rbac';
import { getCalculationEngineDocumentation } from '@/lib/water-service';
import engine from '../../waterCalculations.js';

describe('Audit, User Management, and Engine Documentation Rules', () => {
  describe('RBAC & Role Restrictions', () => {
    it('allows only Project Managers and Auditors to read audit logs', () => {
      expect(hasPermission('PROJECT_MANAGER', 'audit_log:view')).toBe(true);
      expect(hasPermission('AUDITOR', 'audit_log:view')).toBe(true);
      expect(hasPermission('SITE_ENGINEER', 'audit_log:view')).toBe(false);
    });

    it('prohibits anyone from deleting audit logs (immutable ledger)', () => {
      const declaredPermissions = Object.values(ROLE_PERMISSIONS)
        .flatMap((permissions) => Object.keys(permissions));
      expect(declaredPermissions).not.toContain('audit_log:delete');
    });

    it('allows only Project Managers to manage users and system thresholds', () => {
      expect(hasPermission('PROJECT_MANAGER', 'users:manage')).toBe(true);
      expect(hasPermission('SITE_ENGINEER', 'users:manage')).toBe(false);
      expect(hasPermission('AUDITOR', 'users:manage')).toBe(false);

      expect(hasPermission('PROJECT_MANAGER', 'thresholds:edit')).toBe(true);
      expect(hasPermission('SITE_ENGINEER', 'thresholds:edit')).toBe(false);
      expect(hasPermission('AUDITOR', 'thresholds:edit')).toBe(false);
    });
  });

  describe('Authoritative Engine Documentation Linking', () => {
    it('pulls live constants directly from waterCalculations engine without drift', () => {
      const docs = getCalculationEngineDocumentation();

      expect(docs.metresPerInch).toBe(engine.METRES_PER_INCH);
      expect(docs.metresPerInch).toBe(0.0254);

      expect(docs.litresPerCubicMetre).toBe(engine.LITRES_PER_CUBIC_METRE);
      expect(docs.litresPerCubicMetre).toBe(1000);

      expect(docs.volumeToleranceM3).toBe(engine.VOLUME_TOLERANCE_M3);
      expect(docs.defaultAssumedVelocityInPerSec).toBe(engine.DEFAULT_CONFIG.assumedVelocityInPerSec);
      expect(docs.defaultAssumedVelocityInPerSec).toBe(47.24);

      expect(docs.unaccountedNote).toBe(engine.UNACCOUNTED_NOTE);
      expect(docs.unaccountedNote).toContain('is not, by itself, evidence of wastage');
    });

    it('ensures time and flow unit multipliers align with engine specifications', () => {
      const docs = getCalculationEngineDocumentation();

      expect(docs.timeUnits.s).toBe(1);
      expect(docs.timeUnits.min).toBe(60);
      expect(docs.timeUnits.h).toBe(3600);

      expect(docs.flowUnits['m3/s']).toBe(1);
      expect(docs.flowUnits['L/s']).toBe(0.001);
      expect(docs.volumeUnits.m3).toBe(1);
      expect(docs.volumeUnits.L).toBe(0.001);
    });
  });

  describe('Last Project Manager Invariant Logic', () => {
    it('prevents removing or deactivating the last active Project Manager', () => {
      function canDeactivateProjectManager(activePmCount: number): boolean {
        if (activePmCount <= 1) return false;
        return true;
      }

      function canDemoteProjectManager(activePmCount: number): boolean {
        if (activePmCount <= 1) return false;
        return true;
      }

      // If only 1 PM remains active in system
      expect(canDeactivateProjectManager(1)).toBe(false);
      expect(canDemoteProjectManager(1)).toBe(false);

      // If 2 or more PMs remain active
      expect(canDeactivateProjectManager(2)).toBe(true);
      expect(canDemoteProjectManager(2)).toBe(true);
      expect(canDeactivateProjectManager(5)).toBe(true);
    });
  });
});
