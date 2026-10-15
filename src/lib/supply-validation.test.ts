import { describe, expect, it } from 'vitest';
import { supplyImportRowSchema, supplyInputSchema } from './supply-validation';

const today = new Date().toISOString().slice(0, 10);

describe('supply validation', () => {
  it('accepts a positive litre delivery and normalizes optional text', () => {
    const result = supplyInputSchema.safeParse({
      projectId: 'project-1',
      date: today,
      source: 'TANKER',
      enteredVolume: '12500',
      enteredUnit: 'L',
      supplier: '  Water Co  ',
      referenceNo: '',
      notes: '',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enteredVolume).toBe(12500);
      expect(result.data.supplier).toBe('Water Co');
      expect(result.data.referenceNo).toBeNull();
    }
  });

  it('rejects empty, zero, and negative volumes with field errors', () => {
    for (const enteredVolume of ['', '0', '-2']) {
      const result = supplyInputSchema.safeParse({
        projectId: 'project-1',
        date: today,
        source: 'TANKER',
        enteredVolume,
        enteredUnit: 'M3',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.path[0] === 'enteredVolume')).toBe(true);
      }
    }
  });

  it('rejects future delivery dates and unsupported units', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = supplyImportRowSchema.safeParse({
      date: tomorrow,
      source: 'TANKER',
      enteredVolume: '1',
      enteredUnit: 'GALLON',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'date')).toBe(true);
      expect(result.error.issues.some((issue) => issue.path[0] === 'enteredUnit')).toBe(true);
    }
  });
});
