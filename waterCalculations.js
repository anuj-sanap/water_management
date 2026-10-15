'use strict';

/**
 * waterCalculations.js
 * Water Calculation Engine for a Construction Site Water Management System.
 *
 * Plain JavaScript, no dependencies. Works in Node (CommonJS) and in browsers
 * (exposes a global `WaterCalculations`).
 *
 * INTERNAL UNITS (SI): metres (m), seconds (s), square metres (m2),
 * cubic metres (m3), cubic metres per second (m3/s). Litres (L) are
 * reported alongside m3 for convenience.
 *
 * Every public calculator returns the same structure:
 *   {
 *     valid:    boolean,
 *     method:   string,
 *     values:   { ... } | null,   // null when valid === false
 *     units:    { ... },          // unit of each value
 *     errors:   [{ code, field, message, details? }],
 *     warnings: [{ code, field, message }]
 *   }
 * Functions never throw for bad user input; they return errors instead.
 */

// ---------------------------------------------------------------------------
// Constants and unit conversion tables
// ---------------------------------------------------------------------------

/** 1 inch = 0.0254 m exactly (international inch, by definition). */
const METRES_PER_INCH = 0.0254;

/** 1 m3 = 1000 L exactly. */
const LITRES_PER_CUBIC_METRE = 1000;

/**
 * Differences smaller than this (1 mL, in m3) are treated as floating-point
 * noise when comparing consumption with supply.
 */
const VOLUME_TOLERANCE_M3 = 1e-9;

/**
 * Default configuration. 47.24 in/s is an ASSUMED design velocity
 * (47.24 in/s x 0.0254 = 1.1999 m/s, roughly 1.2 m/s). It is NOT a measured
 * value and is only used when the caller supplies no velocity.
 */
const DEFAULT_CONFIG = Object.freeze({
  assumedVelocityInPerSec: 47.24,
});

/** Multiply a time in the given unit by this to get seconds. */
const TIME_UNIT_TO_SECONDS = Object.freeze({
  s: 1,
  min: 60,
  h: 3600,
});

/** Multiply a flow rate in the given unit by this to get m3/s. */
const FLOW_UNIT_TO_M3_PER_S = Object.freeze({
  'm3/s': 1,
  'L/s': 1 / LITRES_PER_CUBIC_METRE,
  'L/min': 1 / LITRES_PER_CUBIC_METRE / 60,
  'm3/h': 1 / 3600,
  'L/h': 1 / LITRES_PER_CUBIC_METRE / 3600,
});

/** Multiply a volume in the given unit by this to get m3. */
const VOLUME_UNIT_TO_M3 = Object.freeze({
  m3: 1,
  L: 1 / LITRES_PER_CUBIC_METRE,
});

const UNACCOUNTED_NOTE =
  'Unaccounted water is only the difference between supplied water and recorded ' +
  'consumption. It may include leakage, unmetered or unrecorded use, meter error, ' +
  'storage changes, evaporation or recording gaps. It is not, by itself, evidence of wastage.';

// ---------------------------------------------------------------------------
// Pure conversion helpers (no validation: callers validate first)
// ---------------------------------------------------------------------------

/** inches -> metres:  m = in x 0.0254 */
function inchesToMetres(inches) {
  return inches * METRES_PER_INCH;
}

/** inches/second -> metres/second:  m/s = (in/s) x 0.0254 */
function inchesPerSecondToMetresPerSecond(inPerSec) {
  return inPerSec * METRES_PER_INCH;
}

/** litres -> cubic metres:  m3 = L / 1000 */
function litresToCubicMetres(litres) {
  return litres / LITRES_PER_CUBIC_METRE;
}

/** cubic metres -> litres:  L = m3 x 1000 */
function cubicMetresToLitres(cubicMetres) {
  return cubicMetres * LITRES_PER_CUBIC_METRE;
}

