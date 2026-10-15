'use strict';

/**
 * Tests for waterCalculations.js
 * Run with:  node --test waterCalculations.test.js     (Node 18+, no dependencies)
 *
 * Expected values were worked out by hand / independently of the module
 * (see the comments on each test) and are not copied from the code's output.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('./waterCalculations.js');

/** Assert two numbers are equal within a tolerance. */
function approx(actual, expected, tolerance = 1e-9, label = '') {
  assert.ok(
    typeof actual === 'number' && Math.abs(actual - expected) <= tolerance,
    `${label} expected ${expected} but got ${actual} (tolerance ${tolerance})`
  );
}

function codes(result) {
  return result.errors.map((e) => e.code);
}

function fields(result) {
  return result.errors.map((e) => e.field);
}

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

test('conversion helpers', () => {
  approx(W.inchesToMetres(1), 0.0254, 1e-15);
  approx(W.inchesToMetres(4), 0.1016, 1e-15);
  approx(W.inchesPerSecondToMetresPerSecond(47.24), 1.199896, 1e-12); // 47.24 x 0.0254
  assert.equal(W.litresToCubicMetres(2500), 2.5);
  assert.equal(W.cubicMetresToLitres(2.5), 2500);
  assert.equal(W.cubicMetresToLitres(W.litresToCubicMetres(123.456)), 123.456);
  assert.equal(W.roundTo(1.23456, 2), 1.23);
  assert.equal(W.DEFAULT_CONFIG.assumedVelocityInPerSec, 47.24);
});

// ---------------------------------------------------------------------------
// Method 1: flow meter
// ---------------------------------------------------------------------------

test('flow meter: 0.01 m3/s for 3600 s = 36 m3 (36000 L) [defaults are SI]', () => {
  const r = W.calculateFlowMeterVolume({ flowRate: 0.01, time: 3600 });
  assert.equal(r.valid, true);
  assert.equal(r.method, 'flowMeter');
  approx(r.values.volumeM3, 36);
  approx(r.values.volumeLitres, 36000, 1e-6);
  approx(r.values.flowRateM3PerS, 0.01);
  assert.equal(r.values.timeSeconds, 3600);
  assert.equal(r.units.volumeM3, 'm3');
  assert.deepEqual(r.errors, []);
});

test('flow meter: 5 L/s for 10 min = 0.005 m3/s x 600 s = 3 m3', () => {
  const r = W.calculateFlowMeterVolume({ flowRate: 5, flowRateUnit: 'L/s', time: 10, timeUnit: 'min' });
  assert.equal(r.valid, true);
  approx(r.values.volumeM3, 3);
});

test('flow meter: 120 L/min for 2 h = 120 x 120 = 14400 L = 14.4 m3', () => {
  const r = W.calculateFlowMeterVolume({ flowRate: 120, flowRateUnit: 'L/min', time: 2, timeUnit: 'h' });
  approx(r.values.volumeM3, 14.4);
  approx(r.values.volumeLitres, 14400, 1e-6);
});

test('flow meter: 18 m3/h for 30 min = 9 m3', () => {
  const r = W.calculateFlowMeterVolume({ flowRate: 18, flowRateUnit: 'm3/h', time: 30, timeUnit: 'min' });
  approx(r.values.volumeM3, 9);
});

test('flow meter: 3600 L/h for 1 h = 3600 L = 3.6 m3', () => {
  const r = W.calculateFlowMeterVolume({ flowRate: 3600, flowRateUnit: 'L/h', time: 1, timeUnit: 'h' });
  approx(r.values.volumeM3, 3.6);
});

test('flow meter: zero flow rate and zero time are valid and give 0', () => {
  const a = W.calculateFlowMeterVolume({ flowRate: 0, time: 100 });
  const b = W.calculateFlowMeterVolume({ flowRate: 5, flowRateUnit: 'L/s', time: 0 });
  assert.equal(a.valid, true);
  assert.equal(a.values.volumeM3, 0);
  assert.equal(b.valid, true);
  assert.equal(b.values.volumeM3, 0);
});

