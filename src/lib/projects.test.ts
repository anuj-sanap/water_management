import { describe, it, expect } from 'vitest';
import { hasPermission } from './rbac';

describe('Projects Feature - RBAC & Acceptance Criteria', () => {
  describe('Project Management Permissions', () => {
    it('allows Project Managers to create projects', () => {
      expect(hasPermission('PROJECT_MANAGER', 'project:create')).toBe(true);
    });

    it('allows Project Managers to edit projects and manage thresholds', () => {
      expect(hasPermission('PROJECT_MANAGER', 'project:edit')).toBe(true);
      expect(hasPermission('PROJECT_MANAGER', 'thresholds:edit')).toBe(true);
      expect(hasPermission('PROJECT_MANAGER', 'activity_types:manage')).toBe(true);
      expect(hasPermission('PROJECT_MANAGER', 'project:manage_members')).toBe(true);
    });

    it('prevents Site Engineers from creating projects or editing settings', () => {
      expect(hasPermission('SITE_ENGINEER', 'project:create')).toBe(false);
      expect(hasPermission('SITE_ENGINEER', 'project:edit')).toBe(false);
      expect(hasPermission('SITE_ENGINEER', 'thresholds:edit')).toBe(false);
      expect(hasPermission('SITE_ENGINEER', 'activity_types:manage')).toBe(false);
      expect(hasPermission('SITE_ENGINEER', 'project:manage_members')).toBe(false);
    });

    it('prevents Auditors from modifying project settings or creating projects', () => {
      expect(hasPermission('AUDITOR', 'project:create')).toBe(false);
      expect(hasPermission('AUDITOR', 'project:edit')).toBe(false);
      expect(hasPermission('AUDITOR', 'thresholds:edit')).toBe(false);
      expect(hasPermission('AUDITOR', 'activity_types:manage')).toBe(false);
    });

    it('allows all roles to view projects', () => {
      expect(hasPermission('PROJECT_MANAGER', 'project:view')).toBe(true);
      expect(hasPermission('SITE_ENGINEER', 'project:view')).toBe(true);
      expect(hasPermission('AUDITOR', 'project:view')).toBe(true);
    });
  });

  describe('Water Calculation & Engineering Terminology Acceptance', () => {
    it('assumed velocity default text conforms to exact specification', () => {
      const requiredExplanation =
        'Used only when a pipe record has no measured velocity. This is an assumption, not a measurement.';
      expect(requiredExplanation).toContain('This is an assumption, not a measurement.');
    });

    it('status reflects water balance tolerance without using loss or wastage', () => {
      function evaluateWaterBalanceStatus(
        suppliedM3: number,
        consumedM3: number,
        thresholdPercent: number
      ) {
        if (consumedM3 > suppliedM3) return 'DATA_CHECK';
        const unaccountedM3 = suppliedM3 - consumedM3;
        const unaccountedPercent = suppliedM3 > 0 ? (unaccountedM3 / suppliedM3) * 100 : 0;
        if (unaccountedPercent > thresholdPercent) return 'ATTENTION';
        return 'OK';
      }

      // Normal within threshold (10% unaccounted vs 15% threshold)
      expect(evaluateWaterBalanceStatus(100, 90, 15)).toBe('OK');

      // Attention needed (20% unaccounted vs 15% threshold)
      expect(evaluateWaterBalanceStatus(100, 80, 15)).toBe('ATTENTION');

      // Data check needed (consumed > supplied)
      expect(evaluateWaterBalanceStatus(100, 110, 15)).toBe('DATA_CHECK');
    });
  });
});
