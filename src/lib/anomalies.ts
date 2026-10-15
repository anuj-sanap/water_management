/**
 * anomalies.ts
 *
 * Pure functions for detecting water telemetry anomalies and data quality signals.
 * All messages use neutral, professional engineering wording suggesting checks.
 * Never uses the words "wastage" or "loss".
 */

export type AnomalyType =
  | 'SPIKE'
  | 'DROP'
  | 'NO_RECORDS'
  | 'EXCEEDS_SUPPLY'
  | 'HIGH_UNACCOUNTED'
  | 'ASSUMED_VELOCITY_HEAVY';

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface DailyConsumptionEntry {
  date: string; // 'YYYY-MM-DD'
  volumeM3: number;
  activityBreakdown?: Record<string, number>; // activityName -> volumeM3
}

export interface DailySupplyEntry {
  date: string; // 'YYYY-MM-DD'
  volumeM3: number;
}

export interface PipeRecordEntry {
  id: string;
  usedAssumedVelocity: boolean;
}

export interface AnomalyDetectionInput {
  projectId: string;
  projectName: string;
  projectStatus: 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
  unaccountedThresholdPercent: number;
  assumedVelocityInPerSec: number;
  dailyConsumption: DailyConsumptionEntry[];
  dailySupply: DailySupplyEntry[];
  pipeRecords?: PipeRecordEntry[];
}

export interface DetectedAnomaly {
  type: AnomalyType;
  severity: AnomalySeverity;
  date: string; // 'YYYY-MM-DD'
  message: string;
  metadata?: Record<string, unknown>;
}

function formatDate(dateStr: string): string {
  try {
    const [, m, d] = dateStr.split('-');
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const monthName = months[parseInt(m, 10) - 1] || m;
    return `${parseInt(d, 10)} ${monthName}`;
  } catch {
    return dateStr;
  }
}

/**
 * 1. SPIKE: a day's consumption for an activity (or total) exceeds the rolling 14-day mean + 2 standard deviations.
 * Requires at least 7 days of historical records.
 */
export function detectSpikes(
  dailyConsumption: DailyConsumptionEntry[]
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const sorted = [...dailyConsumption].sort((a, b) => a.date.localeCompare(b.date));

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];

    // Look back up to 14 days prior
    const history: number[] = [];
    for (let j = Math.max(0, i - 14); j < i; j++) {
      history.push(sorted[j].volumeM3);
    }

    if (history.length >= 7) {
      const mean = history.reduce((acc, v) => acc + v, 0) / history.length;
      const variance =
        history.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / history.length;
      const stdDev = Math.sqrt(variance);

      const threshold = mean + 2 * stdDev;

      if (current.volumeM3 > threshold && current.volumeM3 > mean * 1.25) {
        const ratio = mean > 0 ? (current.volumeM3 / mean).toFixed(1) : '2.0';
        const formatted = formatDate(current.date);

        anomalies.push({
          type: 'SPIKE',
          severity: current.volumeM3 > mean + 3 * stdDev ? 'CRITICAL' : 'HIGH',
          date: current.date,
          message: `Consumption on ${formatted} was ${ratio}x the 14-day average. Check for a meter reading error or an unusual activity.`,
          metadata: {
            volumeM3: current.volumeM3,
            mean,
            stdDev,
            threshold,
            ratio: parseFloat(ratio),
          },
        });
      }
    }
  }

  return anomalies;
}

/**
 * 2. DROP: unusually low versus baseline while the project is ACTIVE.
 * Requires at least 7 days of history and an active baseline.
 */