/** Round for display only. The engine itself never rounds internally. */
function roundTo(value, decimals) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const f = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * f) / f;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function makeError(code, field, message, details) {
  const err = { code, field, message };
  if (details !== undefined) err.details = details;
  return err;
}

function makeWarning(code, field, message) {
  return { code, field, message };
}

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

function describeValue(value) {
  return typeof value === 'number' ? String(value) : typeof value;
}

/**
 * Validate a numeric input. Returns an array with 0 or 1 error.
 * Strings are NOT coerced ("5" is rejected) so that bad data is never
 * silently accepted.
 */
function checkNumber(value, field, options) {
  const allowZero = !options || options.allowZero !== false;
  if (isMissing(value)) {
    return [makeError('MISSING_INPUT', field, `${field} is required but was not provided.`)];
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return [
      makeError(
        'INVALID_TYPE',
        field,
        `${field} must be a finite number (received ${describeValue(value)}).`
      ),
    ];
  }
  if (value < 0) {
    return [makeError('NEGATIVE_VALUE', field, `${field} must not be negative (received ${value}).`)];
  }
  if (value === 0 && !allowZero) {
    return [makeError('ZERO_NOT_ALLOWED', field, `${field} must be greater than zero.`)];
  }
  return [];
}

/** Validate a unit string against a table. Returns an array with 0 or 1 error. */
function checkUnit(unit, table, field) {
  if (typeof unit === 'string' && Object.prototype.hasOwnProperty.call(table, unit)) {
    return [];
  }
  return [
    makeError(
      'INVALID_UNIT',
      field,
      `${field} "${String(unit)}" is not supported. Use one of: ${Object.keys(table).join(', ')}.`
    ),
  ];
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildResult(method, errors, warnings, values, units) {
  const valid = errors.length === 0;
  return {
    valid,
    method,
    values: valid ? values : null,
    units,
    errors,
    warnings,
  };
}

function invalidInputResult(method, units, what) {
  return buildResult(
    method,
    [makeError('INVALID_INPUT', 'inputs', `${what} must be an object.`)],
    [],
    null,
    units
  );
}

// ---------------------------------------------------------------------------
// Method 1: Flow meter     Volume = Flow rate x Time
// ---------------------------------------------------------------------------

const FLOW_METER_UNITS = Object.freeze({
  flowRateM3PerS: 'm3/s',
  timeSeconds: 's',
  volumeM3: 'm3',
  volumeLitres: 'L',
});

/**
 * Flow meter method.
 *   Q (m3/s) = flowRate x unitFactor            (convert to SI)
 *   t (s)    = time x timeFactor                (convert to SI)
 *   V (m3)   = Q x t
 *   V (L)    = V (m3) x 1000
 *
 * @param {object} inputs
 * @param {number} inputs.flowRate        >= 0
 * @param {string} [inputs.flowRateUnit]  'm3/s' (default) | 'L/s' | 'L/min' | 'm3/h' | 'L/h'
 * @param {number} inputs.time            >= 0
 * @param {string} [inputs.timeUnit]      's' (default) | 'min' | 'h'
 */
function calculateFlowMeterVolume(inputs) {
  const method = 'flowMeter';
  if (!isPlainObject(inputs)) return invalidInputResult(method, FLOW_METER_UNITS, 'inputs');

  const flowRateUnit = isMissing(inputs.flowRateUnit) ? 'm3/s' : inputs.flowRateUnit;
  const timeUnit = isMissing(inputs.timeUnit) ? 's' : inputs.timeUnit;

  const errors = [
    ...checkNumber(inputs.flowRate, 'flowRate'),
    ...checkNumber(inputs.time, 'time'),
    ...checkUnit(flowRateUnit, FLOW_UNIT_TO_M3_PER_S, 'flowRateUnit'),
    ...checkUnit(timeUnit, TIME_UNIT_TO_SECONDS, 'timeUnit'),
  ];
  if (errors.length > 0) return buildResult(method, errors, [], null, FLOW_METER_UNITS);

  const flowRateM3PerS = inputs.flowRate * FLOW_UNIT_TO_M3_PER_S[flowRateUnit];
  const timeSeconds = inputs.time * TIME_UNIT_TO_SECONDS[timeUnit];
  const volumeM3 = flowRateM3PerS * timeSeconds;

  return buildResult(
    method,
    [],
    [],
    {
      flowRateM3PerS,
      timeSeconds,
      volumeM3,
      volumeLitres: cubicMetresToLitres(volumeM3),
    },
    FLOW_METER_UNITS
  );
}

// ---------------------------------------------------------------------------
// Method 2: Pipe calculation     V = (pi d^2 / 4) x v x t
// ---------------------------------------------------------------------------

const PIPE_UNITS = Object.freeze({
  diameterM: 'm',
  velocityMPerS: 'm/s',
  velocityInPerS: 'in/s',
  areaM2: 'm2',
  flowRateM3PerS: 'm3/s',
  flowRateLitresPerS: 'L/s',
  timeSeconds: 's',
  volumeM3: 'm3',
  volumeLitres: 'L',
});

/**
 * Pipe calculation method.
 *   d (m)    = diameterInches x 0.0254
 *   v (m/s)  = velocityInPerSec x 0.0254
 *   A (m2)   = pi x d^2 / 4                (circular cross-section, full pipe)
 *   Q (m3/s) = A x v
 *   V (m3)   = Q x t
 *   V (L)    = V (m3) x 1000
 *
 * Velocity is optional. If it is omitted (undefined/null), the configurable
 * ASSUMED default (config.assumedVelocityInPerSec, 47.24 in/s) is used and a
 * warning is returned. An explicit 0 is a real input (no flow), not "missing".
 * The formula assumes the pipe is flowing full.
 *
 * @param {object} inputs
 * @param {number} inputs.diameterInches     > 0
 * @param {number} [inputs.velocityInPerSec] >= 0 (defaults to config value)
 * @param {number} inputs.timeSeconds        >= 0
 * @param {object} [config]                  { assumedVelocityInPerSec }
 */
function calculatePipeVolume(inputs, config) {
  const method = 'pipe';
  if (!isPlainObject(inputs)) return invalidInputResult(method, PIPE_UNITS, 'inputs');

  const cfg = Object.assign({}, DEFAULT_CONFIG, config || {});
  const warnings = [];
  const errors = [
    ...checkNumber(inputs.diameterInches, 'diameterInches', { allowZero: false }),
    ...checkNumber(inputs.timeSeconds, 'timeSeconds'),
  ];

  const velocityProvided = !isMissing(inputs.velocityInPerSec);
  let velocityInPerS;
  if (velocityProvided) {
    velocityInPerS = inputs.velocityInPerSec;
    errors.push(...checkNumber(velocityInPerS, 'velocityInPerSec'));
  } else {
    velocityInPerS = cfg.assumedVelocityInPerSec;
    errors.push(...checkNumber(velocityInPerS, 'config.assumedVelocityInPerSec'));
    warnings.push(
      makeWarning(
        'ASSUMED_VELOCITY',
        'velocityInPerSec',
        `No velocity supplied; used the configurable assumed default of ${velocityInPerS} in/s. ` +
          'This is an assumption, not a measured value.'
      )
    );
  }

  if (errors.length > 0) return buildResult(method, errors, [], null, PIPE_UNITS);

  const diameterM = inchesToMetres(inputs.diameterInches);
  const velocityMPerS = inchesPerSecondToMetresPerSecond(velocityInPerS);
  const areaM2 = (Math.PI * diameterM * diameterM) / 4;
  const flowRateM3PerS = areaM2 * velocityMPerS;
  const volumeM3 = flowRateM3PerS * inputs.timeSeconds;

  return buildResult(
    method,
    [],
    warnings,
    {
      diameterM,
      velocityMPerS,
      velocityInPerS,
      velocitySource: velocityProvided ? 'provided' : 'assumed-default',
      areaM2,
      flowRateM3PerS,
      flowRateLitresPerS: cubicMetresToLitres(flowRateM3PerS),
      timeSeconds: inputs.timeSeconds,
      volumeM3,
      volumeLitres: cubicMetresToLitres(volumeM3),
    },
    PIPE_UNITS
  );
}

// ---------------------------------------------------------------------------
// Method 3: Direct input     m3 = L / 1000
// ---------------------------------------------------------------------------

const DIRECT_UNITS = Object.freeze({
  volumeLitres: 'L',
  volumeM3: 'm3',
});

/**
 * Direct input method.
 *   V (m3) = V (L) / 1000
 *
 * @param {object} inputs
 * @param {number} inputs.volumeLitres  >= 0
 */
function calculateDirectVolume(inputs) {
  const method = 'direct';
  if (!isPlainObject(inputs)) return invalidInputResult(method, DIRECT_UNITS, 'inputs');

  const errors = checkNumber(inputs.volumeLitres, 'volumeLitres');
  if (errors.length > 0) return buildResult(method, errors, [], null, DIRECT_UNITS);

  return buildResult(
    method,
    [],
    [],
    {
      volumeLitres: inputs.volumeLitres,
      volumeM3: litresToCubicMetres(inputs.volumeLitres),
    },
    DIRECT_UNITS
  );
}

// ---------------------------------------------------------------------------
// Activity dispatch and total consumption
// ---------------------------------------------------------------------------

const METHODS = Object.freeze({
  flowMeter: calculateFlowMeterVolume,
  pipe: calculatePipeVolume,
  direct: calculateDirectVolume,
});

/**
 * Calculate the volume for one activity.
 * @param {{name?: string, method: 'flowMeter'|'pipe'|'direct', inputs: object}} activity
 * @param {object} [config]  passed to the pipe method
 */
function calculateActivityVolume(activity, config) {
  if (!isPlainObject(activity)) {
    return buildResult(
      'activity',
      [makeError('INVALID_ACTIVITY', 'activity', 'activity must be an object.')],
      [],
      null,
      {}
    );
  }
  if (isMissing(activity.method)) {
    return buildResult(
      'activity',
      [makeError('MISSING_INPUT', 'method', 'method is required (flowMeter, pipe or direct).')],
      [],
      null,
      {}
    );
  }
  if (!Object.prototype.hasOwnProperty.call(METHODS, activity.method)) {
    return buildResult(
      'activity',
      [
        makeError(
          'INVALID_METHOD',
          'method',
          `method "${String(activity.method)}" is not supported. Use one of: ${Object.keys(METHODS).join(', ')}.`
        ),
      ],
      [],
      null,
      {}
    );
  }
  return METHODS[activity.method](activity.inputs, config);
}

const TOTAL_UNITS = Object.freeze({ totalM3: 'm3', totalLitres: 'L', activityCount: 'count' });

/**
 * Total consumption across all activities.
 *   Total (m3) = sum of each activity's volume (m3)
 *
 * If ANY activity is invalid, no total is returned (values = null), because a
 * partial total would silently understate consumption. All errors are
 * reported, each tagged with the activity index and name.
 *
 * @param {Array} activities  array of { name?, method, inputs }
 * @param {object} [config]
 */
function calculateTotalConsumption(activities, config) {
  const method = 'totalConsumption';
  if (!Array.isArray(activities)) {
    return buildResult(
      method,
      [makeError('INVALID_INPUT', 'activities', 'activities must be an array.')],
      [],
      null,
      TOTAL_UNITS
    );
  }

  const errors = [];
  const warnings = [];
  const breakdown = [];
  let totalM3 = 0;

  activities.forEach((activity, index) => {
    const label = `activities[${index}]`;
    const name = isPlainObject(activity) && activity.name ? String(activity.name) : `Activity ${index + 1}`;
    const res = calculateActivityVolume(activity, config);

    res.errors.forEach((e) => {
      errors.push(
        makeError(e.code, `${label}.${e.field}`, `${name}: ${e.message}`, e.details)
      );
    });
    res.warnings.forEach((w) => {
      warnings.push(makeWarning(w.code, `${label}.${w.field}`, `${name}: ${w.message}`));
    });

    if (res.valid) {
      totalM3 += res.values.volumeM3;
      breakdown.push({ name, method: res.method, volumeM3: res.values.volumeM3 });
    }
  });

  if (activities.length === 0) {
    warnings.push(makeWarning('NO_ACTIVITIES', 'activities', 'No activities supplied; total consumption is 0.'));
  }

  return buildResult(
    method,
    errors,
    warnings,
    {
      totalM3,
      totalLitres: cubicMetresToLitres(totalM3),
      activityCount: activities.length,
      breakdown,
    },
    TOTAL_UNITS
  );
}

// ---------------------------------------------------------------------------
// Unaccounted water
// ---------------------------------------------------------------------------

const UNACCOUNTED_UNITS = Object.freeze({
  suppliedM3: 'm3',
  consumedM3: 'm3',
  unaccountedM3: 'm3',
  unaccountedLitres: 'L',
  unaccountedPercent: '%',
});

/**
 * Unaccounted water.
 *   Unaccounted (m3) = Supplied (m3) - Recorded consumption (m3)
 *   Unaccounted (%)  = Unaccounted / Supplied x 100
 *
 * Validation: both volumes must be >= 0; consumption may not exceed supply
 * (that signals a data/meter problem, so an error is returned together with the
 * shortfall in error.details.shortfallM3); percentage is null (with a warning)
 * when supplied = 0 because it would be a division by zero.
 *
 * @param {object} inputs
 * @param {number} inputs.suppliedVolume
 * @param {string} [inputs.suppliedUnit]   'm3' (default) | 'L'
 * @param {number} inputs.consumedVolume
 * @param {string} [inputs.consumedUnit]   'm3' (default) | 'L'
 */
function calculateUnaccountedWater(inputs) {
  const method = 'unaccountedWater';
  if (!isPlainObject(inputs)) return invalidInputResult(method, UNACCOUNTED_UNITS, 'inputs');

  const suppliedUnit = isMissing(inputs.suppliedUnit) ? 'm3' : inputs.suppliedUnit;
  const consumedUnit = isMissing(inputs.consumedUnit) ? 'm3' : inputs.consumedUnit;

  const errors = [
    ...checkNumber(inputs.suppliedVolume, 'suppliedVolume'),
    ...checkNumber(inputs.consumedVolume, 'consumedVolume'),
    ...checkUnit(suppliedUnit, VOLUME_UNIT_TO_M3, 'suppliedUnit'),
    ...checkUnit(consumedUnit, VOLUME_UNIT_TO_M3, 'consumedUnit'),
  ];
  if (errors.length > 0) return buildResult(method, errors, [], null, UNACCOUNTED_UNITS);

  const suppliedM3 = inputs.suppliedVolume * VOLUME_UNIT_TO_M3[suppliedUnit];
  const consumedM3 = inputs.consumedVolume * VOLUME_UNIT_TO_M3[consumedUnit];
  const difference = suppliedM3 - consumedM3;

  if (difference < -VOLUME_TOLERANCE_M3) {
    const shortfallM3 = -difference;
    const result = buildResult(
      method,
      [
        makeError(
          'CONSUMPTION_EXCEEDS_SUPPLY',
          'consumedVolume',
          `Recorded consumption (${consumedM3} m3) exceeds supplied water (${suppliedM3} m3) by ` +
            `${shortfallM3} m3. Check supply records, meter readings or units; storage or ` +
            'other unrecorded sources may also explain this.',
          { suppliedM3, consumedM3, shortfallM3 }
        ),
      ],
      [],
      null,
      UNACCOUNTED_UNITS
    );
    result.note = UNACCOUNTED_NOTE;
    return result;
  }

  const warnings = [];
  const unaccountedM3 = difference < 0 ? 0 : difference; // clamp float noise only
  let unaccountedPercent = null;
  if (suppliedM3 > 0) {
    unaccountedPercent = (unaccountedM3 / suppliedM3) * 100;
  } else {
    warnings.push(
      makeWarning(
        'PERCENTAGE_UNDEFINED',
        'unaccountedPercent',
        'Supplied water is 0, so the unaccounted percentage is undefined (null).'
      )
    );
  }

  const result = buildResult(
    method,
    [],
    warnings,
    {
      suppliedM3,
      consumedM3,
      unaccountedM3,
      unaccountedLitres: cubicMetresToLitres(unaccountedM3),
      unaccountedPercent,
    },
    UNACCOUNTED_UNITS
  );
  result.note = UNACCOUNTED_NOTE;
  return result;
}

// ---------------------------------------------------------------------------
// Full water balance: activities -> total -> unaccounted
// ---------------------------------------------------------------------------

/**
 * Convenience wrapper: totals all activities and compares with supply.
 *
 * @param {object} inputs
 * @param {number} inputs.suppliedVolume
 * @param {string} [inputs.suppliedUnit]  'm3' (default) | 'L'
 * @param {Array}  inputs.activities
 * @param {object} [config]
 */
function calculateWaterBalance(inputs, config) {
  const method = 'waterBalance';
  const units = Object.assign({}, UNACCOUNTED_UNITS, { totalConsumptionM3: 'm3' });
  if (!isPlainObject(inputs)) return invalidInputResult(method, units, 'inputs');

  const suppliedUnit = isMissing(inputs.suppliedUnit) ? 'm3' : inputs.suppliedUnit;
  const total = calculateTotalConsumption(inputs.activities, config);

  if (!total.valid) {
    // Also report supply problems so the user can fix everything in one pass.
    const supplyErrors = [
      ...checkNumber(inputs.suppliedVolume, 'suppliedVolume'),
      ...checkUnit(suppliedUnit, VOLUME_UNIT_TO_M3, 'suppliedUnit'),
    ];
    const result = buildResult(method, [...supplyErrors, ...total.errors], total.warnings, null, units);
    result.note = UNACCOUNTED_NOTE;
    return result;
  }

  const unaccounted = calculateUnaccountedWater({
    suppliedVolume: inputs.suppliedVolume,
    suppliedUnit,
    consumedVolume: total.values.totalM3,
    consumedUnit: 'm3',
  });

  const warnings = [...total.warnings, ...unaccounted.warnings];
  const result = buildResult(
    method,
    unaccounted.errors,
    warnings,
    unaccounted.valid
      ? Object.assign({}, unaccounted.values, {
          totalConsumptionM3: total.values.totalM3,
          breakdown: total.values.breakdown,
        })
      : null,
    units
  );
  result.note = UNACCOUNTED_NOTE;
  return result;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const api = {
  // constants
  METRES_PER_INCH,
  LITRES_PER_CUBIC_METRE,
  VOLUME_TOLERANCE_M3,
  DEFAULT_CONFIG,
  UNACCOUNTED_NOTE,
  TIME_UNIT_TO_SECONDS,
  FLOW_UNIT_TO_M3_PER_S,
  VOLUME_UNIT_TO_M3,
  // conversion helpers
  inchesToMetres,
  inchesPerSecondToMetresPerSecond,
  litresToCubicMetres,
  cubicMetresToLitres,
  roundTo,
  // calculators
  calculateFlowMeterVolume,
  calculatePipeVolume,
  calculateDirectVolume,
  calculateActivityVolume,
  calculateTotalConsumption,
  calculateUnaccountedWater,
  calculateWaterBalance,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
} else if (typeof globalThis !== 'undefined') {
  globalThis.WaterCalculations = api;
}
