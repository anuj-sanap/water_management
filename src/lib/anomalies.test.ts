import { describe, it, expect } from 'vitest';
import {
  detectSpikes,
  detectDrops,
  detectNoRecords,
  detectExceedsSupply,
  detectHighUnaccounted,
  detectAssumedVelocityHeavy,
  detectAnomalies,
} from './anomalies';

describe('Water Telemetry Anomaly Detection Engine (Pure Functions)', () => {
  describe('Rule: SPIKE', () => {
    it('detects a spike when a day exceeds rolling 14-day mean + 2 std deviations (with >= 7 days history)', () => {
      // 10 baseline days of 10 m³
      const entries = [
        { date: '2026-03-01', volumeM3: 10 },
        { date: '2026-03-02', volumeM3: 10.2 },
        { date: '2026-03-03', volumeM3: 9.8 },
        { date: '2026-03-04', volumeM3: 10.1 },
        { date: '2026-03-05', volumeM3: 10 },
        { date: '2026-03-06', volumeM3: 9.9 },
        { date: '2026-03-07', volumeM3: 10.1 },
        { date: '2026-03-08', volumeM3: 10 },
        // Spike on day 9 (25 m³)
        { date: '2026-03-09', volumeM3: 25 },
      ];

      const spikes = detectSpikes(entries);
      expect(spikes.length).toBe(1);
      expect(spikes[0].type).toBe('SPIKE');
      expect(spikes[0].date).toBe('2026-03-09');
      expect(spikes[0].message).toContain('Check for a meter reading error or an unusual activity');
      expect(spikes[0].message).not.toMatch(/loss|wastage/i);
    });

    it('requires at least 7 days of history before flagging a spike', () => {
      const entries = [
        { date: '2026-03-01', volumeM3: 10 },
        { date: '2026-03-02', volumeM3: 10 },
        { date: '2026-03-03', volumeM3: 50 }, // only 2 days of history
      ];

      const spikes = detectSpikes(entries);
      expect(spikes.length).toBe(0);
    });
  });

  describe('Rule: DROP', () => {
    it('detects an unusual drop versus baseline for an ACTIVE project', () => {
      const entries = [
        { date: '2026-03-01', volumeM3: 12 },
        { date: '2026-03-02', volumeM3: 12.5 },
        { date: '2026-03-03', volumeM3: 11.8 },
        { date: '2026-03-04', volumeM3: 12.1 },
        { date: '2026-03-05', volumeM3: 12.3 },
        { date: '2026-03-06', volumeM3: 11.9 },
        { date: '2026-03-07', volumeM3: 12.0 },
        { date: '2026-03-08', volumeM3: 12.2 },
        // Sudden drop to 0.5 m³
        { date: '2026-03-09', volumeM3: 0.5 },
      ];

      const drops = detectDrops(entries, 'ACTIVE');
      expect(drops.length).toBe(1);
      expect(drops[0].type).toBe('DROP');
      expect(drops[0].date).toBe('2026-03-09');
      expect(drops[0].message).toContain('unusually low versus the recent baseline');
      expect(drops[0].message).not.toMatch(/loss|wastage/i);
    });

    it('ignores drops when project status is not ACTIVE (e.g., ON_HOLD)', () => {
      const entries = [
        { date: '2026-03-01', volumeM3: 12 },
        { date: '2026-03-02', volumeM3: 12 },
        { date: '2026-03-03', volumeM3: 12 },
        { date: '2026-03-04', volumeM3: 12 },
        { date: '2026-03-05', volumeM3: 12 },
        { date: '2026-03-06', volumeM3: 12 },
        { date: '2026-03-07', volumeM3: 12 },
        { date: '2026-03-08', volumeM3: 0.5 },
      ];

      const drops = detectDrops(entries, 'ON_HOLD');
      expect(drops.length).toBe(0);
    });
  });

  describe('Rule: NO_RECORDS', () => {
    it('detects missing consumption on working days (Mon-Fri) for an active project', () => {
      // 2026-03-02 is Monday, 2026-03-04 is Wednesday (Tuesday 2026-03-03 is missing)
      const entries = [
        { date: '2026-03-02', volumeM3: 10 }, // Mon
        { date: '2026-03-04', volumeM3: 12 }, // Wed
      ];

      const missing = detectNoRecords(entries, 'ACTIVE', 'Skyline Project');
      expect(missing.length).toBe(1);
      expect(missing[0].type).toBe('NO_RECORDS');
      expect(missing[0].date).toBe('2026-03-03'); // Tue
      expect(missing[0].message).toContain('No consumption activities were logged');
      expect(missing[0].message).not.toMatch(/loss|wastage/i);
    });
  });

  describe('Rule: EXCEEDS_SUPPLY', () => {
    it('flags days where recorded consumption exceeds delivered supply', () => {
      const supplies = [{ date: '2026-03-05', volumeM3: 10 }];
      const consumptions = [{ date: '2026-03-05', volumeM3: 14.5 }];

      const anomalies = detectExceedsSupply(supplies, consumptions);
      expect(anomalies.length).toBe(1);
      expect(anomalies[0].type).toBe('EXCEEDS_SUPPLY');
      expect(anomalies[0].date).toBe('2026-03-05');
      expect(anomalies[0].message).toContain('Recorded consumption (14.5 m³) exceeded delivered water supply (10.0 m³)');
      expect(anomalies[0].message).not.toMatch(/loss|wastage/i);
    });
  });

  describe('Rule: HIGH_UNACCOUNTED', () => {
    it('flags days where unaccounted percentage exceeds the configured threshold', () => {
      // Supply 100 m³, Consumption 80 m³ -> Unaccounted 20 m³ (20%)
      const supplies = [{ date: '2026-03-06', volumeM3: 100 }];
      const consumptions = [{ date: '2026-03-06', volumeM3: 80 }];

      // Threshold is 15%
      const anomalies = detectHighUnaccounted(supplies, consumptions, 15);
      expect(anomalies.length).toBe(1);
      expect(anomalies[0].type).toBe('HIGH_UNACCOUNTED');
      expect(anomalies[0].date).toBe('2026-03-06');
      expect(anomalies[0].message).toContain('Unaccounted water was 20.0% on 6 Mar, exceeding the configured project threshold of 15%');
      expect(anomalies[0].message).not.toMatch(/loss|wastage/i);
    });
  });

  describe('Rule: ASSUMED_VELOCITY_HEAVY', () => {
    it('flags when more than 30% of pipe records use the assumed velocity default', () => {
      const records = [
        { id: '1', usedAssumedVelocity: true },
        { id: '2', usedAssumedVelocity: true },
        { id: '3', usedAssumedVelocity: false },
        { id: '4', usedAssumedVelocity: false },
        { id: '5', usedAssumedVelocity: false },
      ]; // 2 out of 5 = 40% > 30%

      const anomalies = detectAssumedVelocityHeavy(records, '2026-03-10', 47.24);
      expect(anomalies.length).toBe(1);
      expect(anomalies[0].type).toBe('ASSUMED_VELOCITY_HEAVY');
      expect(anomalies[0].message).toContain('40% of pipe flow records in this period used the assumed velocity (47.24 in/s)');
      expect(anomalies[0].message).not.toMatch(/loss|wastage/i);
    });
  });

  describe('Full Composite Detection', () => {
    it('runs detectAnomalies cleanly and produces neutral suggestions without loss/wastage terms', () => {
      const result = detectAnomalies({
        projectId: 'proj-1',
        projectName: 'Commercial Tower',
        projectStatus: 'ACTIVE',
        unaccountedThresholdPercent: 15,
        assumedVelocityInPerSec: 47.24,
        dailyConsumption: [
          { date: '2026-03-01', volumeM3: 10 },
          { date: '2026-03-02', volumeM3: 10 },
          { date: '2026-03-03', volumeM3: 10 },
          { date: '2026-03-04', volumeM3: 10 },
          { date: '2026-03-05', volumeM3: 10 },
          { date: '2026-03-06', volumeM3: 10 },
          { date: '2026-03-07', volumeM3: 10 },
          { date: '2026-03-08', volumeM3: 10 },
          { date: '2026-03-09', volumeM3: 35 }, // Spike
        ],
        dailySupply: [
          { date: '2026-03-09', volumeM3: 20 }, // Consumed 35 > 20 -> Exceeds supply
        ],
      });

      expect(result.some((a) => a.type === 'SPIKE')).toBe(true);
      expect(result.some((a) => a.type === 'EXCEEDS_SUPPLY')).toBe(true);

      for (const anomaly of result) {
        expect(anomaly.message).not.toMatch(/loss|wastage/i);
      }
    });
  });
});