export function detectDrops(
  dailyConsumption: DailyConsumptionEntry[],
  projectStatus: string
): DetectedAnomaly[] {
  if (projectStatus !== 'ACTIVE') return [];

  const anomalies: DetectedAnomaly[] = [];
  const sorted = [...dailyConsumption].sort((a, b) => a.date.localeCompare(b.date));

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];

    const history: number[] = [];
    for (let j = Math.max(0, i - 14); j < i; j++) {
      history.push(sorted[j].volumeM3);
    }

    if (history.length >= 7) {
      const mean = history.reduce((acc, v) => acc + v, 0) / history.length;
      const variance =
        history.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / history.length;
      const stdDev = Math.sqrt(variance);

      // If average baseline is significant (> 2.0 m³) and current is substantially below baseline
      if (mean >= 2.0 && current.volumeM3 < Math.max(0, mean - 2 * stdDev) && current.volumeM3 < 0.25 * mean) {
        const formatted = formatDate(current.date);
        anomalies.push({
          type: 'DROP',
          severity: 'MEDIUM',
          date: current.date,
          message: `Consumption on ${formatted} (${current.volumeM3.toFixed(1)} m³) was unusually low versus the recent baseline of ${mean.toFixed(1)} m³. Check if activity was paused or if logging was delayed.`,
          metadata: {
            volumeM3: current.volumeM3,
            mean,
            stdDev,
          },
        });
      }
    }
  }

  return anomalies;
}

/**
 * 3. NO_RECORDS: active project with no consumption record for a working day.
 * Checks Monday through Friday within the date span.
 */
export function detectNoRecords(
  dailyConsumption: DailyConsumptionEntry[],
  projectStatus: string,
  projectName: string
): DetectedAnomaly[] {
  if (projectStatus !== 'ACTIVE' || dailyConsumption.length === 0) return [];

  const anomalies: DetectedAnomaly[] = [];
  const existingDays = new Set(dailyConsumption.map((d) => d.date));

  const sortedDates = [...dailyConsumption]
    .map((d) => d.date)
    .sort();

  const minDate = new Date(sortedDates[0]);
  const maxDate = new Date(sortedDates[sortedDates.length - 1]);

  const curr = new Date(minDate);
  while (curr <= maxDate) {
    const dayOfWeek = curr.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    const dateStr = curr.toISOString().slice(0, 10);

    // Working days: Monday - Friday (1 - 5)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      if (!existingDays.has(dateStr)) {
        const formatted = formatDate(dateStr);
        anomalies.push({
          type: 'NO_RECORDS',
          severity: 'LOW',
          date: dateStr,
          message: `No consumption activities were logged on ${formatted} for active site ${projectName}. Check if work was scheduled or if records are pending entry.`,
          metadata: { date: dateStr },
        });
      }
    }
    curr.setDate(curr.getDate() + 1);
  }

  return anomalies;
}

/**
 * 4. EXCEEDS_SUPPLY: period / daily consumption greater than supply (data check, not wastage).
 */
export function detectExceedsSupply(
  dailySupply: DailySupplyEntry[],
  dailyConsumption: DailyConsumptionEntry[]
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];

  const supplyMap = new Map<string, number>();
  dailySupply.forEach((s) => {
    supplyMap.set(s.date, (supplyMap.get(s.date) || 0) + s.volumeM3);
  });

  const consumptionMap = new Map<string, number>();
  dailyConsumption.forEach((c) => {
    consumptionMap.set(c.date, (consumptionMap.get(c.date) || 0) + c.volumeM3);
  });

  const allDates = Array.from(
    new Set([...supplyMap.keys(), ...consumptionMap.keys()])
  ).sort();

  for (const date of allDates) {
    const supplied = supplyMap.get(date) || 0;
    const consumed = consumptionMap.get(date) || 0;

    if (consumed > supplied && consumed > 0) {
      const formatted = formatDate(date);
      anomalies.push({
        type: 'EXCEEDS_SUPPLY',
        severity: 'HIGH',
        date,
        message: `Recorded consumption (${consumed.toFixed(1)} m³) exceeded delivered water supply (${supplied.toFixed(1)} m³) on ${formatted}. Check for buffer sump drawdown or meter calibration.`,
        metadata: { suppliedM3: supplied, consumedM3: consumed },
      });
    }
  }

  return anomalies;
}

/**
 * 5. HIGH_UNACCOUNTED: unaccounted % above the project threshold.
 */
