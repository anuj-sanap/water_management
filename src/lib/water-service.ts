/**
 * water-service.ts
 *
 * The ONLY module that imports the calculation engine.
 * Every other module in the application must call through this service
 * to perform volume calculations, consumption records, supply conversion,
 * and water balance analysis.
 */

import { z } from 'zod';
import engine from '../../waterCalculations.js';
import prisma from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Engine result shape (from waterCalculations.js). */
export interface EngineError {
  code: string;
  field: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface EngineWarning {
  code: string;
  field: string;
  message: string;
}

export interface EngineResult {
  valid: boolean;
  method: string;
  values: Record<string, unknown> | null;
  units: Record<string, string>;
  errors: EngineError[];
  warnings: EngineWarning[];
  note?: string;
}

type CalculationMethod = 'flowMeter' | 'pipe' | 'direct';

export type WaterBalanceStatus = 'OK' | 'ATTENTION' | 'DATA_CHECK';

export interface WaterBalanceResult {
  suppliedM3: number;
  consumedM3: number;
  unaccountedM3: number;
  unaccountedPercent: number | null;
  status: WaterBalanceStatus;
  byActivity: Array<{
    activityTypeId: string;
    activityName: string;
    volumeM3: number;
  }>;
  byMethod: Array<{
    method: string;
    volumeM3: number;
    count: number;
  }>;
  daily: Array<{
    date: string;
    suppliedM3: number;
    consumedM3: number;
  }>;
}

export interface ConsumptionRecordResult {
  volumeM3: number;
  usedAssumedVelocity: boolean;
  warnings: EngineWarning[];
  inputsJson: string;
}

// ---------------------------------------------------------------------------
// Zod schemas — mirror the engine's validation rules
// ---------------------------------------------------------------------------

const positiveNumber = z.number().nonnegative();
const positiveNonZero = z.number().positive();

export const FlowMeterInputSchema = z.object({
  flowRate: positiveNumber,
  flowRateUnit: z.enum(['m3/s', 'L/s', 'L/min', 'm3/h', 'L/h']).optional().default('m3/s'),
  time: positiveNumber,
  timeUnit: z.enum(['s', 'min', 'h']).optional().default('s'),
});

export const PipeInputSchema = z.object({
  diameterInches: positiveNonZero,
  velocityInPerSec: z.number().nonnegative().optional(),
  timeSeconds: positiveNumber,
});

export const DirectInputSchema = z.object({
  volumeLitres: positiveNumber,
});

export const PreviewRequestSchema = z.object({
  method: z.enum(['flowMeter', 'pipe', 'direct']),
  inputs: z.record(z.string(), z.unknown()),
});

export const SupplyVolumeSchema = z.object({
  volume: positiveNonZero,
  unit: z.enum(['m3', 'L']),
});

/** Map from method name to the corresponding Zod schema. */
const METHOD_SCHEMAS: Record<CalculationMethod, z.ZodType> = {
  flowMeter: FlowMeterInputSchema,
  pipe: PipeInputSchema,
  direct: DirectInputSchema,
};

// ---------------------------------------------------------------------------
// Error mapping: engine errors -> form field errors
// ---------------------------------------------------------------------------

export interface FormFieldError {
  field: string;
  message: string;
  code: string;
}

/**
 * Map engine errors (code, field, message) back to form-level field errors.
 * Strips prefixes like "activities[0]." so the errors reference the flat form
 * field names the UI controls expect.
 */
export function mapEngineErrorsToFormFields(
  errors: EngineError[]
): FormFieldError[] {
  return errors.map((e) => {
    // Strip "activities[N]." prefix if present
    const field = e.field.replace(/^activities\[\d+\]\./, '');
    return { field, message: e.message, code: e.code };
  });
}

// ---------------------------------------------------------------------------
// 1. previewVolume — used by forms for live preview
// ---------------------------------------------------------------------------

export interface PreviewInput {
  method: CalculationMethod;
  inputs: Record<string, unknown>;
}

export interface ProjectConfig {
  assumedVelocityInPerSec?: number;
}

/**
 * Preview volume calculation. Validates inputs with the Zod schema for the
 * selected method, then delegates to the engine. Returns the full engine
 * result so the form can display computed values and/or errors.
 */
export function previewVolume(
  { method, inputs }: PreviewInput,
  projectConfig?: ProjectConfig
): EngineResult {
  // Validate with Zod first
  const schema = METHOD_SCHEMAS[method];
  if (!schema) {
    return {
      valid: false,
      method: 'unknown',
      values: null,
      units: {},
      errors: [
        {
          code: 'INVALID_METHOD',
          field: 'method',
          message: `Method "${method}" is not supported. Use one of: flowMeter, pipe, direct.`,
        },
      ],
      warnings: [],
    };
  }

  let calculationInputs = inputs;
  if (method === 'pipe' && ('time' in inputs || 'timeUnit' in inputs)) {
    const timeInput = FlowMeterInputSchema.safeParse({
      flowRate: 0,
      flowRateUnit: 'm3/s',
      time: inputs.time,
      timeUnit: inputs.timeUnit,
    });
    if (!timeInput.success) {
      return {
        valid: false,
        method,
        values: null,
        units: {},
        errors: timeInput.error.issues.map((issue: z.core.$ZodIssue) => ({
          code: 'VALIDATION_ERROR',
          field: issue.path.join('.') || 'time',
          message: issue.message,
        })),
        warnings: [],
      };
    }

    const timeResult = engine.calculateActivityVolume({
      method: 'flowMeter',
      inputs: timeInput.data,
    }) as EngineResult;
    if (!timeResult.valid || typeof timeResult.values?.timeSeconds !== 'number') {
      return timeResult;
    }
    calculationInputs = { ...inputs, timeSeconds: timeResult.values.timeSeconds };
    delete calculationInputs.time;
    delete calculationInputs.timeUnit;
  }

  const parsed = schema.safeParse(calculationInputs);
  if (!parsed.success) {
    const formErrors: EngineError[] = parsed.error.issues.map(
      (issue: z.core.$ZodIssue) => ({
        code: 'VALIDATION_ERROR',
        field: issue.path.join('.') || 'inputs',
        message: issue.message,
      })
    );
    return {
      valid: false,
      method,
      values: null,
      units: {},
      errors: formErrors,
      warnings: [],
    };
  }

  // Delegate to the engine
  const config = projectConfig?.assumedVelocityInPerSec
    ? { assumedVelocityInPerSec: projectConfig.assumedVelocityInPerSec }
    : undefined;

  return engine.calculateActivityVolume(
    { method, inputs: parsed.data as Record<string, unknown> },
    config
  ) as EngineResult;
}

// ---------------------------------------------------------------------------
// 2. computeConsumptionRecord — used when saving a consumption record
// ---------------------------------------------------------------------------

export interface ConsumptionInput {
  method: CalculationMethod;
  inputs: Record<string, unknown>;
}

export interface ProjectForConsumption {
  assumedVelocityInPerSec: number;
}

/**
 * Compute the volume for a new consumption record. Validates the inputs,
 * delegates to the engine with the project's assumed velocity, and returns
 * the fields needed to persist a ConsumptionRecord row.
 *
 * Throws if the engine reports validation errors (the form should have
 * caught them earlier via previewVolume).
 */
export function computeConsumptionRecord(
  input: ConsumptionInput,
  project: ProjectForConsumption
): ConsumptionRecordResult {
  const result = previewVolume(input, {
    assumedVelocityInPerSec: project.assumedVelocityInPerSec,
  });

  if (!result.valid) {
    const msgs = result.errors.map((e) => e.message).join('; ');
    throw new Error(`Engine validation failed: ${msgs}`);
  }

  const usedAssumedVelocity =
    input.method === 'pipe' &&
    result.values?.velocitySource === 'assumed-default';

  return {
    volumeM3: result.values!.volumeM3 as number,
    usedAssumedVelocity,
    warnings: result.warnings,
    inputsJson: JSON.stringify(input.inputs),
  };
}

// ---------------------------------------------------------------------------
// 3. computeSupplyVolume — validates and converts supply input to m3
// ---------------------------------------------------------------------------

/**
 * Validate and convert a supply volume to m3 using the engine's constants
 * and validation rules.
 */
export function computeSupplyVolume(input: {
  volume: number;
  unit: 'm3' | 'L';
}): number {
  const parsed = SupplyVolumeSchema.safeParse(input);
  if (!parsed.success) {
    const msgs = parsed.error.issues
      .map((i: z.core.$ZodIssue) => i.message)
      .join('; ');
    throw new Error(`Supply volume validation failed: ${msgs}`);
  }

  if (parsed.data.unit === 'm3') {
    return parsed.data.volume;
  }
  // L -> m3 using the engine's conversion
  return engine.litresToCubicMetres(parsed.data.volume);
}

export function computeSupplyVolumePreview(input: {
  volume: number;
  unit: 'm3' | 'L';
}): { volumeM3: number; volumeL: number } {
  const volumeM3 = computeSupplyVolume(input);
  return {
    volumeM3,
    volumeL: engine.cubicMetresToLitres(volumeM3),
  };
}

export function cubicMetresToLitres(value: number): number {
  return engine.cubicMetresToLitres(value);
}

// ---------------------------------------------------------------------------
// 4. getWaterBalance — aggregates DB data for a project period
// ---------------------------------------------------------------------------

/**
 * Compute a full water balance for a project over a date range.
 * Queries supply and consumption records from the database, aggregates by
 * activity type, method, and day, then determines the unaccounted-water
 * status using the engine's calculateUnaccountedWater.
 *
 * Status rules:
 *   DATA_CHECK  — consumed > supplied (data quality problem)
 *   ATTENTION   — unaccounted % exceeds the project threshold
 *   OK          — everything within tolerance
 *
 * Never uses the words "wastage" or "loss".
 */
export async function getWaterBalance(
  projectId: string,
  from: Date,
  to: Date
): Promise<WaterBalanceResult> {
  // 1. Fetch the project to get the threshold
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  });

  // 2. Query supplies in range
  const supplies = await prisma.waterSupply.findMany({
    where: {
      projectId,
      date: { gte: from, lte: to },
    },
    orderBy: { date: 'asc' },
  });

  // 3. Query consumption records in range with activity type
  const consumptionRecords = await prisma.consumptionRecord.findMany({
    where: {
      projectId,
      date: { gte: from, lte: to },
    },
    include: { activityType: true },
    orderBy: { date: 'asc' },
  });

  // 4. Aggregate totals
  const suppliedM3 = supplies.reduce((sum, s) => sum + s.volumeM3, 0);
  const consumedM3 = consumptionRecords.reduce(
    (sum, r) => sum + r.volumeM3,
    0
  );

  // 5. Use the engine to compute unaccounted water
  const unaccountedResult = engine.calculateUnaccountedWater({
    suppliedVolume: suppliedM3,
    suppliedUnit: 'm3',
    consumedVolume: consumedM3,
    consumedUnit: 'm3',
  }) as EngineResult;

  // 6. Determine status
  let status: WaterBalanceStatus = 'OK';
  let unaccountedM3 = 0;
  let unaccountedPercent: number | null = null;

  if (!unaccountedResult.valid) {
    // CONSUMPTION_EXCEEDS_SUPPLY → DATA_CHECK
    status = 'DATA_CHECK';
    unaccountedM3 = consumedM3 - suppliedM3;
    unaccountedPercent = suppliedM3 > 0 ? (unaccountedM3 / suppliedM3) * 100 : null;
  } else {
    unaccountedM3 = unaccountedResult.values!.unaccountedM3 as number;
    unaccountedPercent = unaccountedResult.values!
      .unaccountedPercent as number | null;

    if (
      unaccountedPercent !== null &&
      unaccountedPercent > project.unaccountedThresholdPercent
    ) {
      status = 'ATTENTION';
    }
  }

  // 7. Breakdown by activity type
  const activityMap = new Map<
    string,
    { activityTypeId: string; activityName: string; volumeM3: number }
  >();
  for (const r of consumptionRecords) {
    const key = r.activityTypeId;
    const existing = activityMap.get(key);
    if (existing) {
      existing.volumeM3 += r.volumeM3;
    } else {
      activityMap.set(key, {
        activityTypeId: r.activityTypeId,
        activityName: r.activityType.name,
        volumeM3: r.volumeM3,
      });
    }
  }

  // 8. Breakdown by method
  const methodMap = new Map<
    string,
    { method: string; volumeM3: number; count: number }
  >();
  for (const r of consumptionRecords) {
    const key = r.method;
    const existing = methodMap.get(key);
    if (existing) {
      existing.volumeM3 += r.volumeM3;
      existing.count += 1;
    } else {
      methodMap.set(key, { method: r.method, volumeM3: r.volumeM3, count: 1 });
    }
  }

  // 9. Daily breakdown
  const dailyMap = new Map<
    string,
    { date: string; suppliedM3: number; consumedM3: number }
  >();

  for (const s of supplies) {
    const dateKey = s.date.toISOString().slice(0, 10);
    const existing = dailyMap.get(dateKey);
    if (existing) {
      existing.suppliedM3 += s.volumeM3;
    } else {
      dailyMap.set(dateKey, {
        date: dateKey,
        suppliedM3: s.volumeM3,
        consumedM3: 0,
      });
    }
  }

  for (const r of consumptionRecords) {
    const dateKey = r.date.toISOString().slice(0, 10);
    const existing = dailyMap.get(dateKey);
    if (existing) {
      existing.consumedM3 += r.volumeM3;
    } else {
      dailyMap.set(dateKey, {
        date: dateKey,
        suppliedM3: 0,
        consumedM3: r.volumeM3,
      });
    }
  }

  // Sort daily entries by date
  const daily = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return {
    suppliedM3,
    consumedM3,
    unaccountedM3,
    unaccountedPercent,
    status,
    byActivity: Array.from(activityMap.values()),
    byMethod: Array.from(methodMap.values()),
    daily,
  };
}

/**
 * Returns raw calculation constants, conversion tables, and notices
 * directly from the engine so calculation documentation never drifts.
 */
export function getCalculationEngineDocumentation() {
  return {
    metresPerInch: engine.METRES_PER_INCH as number,
    litresPerCubicMetre: engine.LITRES_PER_CUBIC_METRE as number,
    volumeToleranceM3: engine.VOLUME_TOLERANCE_M3 as number,
    defaultAssumedVelocityInPerSec: engine.DEFAULT_CONFIG.assumedVelocityInPerSec as number,
    defaultAssumedVelocityMPerSec: Number(
      ((engine.DEFAULT_CONFIG.assumedVelocityInPerSec as number) * (engine.METRES_PER_INCH as number)).toFixed(4)
    ),
    unaccountedNote: engine.UNACCOUNTED_NOTE as string,
    timeUnits: engine.TIME_UNIT_TO_SECONDS as Record<string, number>,
    flowUnits: engine.FLOW_UNIT_TO_M3_PER_S as Record<string, number>,
    volumeUnits: engine.VOLUME_UNIT_TO_M3 as Record<string, number>,
  };
}