test('flow meter: invalid inputs', () => {
  assert.deepEqual(codes(W.calculateFlowMeterVolume({ flowRate: -1, time: 10 })), ['NEGATIVE_VALUE']);
  assert.deepEqual(codes(W.calculateFlowMeterVolume({ flowRate: 1, time: -10 })), ['NEGATIVE_VALUE']);
  assert.deepEqual(codes(W.calculateFlowMeterVolume({ time: 10 })), ['MISSING_INPUT']);
  assert.deepEqual(fields(W.calculateFlowMeterVolume({ flowRate: 1 })), ['time']);
  assert.deepEqual(codes(W.calculateFlowMeterVolume({ flowRate: '5', time: 10 })), ['INVALID_TYPE']);
  assert.deepEqual(codes(W.calculateFlowMeterVolume({ flowRate: NaN, time: 10 })), ['INVALID_TYPE']);
  assert.deepEqual(codes(W.calculateFlowMeterVolume({ flowRate: Infinity, time: 10 })), ['INVALID_TYPE']);
  assert.deepEqual(
    codes(W.calculateFlowMeterVolume({ flowRate: 1, flowRateUnit: 'gal/min', time: 10 })),
    ['INVALID_UNIT']
  );
  assert.deepEqual(
    codes(W.calculateFlowMeterVolume({ flowRate: 1, time: 10, timeUnit: 'days' })),
    ['INVALID_UNIT']
  );
});

test('flow meter: invalid result has null values, errors, and still reports units', () => {
  const r = W.calculateFlowMeterVolume({ flowRate: -1, time: 10 });
  assert.equal(r.valid, false);
  assert.equal(r.values, null);
  assert.equal(r.units.volumeM3, 'm3');
  assert.match(r.errors[0].message, /flowRate must not be negative/);
});

test('flow meter: all errors are collected, not just the first', () => {
  const r = W.calculateFlowMeterVolume({ flowRate: -1, flowRateUnit: 'bad' });
  assert.deepEqual(fields(r).sort(), ['flowRate', 'flowRateUnit', 'time']);
});

test('flow meter: missing / non-object inputs do not throw', () => {
  assert.deepEqual(codes(W.calculateFlowMeterVolume()), ['INVALID_INPUT']);
  assert.deepEqual(codes(W.calculateFlowMeterVolume(null)), ['INVALID_INPUT']);
  assert.deepEqual(codes(W.calculateFlowMeterVolume([])), ['INVALID_INPUT']);
});

// ---------------------------------------------------------------------------
// Method 2: pipe
// ---------------------------------------------------------------------------

test('pipe: 4 in pipe, 1 m/s (as 1/0.0254 in/s), 100 s -> A = 0.0081073197 m2, V = 0.81073197 m3', () => {
  // Expected: d = 0.1016 m; A = pi x 0.1016^2 / 4 = 0.008107319665559963 m2; Q = A x 1; V = Q x 100
  const r = W.calculatePipeVolume({ diameterInches: 4, velocityInPerSec: 1 / 0.0254, timeSeconds: 100 });
  assert.equal(r.valid, true);
  approx(r.values.diameterM, 0.1016, 1e-12);
  approx(r.values.velocityMPerS, 1, 1e-12);
  approx(r.values.areaM2, 0.008107319665559963, 1e-12);
  approx(r.values.flowRateM3PerS, 0.008107319665559963, 1e-12);
  approx(r.values.volumeM3, 0.8107319665559963, 1e-10);
  approx(r.values.volumeLitres, 810.7319665559963, 1e-7);
  assert.equal(r.values.velocitySource, 'provided');
  assert.deepEqual(r.warnings, []);
});

test('pipe: 2 in pipe, 10 in/s, 60 s -> d=0.0508 m, v=0.254 m/s, V=0.030888888 m3', () => {
  const r = W.calculatePipeVolume({ diameterInches: 2, velocityInPerSec: 10, timeSeconds: 60 });
  approx(r.values.diameterM, 0.0508, 1e-12);
  approx(r.values.velocityMPerS, 0.254, 1e-12);
  approx(r.values.areaM2, 0.0020268299163899908, 1e-14);
  approx(r.values.flowRateM3PerS, 0.0005148147987630577, 1e-14);
  approx(r.values.volumeM3, 0.03088888792578346, 1e-12);
  approx(r.values.volumeLitres, 30.88888792578346, 1e-9);
});