export function detectHighUnaccounted(
  dailySupply: DailySupplyEntry[],
  dailyConsumption: DailyConsumptionEntry[],
  thresholdPercent: number
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];

  const supplyMap = new Map<string, number>();
  dailySupply.forEach((s) => {
    supplyMap.set(s.date, (supplyMap.get(s.date) || 0) + s.volumeM3);
  });

  const consumptionMap = new Map<string, number>();
  dailyConsumption.forEach((c) => {
    consumptionMap.set(c.date, (consumptionMap.get(c.date) || 0) + c.volumeM3);
  });

  for (const [date, supplied] of supplyMap.entries()) {
    if (supplied > 0) {
      const consumed = consumptionMap.get(date) || 0;
      if (consumed <= supplied) {
        const unacc = supplied - consumed;
        const unaccPct = (unacc / supplied) * 100;

        if (unaccPct > thresholdPercent) {
          const formatted = formatDate(date);
          anomalies.push({
            type: 'HIGH_UNACCOUNTED',
            severity: unaccPct > thresholdPercent * 1.5 ? 'HIGH' : 'MEDIUM',
            date,
            message: `Unaccounted water was ${unaccPct.toFixed(1)}% on ${formatted}, exceeding the configured project threshold of ${thresholdPercent}%. Check site distribution or verify for unrecorded consumption.`,
            metadata: {
              suppliedM3: supplied,
              consumedM3: consumed,
              unaccountedPercent: unaccPct,
              thresholdPercent,
            },
          });
        }
      }
    }
  }

  return anomalies;
}

/**
 * 6. ASSUMED_VELOCITY_HEAVY: more than 30% of pipe records in the period use the assumed velocity.
 */
export function detectAssumedVelocityHeavy(
  pipeRecords: PipeRecordEntry[] = [],
  periodDate: string,
  assumedVelocityInPerSec: number
): DetectedAnomaly[] {
  if (pipeRecords.length < 5) return [];

  const assumedCount = pipeRecords.filter((r) => r.usedAssumedVelocity).length;
  const pct = (assumedCount / pipeRecords.length) * 100;

  if (pct > 30) {
    return [
      {
        type: 'ASSUMED_VELOCITY_HEAVY',
        severity: 'MEDIUM',
        date: periodDate,
        message: `${pct.toFixed(0)}% of pipe flow records in this period used the assumed velocity (${assumedVelocityInPerSec} in/s). Check if flow velocity can be measured directly for higher precision.`,
        metadata: {
          totalPipeRecords: pipeRecords.length,
          assumedCount,
          percent: pct,
        },
      },
    ];
  }

  return [];
}

/**
 * Comprehensive anomaly detection running all pure rules against project telemetry.
 */
export function detectAnomalies(input: AnomalyDetectionInput): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];

  // 1. Spikes
  anomalies.push(...detectSpikes(input.dailyConsumption));

  // 2. Drops
  anomalies.push(...detectDrops(input.dailyConsumption, input.projectStatus));

  // 3. No records on working days
  anomalies.push(
    ...detectNoRecords(input.dailyConsumption, input.projectStatus, input.projectName)
  );

  // 4. Exceeds supply
  anomalies.push(...detectExceedsSupply(input.dailySupply, input.dailyConsumption));

  // 5. High unaccounted
  anomalies.push(
    ...detectHighUnaccounted(
      input.dailySupply,
      input.dailyConsumption,
      input.unaccountedThresholdPercent
    )
  );

  // 6. Heavy assumed velocity usage
  if (input.pipeRecords && input.pipeRecords.length > 0) {
    const latestDate =
      input.dailyConsumption[input.dailyConsumption.length - 1]?.date ||
      new Date().toISOString().slice(0, 10);
    anomalies.push(
      ...detectAssumedVelocityHeavy(
        input.pipeRecords,
        latestDate,
        input.assumedVelocityInPerSec
      )
    );
  }

  return anomalies;
}
