import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ActivityType,
  Project,
  ProjectStatus,
  SupplySource,
  VolumeUnit,
  WaterSupply,
  ConsumptionRecord,
} from '@prisma/client';
import {
  previewVolume,
  computeConsumptionRecord,
  computeSupplyVolume,
  getWaterBalance,
  mapEngineErrorsToFormFields,
  FlowMeterInputSchema,
  PipeInputSchema,
  DirectInputSchema,
  SupplyVolumeSchema,
} from './water-service';

// ---------------------------------------------------------------------------
// Mock prisma for getWaterBalance tests
// ---------------------------------------------------------------------------
vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findUniqueOrThrow: vi.fn(),
    },
    waterSupply: {
      findMany: vi.fn(),
    },
    consumptionRecord: {
      findMany: vi.fn(),
    },
  },
}));

// Re-import the mock so we can configure it per-test
import prisma from '@/lib/prisma';
const mockPrisma = prisma as unknown as {
  project: { findUniqueOrThrow: ReturnType<typeof vi.fn> };
  waterSupply: { findMany: ReturnType<typeof vi.fn> };
  consumptionRecord: { findMany: ReturnType<typeof vi.fn> };
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_CONFIG = { assumedVelocityInPerSec: 47.24 };
const CUSTOM_VELOCITY = 60;

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    location: 'Site A',
    clientName: null,
    startDate: new Date('2026-01-01'),
    endDate: null,
    status: ProjectStatus.ACTIVE,
    unaccountedThresholdPercent: 15,
    assumedVelocityInPerSec: 47.24,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeSupply(overrides: Partial<WaterSupply> = {}): WaterSupply {
  return {
    id: 'supply-1',
    projectId: 'proj-1',
    date: new Date('2026-06-15'),
    source: SupplySource.TANKER,
    enteredVolume: 10,
    enteredUnit: VolumeUnit.M3,
    volumeM3: 10,
    supplier: null,
    referenceNo: null,
    notes: null,
    createdById: 'user-1',
    createdAt: new Date('2026-06-15'),
    updatedAt: new Date('2026-06-15'),
    ...overrides,
  };
}

function makeConsumption(
  overrides: Partial<ConsumptionRecord> & { activityType?: ActivityType } = {}
): ConsumptionRecord & { activityType: ActivityType } {
  return {
    id: 'cons-1',
    projectId: 'proj-1',
    date: new Date('2026-06-15'),
    activityTypeId: 'act-1',
    method: 'FLOW_METER',
    inputsJson: '{}',
    volumeM3: 3,
    usedAssumedVelocity: false,
    warningsJson: null,
    locationOrZone: null,
    notes: null,
    createdById: 'user-1',
    createdAt: new Date('2026-06-15'),
    updatedAt: new Date('2026-06-15'),
    activityType: { id: 'act-1', projectId: 'proj-1', name: 'Curing', color: '#0000FF', active: true },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. previewVolume
// ---------------------------------------------------------------------------

describe('previewVolume', () => {
  describe('flowMeter method', () => {
    it('returns valid result for correct inputs', () => {
      const result = previewVolume({
        method: 'flowMeter',
        inputs: { flowRate: 0.5, flowRateUnit: 'L/s', time: 120, timeUnit: 's' },
      });
      expect(result.valid).toBe(true);
      expect(result.method).toBe('flowMeter');
      expect(result.values).not.toBeNull();
      // 0.5 L/s = 0.0005 m3/s; 0.0005 * 120 = 0.06 m3
      expect(result.values!.volumeM3).toBeCloseTo(0.06, 6);
    });

    it('returns errors for missing flowRate', () => {
      const result = previewVolume({
        method: 'flowMeter',
        inputs: { time: 120 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns errors for negative flowRate', () => {
      const result = previewVolume({
        method: 'flowMeter',
        inputs: { flowRate: -1, time: 120 },
      });
      expect(result.valid).toBe(false);
    });

    it('returns errors for invalid flowRateUnit', () => {
      const result = previewVolume({
        method: 'flowMeter',
        inputs: { flowRate: 1, flowRateUnit: 'gallons/s', time: 120 },
      });
      expect(result.valid).toBe(false);
    });

    it('defaults flowRateUnit to m3/s and timeUnit to s', () => {
      const result = previewVolume({
        method: 'flowMeter',
        inputs: { flowRate: 0.001, time: 100 },
      });
      expect(result.valid).toBe(true);
      // 0.001 m3/s * 100 s = 0.1 m3
      expect(result.values!.volumeM3).toBeCloseTo(0.1, 6);
    });
  });

  describe('pipe method', () => {
    it('returns valid result with provided velocity', () => {
      const result = previewVolume(
        {
          method: 'pipe',
          inputs: { diameterInches: 2, velocityInPerSec: 47.24, timeSeconds: 60 },
        },
        PROJECT_CONFIG
      );
      expect(result.valid).toBe(true);
      expect(result.values).not.toBeNull();
      expect(result.values!.volumeM3).toBeGreaterThan(0);
      expect(result.values!.velocitySource).toBe('provided');
    });

    it('uses assumed velocity when velocityInPerSec is omitted', () => {
      const result = previewVolume(
        {
          method: 'pipe',
          inputs: { diameterInches: 2, timeSeconds: 60 },
        },
        PROJECT_CONFIG
      );
      expect(result.valid).toBe(true);
      expect(result.values!.velocitySource).toBe('assumed-default');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].code).toBe('ASSUMED_VELOCITY');
    });

    it('converts pipe runtime units through the calculation engine', () => {
      const withMinutes = previewVolume(
        { method: 'pipe', inputs: { diameterInches: 2, time: 2, timeUnit: 'min' } },
        PROJECT_CONFIG
      );
      const withSeconds = previewVolume(
        { method: 'pipe', inputs: { diameterInches: 2, timeSeconds: 120 } },
        PROJECT_CONFIG
      );

      expect(withMinutes.valid).toBe(true);
      expect(withMinutes.values!.timeSeconds).toBe(120);
      expect(withMinutes.values!.volumeM3).toBeCloseTo(withSeconds.values!.volumeM3 as number, 12);
    });

    it('reports unsupported pipe runtime units as a field error', () => {
      const result = previewVolume({
        method: 'pipe',
        inputs: { diameterInches: 2, time: 1, timeUnit: 'day' },
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((error) => error.field === 'timeUnit')).toBe(true);
    });

    it('uses custom assumed velocity from projectConfig', () => {
      const withDefault = previewVolume(
        { method: 'pipe', inputs: { diameterInches: 2, timeSeconds: 60 } },
        PROJECT_CONFIG
      );
      const withCustom = previewVolume(
        { method: 'pipe', inputs: { diameterInches: 2, timeSeconds: 60 } },
        { assumedVelocityInPerSec: CUSTOM_VELOCITY }
      );
      expect(withDefault.valid).toBe(true);
      expect(withCustom.valid).toBe(true);
      // Custom velocity is higher so volume should be larger
      expect(withCustom.values!.volumeM3).toBeGreaterThan(
        withDefault.values!.volumeM3 as number
      );
    });

    it('returns errors for zero diameter', () => {
      const result = previewVolume({
        method: 'pipe',
        inputs: { diameterInches: 0, timeSeconds: 60 },
      });
      expect(result.valid).toBe(false);
    });

    it('returns errors for missing diameterInches', () => {
      const result = previewVolume({
        method: 'pipe',
        inputs: { timeSeconds: 60 },
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('direct method', () => {
    it('converts litres to m3', () => {
      const result = previewVolume({
        method: 'direct',
        inputs: { volumeLitres: 5000 },
      });
      expect(result.valid).toBe(true);
      expect(result.values!.volumeM3).toBe(5);
    });

    it('accepts zero litres', () => {
      const result = previewVolume({
        method: 'direct',
        inputs: { volumeLitres: 0 },
      });
      expect(result.valid).toBe(true);
      expect(result.values!.volumeM3).toBe(0);
    });

    it('returns errors for negative litres', () => {
      const result = previewVolume({
        method: 'direct',
        inputs: { volumeLitres: -100 },
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('unknown method', () => {
    it('returns an error for an unsupported method', () => {
      const result = previewVolume({
        method: 'bucket' as 'flowMeter',
        inputs: {},
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_METHOD');
    });
  });
});

// ---------------------------------------------------------------------------
// 2. computeConsumptionRecord
// ---------------------------------------------------------------------------

describe('computeConsumptionRecord', () => {
  const project = { assumedVelocityInPerSec: 47.24 };

  it('returns correct volumeM3 for flowMeter method', () => {
    const result = computeConsumptionRecord(
      {
        method: 'flowMeter',
        inputs: { flowRate: 0.5, flowRateUnit: 'L/s', time: 120, timeUnit: 's' },
      },
      project
    );
    expect(result.volumeM3).toBeCloseTo(0.06, 6);
    expect(result.usedAssumedVelocity).toBe(false);
    expect(result.inputsJson).toContain('flowRate');
  });

  it('returns correct volumeM3 for direct method', () => {
    const result = computeConsumptionRecord(
      { method: 'direct', inputs: { volumeLitres: 2500 } },
      project
    );
    expect(result.volumeM3).toBe(2.5);
    expect(result.usedAssumedVelocity).toBe(false);
  });

  it('flags usedAssumedVelocity when pipe velocity is omitted', () => {
    const result = computeConsumptionRecord(
      { method: 'pipe', inputs: { diameterInches: 2, timeSeconds: 60 } },
      project
    );
    expect(result.usedAssumedVelocity).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].code).toBe('ASSUMED_VELOCITY');
  });

  it('does NOT flag usedAssumedVelocity when velocity is provided', () => {
    const result = computeConsumptionRecord(
      {
        method: 'pipe',
        inputs: {
          diameterInches: 2,
          velocityInPerSec: 30,
          timeSeconds: 60,
        },
      },
      project
    );
    expect(result.usedAssumedVelocity).toBe(false);
    expect(result.warnings.length).toBe(0);
  });

  it('uses the project assumedVelocityInPerSec as config', () => {
    const customProject = { assumedVelocityInPerSec: 80 };
    const result = computeConsumptionRecord(
      { method: 'pipe', inputs: { diameterInches: 2, timeSeconds: 60 } },
      customProject
    );
    // Verify it actually uses the project velocity by checking the result
    const defaultResult = computeConsumptionRecord(
      { method: 'pipe', inputs: { diameterInches: 2, timeSeconds: 60 } },
      project
    );
    expect(result.volumeM3).toBeGreaterThan(defaultResult.volumeM3);
  });

  it('throws for invalid inputs', () => {
    expect(() =>
      computeConsumptionRecord(
        { method: 'flowMeter', inputs: { flowRate: -1, time: 10 } },
        project
      )
    ).toThrow('Engine validation failed');
  });

  it('serializes inputs to JSON', () => {
    const result = computeConsumptionRecord(
      { method: 'direct', inputs: { volumeLitres: 100 } },
      project
    );
    const parsed = JSON.parse(result.inputsJson);
    expect(parsed.volumeLitres).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 3. computeSupplyVolume
// ---------------------------------------------------------------------------

describe('computeSupplyVolume', () => {
  it('returns volume as-is for m3', () => {
    expect(computeSupplyVolume({ volume: 10, unit: 'm3' })).toBe(10);
  });

  it('converts litres to m3', () => {
    expect(computeSupplyVolume({ volume: 5000, unit: 'L' })).toBe(5);
  });

  it('converts 1 litre to 0.001 m3', () => {
    expect(computeSupplyVolume({ volume: 1, unit: 'L' })).toBeCloseTo(
      0.001,
      6
    );
  });

  it('throws for zero volume', () => {
    expect(() => computeSupplyVolume({ volume: 0, unit: 'm3' })).toThrow();
  });

  it('throws for negative volume', () => {
    expect(() => computeSupplyVolume({ volume: -5, unit: 'm3' })).toThrow();
  });

  it('throws for invalid unit', () => {
    expect(() =>
      computeSupplyVolume({ volume: 10, unit: 'gallons' as 'm3' })
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. getWaterBalance
// ---------------------------------------------------------------------------

describe('getWaterBalance', () => {
  const from = new Date('2026-06-01');
  const to = new Date('2026-06-30');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns OK status when consumption is within threshold', async () => {
    mockPrisma.project.findUniqueOrThrow.mockResolvedValue(
      makeProject({ unaccountedThresholdPercent: 15 })
    );
    mockPrisma.waterSupply.findMany.mockResolvedValue([
      makeSupply({ volumeM3: 100 }),
    ]);
    mockPrisma.consumptionRecord.findMany.mockResolvedValue([
      makeConsumption({ volumeM3: 90 }),
    ]);

    const result = await getWaterBalance('proj-1', from, to);

    expect(result.status).toBe('OK');
    expect(result.suppliedM3).toBe(100);
    expect(result.consumedM3).toBe(90);
    expect(result.unaccountedM3).toBeCloseTo(10, 6);
    expect(result.unaccountedPercent).toBeCloseTo(10, 6);
  });

  it('returns ATTENTION when unaccounted % exceeds project threshold', async () => {
    mockPrisma.project.findUniqueOrThrow.mockResolvedValue(
      makeProject({ unaccountedThresholdPercent: 10 })
    );
    mockPrisma.waterSupply.findMany.mockResolvedValue([
      makeSupply({ volumeM3: 100 }),
    ]);
    // 80 consumed → 20% unaccounted > 10% threshold
    mockPrisma.consumptionRecord.findMany.mockResolvedValue([
      makeConsumption({ volumeM3: 80 }),
    ]);

    const result = await getWaterBalance('proj-1', from, to);

    expect(result.status).toBe('ATTENTION');
    expect(result.unaccountedPercent).toBeCloseTo(20, 6);
  });

  it('returns DATA_CHECK when consumption exceeds supply', async () => {
    mockPrisma.project.findUniqueOrThrow.mockResolvedValue(
      makeProject()
    );
    mockPrisma.waterSupply.findMany.mockResolvedValue([
      makeSupply({ volumeM3: 50 }),
    ]);
    mockPrisma.consumptionRecord.findMany.mockResolvedValue([
      makeConsumption({ volumeM3: 60 }),
    ]);

    const result = await getWaterBalance('proj-1', from, to);

    expect(result.status).toBe('DATA_CHECK');
    expect(result.consumedM3).toBe(60);
    expect(result.suppliedM3).toBe(50);
  });

  it('aggregates byActivity correctly', async () => {
    mockPrisma.project.findUniqueOrThrow.mockResolvedValue(
      makeProject()
    );
    mockPrisma.waterSupply.findMany.mockResolvedValue([
      makeSupply({ volumeM3: 100 }),
    ]);
    mockPrisma.consumptionRecord.findMany.mockResolvedValue([
      makeConsumption({
        id: 'c1',
        activityTypeId: 'act-1',
        volumeM3: 10,
        activityType: { id: 'act-1', projectId: 'proj-1', name: 'Curing', color: '#0000FF', active: true },
      }),
      makeConsumption({
        id: 'c2',
        activityTypeId: 'act-1',
        volumeM3: 15,
        activityType: { id: 'act-1', projectId: 'proj-1', name: 'Curing', color: '#0000FF', active: true },
      }),
      makeConsumption({
        id: 'c3',
        activityTypeId: 'act-2',
        volumeM3: 5,
        activityType: { id: 'act-2', projectId: 'proj-1', name: 'Washing', color: '#FF0000', active: true },
      }),
    ]);

    const result = await getWaterBalance('proj-1', from, to);

    expect(result.byActivity).toHaveLength(2);
    const curing = result.byActivity.find((a) => a.activityName === 'Curing');
    expect(curing!.volumeM3).toBe(25);
    const washing = result.byActivity.find(
      (a) => a.activityName === 'Washing'
    );
    expect(washing!.volumeM3).toBe(5);
  });

  it('aggregates byMethod correctly', async () => {
    mockPrisma.project.findUniqueOrThrow.mockResolvedValue(
      makeProject()
    );
    mockPrisma.waterSupply.findMany.mockResolvedValue([
      makeSupply({ volumeM3: 100 }),
    ]);
    mockPrisma.consumptionRecord.findMany.mockResolvedValue([
      makeConsumption({ id: 'c1', method: 'FLOW_METER', volumeM3: 20 }),
      makeConsumption({ id: 'c2', method: 'FLOW_METER', volumeM3: 10 }),
      makeConsumption({ id: 'c3', method: 'PIPE', volumeM3: 5 }),
    ]);

    const result = await getWaterBalance('proj-1', from, to);

    expect(result.byMethod).toHaveLength(2);
    const fm = result.byMethod.find((m) => m.method === 'FLOW_METER');
    expect(fm!.volumeM3).toBe(30);
    expect(fm!.count).toBe(2);
    const pipe = result.byMethod.find((m) => m.method === 'PIPE');
    expect(pipe!.volumeM3).toBe(5);
    expect(pipe!.count).toBe(1);
  });

  it('builds daily breakdown', async () => {
    mockPrisma.project.findUniqueOrThrow.mockResolvedValue(
      makeProject()
    );
    mockPrisma.waterSupply.findMany.mockResolvedValue([
      makeSupply({ date: new Date('2026-06-10'), volumeM3: 50 }),
      makeSupply({ date: new Date('2026-06-12'), volumeM3: 30 }),
    ]);
    mockPrisma.consumptionRecord.findMany.mockResolvedValue([
      makeConsumption({ date: new Date('2026-06-10'), volumeM3: 20 }),
      makeConsumption({ date: new Date('2026-06-11'), volumeM3: 15 }),
    ]);

    const result = await getWaterBalance('proj-1', from, to);

    expect(result.daily).toHaveLength(3);
    expect(result.daily[0].date).toBe('2026-06-10');
    expect(result.daily[0].suppliedM3).toBe(50);
    expect(result.daily[0].consumedM3).toBe(20);
    expect(result.daily[1].date).toBe('2026-06-11');
    expect(result.daily[1].suppliedM3).toBe(0);
    expect(result.daily[1].consumedM3).toBe(15);
    expect(result.daily[2].date).toBe('2026-06-12');
    expect(result.daily[2].suppliedM3).toBe(30);
    expect(result.daily[2].consumedM3).toBe(0);
  });

  it('handles empty records → OK status with zero volumes', async () => {
    mockPrisma.project.findUniqueOrThrow.mockResolvedValue(
      makeProject()
    );
    mockPrisma.waterSupply.findMany.mockResolvedValue([]);
    mockPrisma.consumptionRecord.findMany.mockResolvedValue([]);

    const result = await getWaterBalance('proj-1', from, to);

    expect(result.status).toBe('OK');
    expect(result.suppliedM3).toBe(0);
    expect(result.consumedM3).toBe(0);
    expect(result.unaccountedM3).toBe(0);
    expect(result.byActivity).toHaveLength(0);
    expect(result.byMethod).toHaveLength(0);
    expect(result.daily).toHaveLength(0);
  });

  it('returns OK when unaccounted % exactly equals threshold', async () => {
    mockPrisma.project.findUniqueOrThrow.mockResolvedValue(
      makeProject({ unaccountedThresholdPercent: 10 })
    );
    mockPrisma.waterSupply.findMany.mockResolvedValue([
      makeSupply({ volumeM3: 100 }),
    ]);
    // 90 consumed → 10% unaccounted = 10% threshold → not exceeding, so OK
    mockPrisma.consumptionRecord.findMany.mockResolvedValue([
      makeConsumption({ volumeM3: 90 }),
    ]);

    const result = await getWaterBalance('proj-1', from, to);

    expect(result.status).toBe('OK');
    expect(result.unaccountedPercent).toBeCloseTo(10, 6);
  });
});

// ---------------------------------------------------------------------------
// 5. Zod schemas
// ---------------------------------------------------------------------------

describe('Zod schemas', () => {
  describe('FlowMeterInputSchema', () => {
    it('accepts valid input', () => {
      const result = FlowMeterInputSchema.safeParse({
        flowRate: 1.5,
        flowRateUnit: 'L/s',
        time: 60,
        timeUnit: 'min',
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative flowRate', () => {
      const result = FlowMeterInputSchema.safeParse({
        flowRate: -1,
        time: 60,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid flowRateUnit', () => {
      const result = FlowMeterInputSchema.safeParse({
        flowRate: 1,
        flowRateUnit: 'gallons/min',
        time: 60,
      });
      expect(result.success).toBe(false);
    });

    it('defaults flowRateUnit and timeUnit', () => {
      const result = FlowMeterInputSchema.safeParse({
        flowRate: 1,
        time: 60,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.flowRateUnit).toBe('m3/s');
        expect(result.data.timeUnit).toBe('s');
      }
    });
  });

  describe('PipeInputSchema', () => {
    it('accepts valid input with velocity', () => {
      const result = PipeInputSchema.safeParse({
        diameterInches: 2,
        velocityInPerSec: 47.24,
        timeSeconds: 120,
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid input without velocity (optional)', () => {
      const result = PipeInputSchema.safeParse({
        diameterInches: 2,
        timeSeconds: 120,
      });
      expect(result.success).toBe(true);
    });

    it('rejects zero diameterInches', () => {
      const result = PipeInputSchema.safeParse({
        diameterInches: 0,
        timeSeconds: 120,
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative diameterInches', () => {
      const result = PipeInputSchema.safeParse({
        diameterInches: -1,
        timeSeconds: 120,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('DirectInputSchema', () => {
    it('accepts valid input', () => {
      const result = DirectInputSchema.safeParse({ volumeLitres: 500 });
      expect(result.success).toBe(true);
    });

    it('accepts zero litres', () => {
      const result = DirectInputSchema.safeParse({ volumeLitres: 0 });
      expect(result.success).toBe(true);
    });

    it('rejects negative litres', () => {
      const result = DirectInputSchema.safeParse({ volumeLitres: -100 });
      expect(result.success).toBe(false);
    });
  });

  describe('SupplyVolumeSchema', () => {
    it('accepts valid m3', () => {
      const result = SupplyVolumeSchema.safeParse({ volume: 10, unit: 'm3' });
      expect(result.success).toBe(true);
    });

    it('accepts valid L', () => {
      const result = SupplyVolumeSchema.safeParse({ volume: 1000, unit: 'L' });
      expect(result.success).toBe(true);
    });

    it('rejects invalid unit', () => {
      const result = SupplyVolumeSchema.safeParse({
        volume: 10,
        unit: 'gallons',
      });
      expect(result.success).toBe(false);
    });

    it('rejects zero volume', () => {
      const result = SupplyVolumeSchema.safeParse({ volume: 0, unit: 'm3' });
      expect(result.success).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Error mapping
// ---------------------------------------------------------------------------

describe('mapEngineErrorsToFormFields', () => {
  it('strips activities[N]. prefix from field names', () => {
    const errors = mapEngineErrorsToFormFields([
      { code: 'MISSING_INPUT', field: 'activities[0].flowRate', message: 'required' },
      { code: 'NEGATIVE_VALUE', field: 'activities[1].diameterInches', message: 'negative' },
    ]);
    expect(errors).toEqual([
      { field: 'flowRate', message: 'required', code: 'MISSING_INPUT' },
      { field: 'diameterInches', message: 'negative', code: 'NEGATIVE_VALUE' },
    ]);
  });

  it('leaves simple field names untouched', () => {
    const errors = mapEngineErrorsToFormFields([
      { code: 'INVALID_TYPE', field: 'volumeLitres', message: 'bad type' },
    ]);
    expect(errors[0].field).toBe('volumeLitres');
  });

  it('returns empty array for no errors', () => {
    expect(mapEngineErrorsToFormFields([])).toEqual([]);
  });
});