test('pipe: default assumed velocity 47.24 in/s is used with a warning (4 in, 3600 s)', () => {
  // v = 1.199896 m/s; Q = 0.009727940437 m3/s (about 9.73 L/s); V = 35.0205855747 m3
  const r = W.calculatePipeVolume({ diameterInches: 4, timeSeconds: 3600 });
  assert.equal(r.valid, true);
  assert.equal(r.values.velocityInPerS, 47.24);
  assert.equal(r.values.velocitySource, 'assumed-default');
  approx(r.values.velocityMPerS, 1.199896, 1e-12);
  approx(r.values.flowRateM3PerS, 0.009727940437426738, 1e-12);
  approx(r.values.flowRateLitresPerS, 9.727940437426738, 1e-9);
  approx(r.values.volumeM3, 35.02058557473626, 1e-8);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.warnings[0].code, 'ASSUMED_VELOCITY');
  assert.match(r.warnings[0].message, /not a measured value/);
});

test('pipe: default velocity is configurable', () => {
  // 60 in/s = 1.524 m/s; Q = 0.012355555170 m3/s; V over 10 s = 0.1235555517 m3
  const r = W.calculatePipeVolume(
    { diameterInches: 4, timeSeconds: 10 },
    { assumedVelocityInPerSec: 60 }
  );
  assert.equal(r.values.velocityInPerS, 60);
  approx(r.values.volumeM3, 0.12355555170313384, 1e-12);
  assert.equal(r.warnings[0].code, 'ASSUMED_VELOCITY');
  // The shared default must be untouched.
  assert.equal(W.DEFAULT_CONFIG.assumedVelocityInPerSec, 47.24);
});

test('pipe: a supplied velocity overrides the default (no warning)', () => {
  const r = W.calculatePipeVolume(
    { diameterInches: 4, velocityInPerSec: 10, timeSeconds: 10 },
    { assumedVelocityInPerSec: 60 }
  );
  assert.equal(r.values.velocityInPerS, 10);
  assert.equal(r.values.velocitySource, 'provided');
  assert.equal(r.warnings.length, 0);
});

test('pipe: explicit zero velocity is a real input (no default, no warning) -> 0 m3', () => {
  const r = W.calculatePipeVolume({ diameterInches: 4, velocityInPerSec: 0, timeSeconds: 3600 });
  assert.equal(r.valid, true);
  assert.equal(r.values.velocitySource, 'provided');
  assert.equal(r.values.volumeM3, 0);
  assert.equal(r.warnings.length, 0);
});

test('pipe: zero time -> 0 m3', () => {
  const r = W.calculatePipeVolume({ diameterInches: 4, velocityInPerSec: 10, timeSeconds: 0 });
  assert.equal(r.valid, true);
  assert.equal(r.values.volumeM3, 0);
});

test('pipe: very small pipe (0.5 in) and short time (1 s) with default velocity', () => {
  // A = 0.000126676869774 m2; V = A x 1.199896 x 1 = 0.000151999069 m3 = 0.1519990693 L
  const r = W.calculatePipeVolume({ diameterInches: 0.5, timeSeconds: 1 });
  approx(r.values.volumeM3, 0.00015199906933479278, 1e-15);
  approx(r.values.volumeLitres, 0.1519990693347928, 1e-12);
});

test('pipe: invalid inputs', () => {
  assert.deepEqual(codes(W.calculatePipeVolume({ diameterInches: -4, timeSeconds: 10 })), ['NEGATIVE_VALUE']);
  assert.deepEqual(codes(W.calculatePipeVolume({ diameterInches: 0, timeSeconds: 10 })), ['ZERO_NOT_ALLOWED']);
  assert.deepEqual(codes(W.calculatePipeVolume({ timeSeconds: 10 })), ['MISSING_INPUT']);
  assert.deepEqual(fields(W.calculatePipeVolume({ diameterInches: 4 })), ['timeSeconds']);
  assert.deepEqual(
    codes(W.calculatePipeVolume({ diameterInches: 4, velocityInPerSec: -1, timeSeconds: 10 })),
    ['NEGATIVE_VALUE']
  );
  assert.deepEqual(
    codes(W.calculatePipeVolume({ diameterInches: '4', timeSeconds: 10 })),
    ['INVALID_TYPE']
  );
  assert.deepEqual(
    codes(W.calculatePipeVolume({ diameterInches: 4, timeSeconds: -5 })),
    ['NEGATIVE_VALUE']
  );
  assert.deepEqual(codes(W.calculatePipeVolume()), ['INVALID_INPUT']);
});

test('pipe: invalid configured default velocity is reported', () => {
  const r = W.calculatePipeVolume({ diameterInches: 4, timeSeconds: 10 }, { assumedVelocityInPerSec: -3 });
  assert.equal(r.valid, false);
  assert.deepEqual(fields(r), ['config.assumedVelocityInPerSec']);
});

// ---------------------------------------------------------------------------
// Method 3: direct input
// ---------------------------------------------------------------------------

test('direct: 2500 L = 2.5 m3', () => {
  const r = W.calculateDirectVolume({ volumeLitres: 2500 });
  assert.equal(r.valid, true);
  assert.equal(r.values.volumeM3, 2.5);
  assert.equal(r.values.volumeLitres, 2500);
  assert.equal(r.units.volumeM3, 'm3');
});

test('direct: 0.5 L = 0.0005 m3; 0 L = 0 m3', () => {
  approx(W.calculateDirectVolume({ volumeLitres: 0.5 }).values.volumeM3, 0.0005, 1e-15);
  assert.equal(W.calculateDirectVolume({ volumeLitres: 0 }).values.volumeM3, 0);
});

test('direct: invalid inputs', () => {
  assert.deepEqual(codes(W.calculateDirectVolume({ volumeLitres: -1 })), ['NEGATIVE_VALUE']);
  assert.deepEqual(codes(W.calculateDirectVolume({})), ['MISSING_INPUT']);
  assert.deepEqual(codes(W.calculateDirectVolume({ volumeLitres: null })), ['MISSING_INPUT']);
  assert.deepEqual(codes(W.calculateDirectVolume({ volumeLitres: 'abc' })), ['INVALID_TYPE']);
  assert.deepEqual(codes(W.calculateDirectVolume(undefined)), ['INVALID_INPUT']);
});

// ---------------------------------------------------------------------------
// Total consumption
// ---------------------------------------------------------------------------

test('total: mixed methods sum correctly', () => {
  // flow meter 3 m3 + direct 2.5 m3 + pipe 0.8107319665559963 m3 = 6.3107319665559963 m3
  const r = W.calculateTotalConsumption([
    { name: 'Concrete curing', method: 'flowMeter', inputs: { flowRate: 5, flowRateUnit: 'L/s', time: 10, timeUnit: 'min' } },
    { name: 'Dust suppression', method: 'direct', inputs: { volumeLitres: 2500 } },
    { name: 'Washdown', method: 'pipe', inputs: { diameterInches: 4, velocityInPerSec: 1 / 0.0254, timeSeconds: 100 } },
  ]);
  assert.equal(r.valid, true);
  approx(r.values.totalM3, 6.310731966555996, 1e-9);
  approx(r.values.totalLitres, 6310.731966555996, 1e-6);
  assert.equal(r.values.activityCount, 3);
  assert.equal(r.values.breakdown.length, 3);
  assert.equal(r.values.breakdown[1].name, 'Dust suppression');
  assert.equal(r.values.breakdown[1].volumeM3, 2.5);
});

test('total: empty list is valid, 0 m3, with a warning', () => {
  const r = W.calculateTotalConsumption([]);
  assert.equal(r.valid, true);
  assert.equal(r.values.totalM3, 0);
  assert.equal(r.warnings[0].code, 'NO_ACTIVITIES');
});

test('total: zero-volume activities are fine', () => {
  const r = W.calculateTotalConsumption([
    { method: 'direct', inputs: { volumeLitres: 0 } },
    { method: 'flowMeter', inputs: { flowRate: 0, time: 0 } },
  ]);
  assert.equal(r.valid, true);
  assert.equal(r.values.totalM3, 0);
});

test('total: one invalid activity -> no total, error tagged with index and name', () => {
  const r = W.calculateTotalConsumption([
    { name: 'Good', method: 'direct', inputs: { volumeLitres: 1000 } },
    { name: 'Bad', method: 'direct', inputs: { volumeLitres: -5 } },
  ]);
  assert.equal(r.valid, false);
  assert.equal(r.values, null);
  assert.equal(r.errors[0].field, 'activities[1].volumeLitres');
  assert.match(r.errors[0].message, /^Bad: /);
});

test('total: unknown/missing method, non-object activity, non-array input', () => {
  const r = W.calculateTotalConsumption([
    { method: 'telepathy', inputs: {} },
    { inputs: {} },
    null,
  ]);
  assert.deepEqual(codes(r), ['INVALID_METHOD', 'MISSING_INPUT', 'INVALID_ACTIVITY']);
  assert.deepEqual(codes(W.calculateTotalConsumption('nope')), ['INVALID_INPUT']);
  assert.deepEqual(codes(W.calculateTotalConsumption()), ['INVALID_INPUT']);
});

test('total: pipe default-velocity warning is propagated with activity context', () => {
  const r = W.calculateTotalConsumption([
    { name: 'Hose A', method: 'pipe', inputs: { diameterInches: 1, timeSeconds: 60 } },
  ]);
  assert.equal(r.valid, true);
  assert.equal(r.warnings[0].code, 'ASSUMED_VELOCITY');
  assert.equal(r.warnings[0].field, 'activities[0].velocityInPerSec');
  assert.match(r.warnings[0].message, /^Hose A: /);
});

test('total: custom config reaches the pipe method', () => {
  const r = W.calculateTotalConsumption(
    [{ method: 'pipe', inputs: { diameterInches: 4, timeSeconds: 10 } }],
    { assumedVelocityInPerSec: 60 }
  );
  approx(r.values.totalM3, 0.12355555170313384, 1e-12);
});

// ---------------------------------------------------------------------------
// Unaccounted water
// ---------------------------------------------------------------------------

test('unaccounted: 100 m3 supplied, 85 m3 consumed -> 15 m3, 15 %', () => {
  const r = W.calculateUnaccountedWater({ suppliedVolume: 100, consumedVolume: 85 });
  assert.equal(r.valid, true);
  assert.equal(r.values.unaccountedM3, 15);
  assert.equal(r.values.unaccountedLitres, 15000);
  assert.equal(r.values.unaccountedPercent, 15);
  assert.equal(r.units.unaccountedPercent, '%');
  assert.match(r.note, /not, by itself, evidence of wastage/);
});

test('unaccounted: litre inputs are converted (100000 L supplied, 85 m3 consumed)', () => {
  const r = W.calculateUnaccountedWater({
    suppliedVolume: 100000, suppliedUnit: 'L', consumedVolume: 85, consumedUnit: 'm3',
  });
  assert.equal(r.values.suppliedM3, 100);
  assert.equal(r.values.unaccountedM3, 15);
  assert.equal(r.values.unaccountedPercent, 15);
});

test('unaccounted: zero consumption -> 100 %; equal values -> 0 %', () => {
  assert.equal(W.calculateUnaccountedWater({ suppliedVolume: 50, consumedVolume: 0 }).values.unaccountedPercent, 100);
  const eq = W.calculateUnaccountedWater({ suppliedVolume: 50, consumedVolume: 50 });
  assert.equal(eq.valid, true);
  assert.equal(eq.values.unaccountedM3, 0);
  assert.equal(eq.values.unaccountedPercent, 0);
});

test('unaccounted: supplied 0 and consumed 0 -> 0 m3, percentage null with warning', () => {
  const r = W.calculateUnaccountedWater({ suppliedVolume: 0, consumedVolume: 0 });
  assert.equal(r.valid, true);
  assert.equal(r.values.unaccountedM3, 0);
  assert.equal(r.values.unaccountedPercent, null);
  assert.equal(r.warnings[0].code, 'PERCENTAGE_UNDEFINED');
});

test('unaccounted: consumption exceeding supply is an error with shortfall details', () => {
  const r = W.calculateUnaccountedWater({ suppliedVolume: 100, consumedVolume: 110 });
  assert.equal(r.valid, false);
  assert.equal(r.values, null);
  assert.deepEqual(codes(r), ['CONSUMPTION_EXCEEDS_SUPPLY']);
  assert.equal(r.errors[0].details.shortfallM3, 10);
  assert.match(r.errors[0].message, /exceeds supplied water/);
});

test('unaccounted: supplied 0 but consumption > 0 is an error', () => {
  const r = W.calculateUnaccountedWater({ suppliedVolume: 0, consumedVolume: 1 });
  assert.deepEqual(codes(r), ['CONSUMPTION_EXCEEDS_SUPPLY']);
});

test('unaccounted: exceedance detected across units (1001 L consumed vs 1 m3 supplied)', () => {
  const r = W.calculateUnaccountedWater({
    suppliedVolume: 1, suppliedUnit: 'm3', consumedVolume: 1001, consumedUnit: 'L',
  });
  assert.deepEqual(codes(r), ['CONSUMPTION_EXCEEDS_SUPPLY']);
  approx(r.errors[0].details.shortfallM3, 0.001, 1e-12);
});

test('unaccounted: floating-point noise is not reported as exceedance (0.1 + 0.2 vs 0.3)', () => {
  const r = W.calculateUnaccountedWater({ suppliedVolume: 0.3, consumedVolume: 0.1 + 0.2 });
  assert.equal(r.valid, true);
  assert.equal(r.values.unaccountedM3, 0); // clamped, never negative
});

test('unaccounted: invalid inputs', () => {
  assert.deepEqual(codes(W.calculateUnaccountedWater({ suppliedVolume: -1, consumedVolume: 0 })), ['NEGATIVE_VALUE']);
  assert.deepEqual(codes(W.calculateUnaccountedWater({ suppliedVolume: 1, consumedVolume: -1 })), ['NEGATIVE_VALUE']);
  assert.deepEqual(fields(W.calculateUnaccountedWater({ consumedVolume: 1 })), ['suppliedVolume']);
  assert.deepEqual(fields(W.calculateUnaccountedWater({ suppliedVolume: 1 })), ['consumedVolume']);
  assert.deepEqual(codes(W.calculateUnaccountedWater({ suppliedVolume: 'x', consumedVolume: 1 })), ['INVALID_TYPE']);
  assert.deepEqual(
    codes(W.calculateUnaccountedWater({ suppliedVolume: 1, suppliedUnit: 'gal', consumedVolume: 1 })),
    ['INVALID_UNIT']
  );
  assert.deepEqual(codes(W.calculateUnaccountedWater()), ['INVALID_INPUT']);
});

// ---------------------------------------------------------------------------
// Full water balance
// ---------------------------------------------------------------------------

test('balance: end-to-end with mixed methods', () => {
  // Total = 3 + 2.5 = 5.5 m3 ; supplied 10 m3 ; unaccounted 4.5 m3 = 45 %
  const r = W.calculateWaterBalance({
    suppliedVolume: 10,
    activities: [
      { name: 'Curing', method: 'flowMeter', inputs: { flowRate: 5, flowRateUnit: 'L/s', time: 10, timeUnit: 'min' } },
      { name: 'Dust control', method: 'direct', inputs: { volumeLitres: 2500 } },
    ],
  });
  assert.equal(r.valid, true);
  approx(r.values.totalConsumptionM3, 5.5);
  approx(r.values.unaccountedM3, 4.5);
  approx(r.values.unaccountedPercent, 45, 1e-9);
  assert.equal(r.values.breakdown.length, 2);
  assert.match(r.note, /not, by itself, evidence of wastage/);
});

test('balance: supplied water in litres', () => {
  const r = W.calculateWaterBalance({
    suppliedVolume: 10000, suppliedUnit: 'L',
    activities: [{ method: 'direct', inputs: { volumeLitres: 5500 } }],
  });
  approx(r.values.unaccountedM3, 4.5);
  approx(r.values.unaccountedPercent, 45, 1e-9);
});

test('balance: consumption exceeding supply is an error', () => {
  const r = W.calculateWaterBalance({
    suppliedVolume: 1,
    activities: [{ method: 'direct', inputs: { volumeLitres: 2000 } }],
  });
  assert.equal(r.valid, false);
  assert.deepEqual(codes(r), ['CONSUMPTION_EXCEEDS_SUPPLY']);
});

test('balance: activity errors and supply errors are reported together', () => {
  const r = W.calculateWaterBalance({
    suppliedVolume: -5,
    activities: [{ method: 'direct', inputs: { volumeLitres: -1 } }],
  });
  assert.equal(r.valid, false);
  assert.deepEqual(fields(r), ['suppliedVolume', 'activities[0].volumeLitres']);
});

test('balance: missing supply, empty activities, and bad input object', () => {
  assert.deepEqual(codes(W.calculateWaterBalance({ activities: [] })), ['MISSING_INPUT']);
  const e = W.calculateWaterBalance({ suppliedVolume: 20, activities: [] });
  assert.equal(e.valid, true);
  assert.equal(e.values.unaccountedPercent, 100);
  assert.deepEqual(codes(W.calculateWaterBalance()), ['INVALID_INPUT']);
});
