import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  buildReportSnapshot,
  reportCsv,
  reportParamsSchema,
  reportPdf,
  reportXlsx,
  type ReportSnapshot,
} from './reporting';

const snapshot: ReportSnapshot = {
  type: 'DAILY_CONSUMPTION',
  title: 'Daily consumption report',
  projectNames: ['Apex Heights'],
  from: '2026-10-01',
  to: '2026-10-14',
  generatedBy: 'Report User',
  generatedAt: '2026-10-14T12:00:00.000Z',
  unit: 'L',
  includeCharts: true,
  columns: [
    { key: 'date', label: 'Date' },
    { key: 'volume', label: 'Consumption (L)' },
  ],
  rows: [{ date: '2026-10-14', volume: 12500 }],
  kpis: [{ label: 'Recorded consumption', value: '12,500 L' }],
  chartData: [{ label: '2026-10-14', suppliedM3: 15, consumedM3: 12.5 }],
  assumptions: ['Apex Heights: 1 record used the project default velocity (47.24 in/s).'],
  disclaimer: 'Unaccounted water is the difference between supplied and recorded water and is not necessarily wastage.',
};

const fixtureProject = {
  id: 'project-1',
  name: 'Apex Heights',
  assumedVelocityInPerSec: 47.24,
  waterSupplies: [{
    id: 'supply-1',
    projectId: 'project-1',
    date: new Date('2026-10-14T12:00:00.000Z'),
    volumeM3: 2.5,
    createdAt: new Date('2026-10-14T12:05:00.000Z'),
    createdBy: { name: 'Engineer' },
  }],
  consumptionRecords: [{
    id: 'consumption-1',
    date: new Date('2026-10-14T12:00:00.000Z'),
    volumeM3: 1.2,
    method: 'PIPE',
    usedAssumedVelocity: true,
    activityType: { name: 'Curing' },
    createdBy: { name: 'Engineer' },
  }, {
    id: 'consumption-2',
    date: new Date('2026-10-14T12:00:00.000Z'),
    volumeM3: 0.3,
    method: 'DIRECT',
    usedAssumedVelocity: false,
    activityType: { name: 'Curing' },
    createdBy: { name: 'Engineer' },
  }],
  alerts: [{
    date: new Date('2026-10-14T12:00:00.000Z'),
    type: 'HIGH_UNACCOUNTED',
    severity: 'MEDIUM',
    status: 'OPEN',
  }],
};

function reportDb() {
  return {
    project: { findMany: vi.fn().mockResolvedValue([fixtureProject]) },
    auditLog: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaClient;
}

describe('report exports', () => {
  it('validates unique projects and ordered date ranges', () => {
    const base = {
      type: 'DAILY_CONSUMPTION',
      projectIds: ['project-1'],
      from: '2026-10-01',
      to: '2026-10-14',
    };
    expect(reportParamsSchema.safeParse(base).success).toBe(true);
    expect(reportParamsSchema.safeParse({ ...base, projectIds: ['project-1', 'project-1'] }).success).toBe(false);
    expect(reportParamsSchema.safeParse({ ...base, from: '2026-10-15' }).success).toBe(false);
  });

  it('writes a UTF-8 BOM, unit-labelled CSV headers, quoted values, and the disclaimer footer', () => {
    const csv = reportCsv(snapshot);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Consumption (L)"');
    expect(csv).toContain('"12500"');
    expect(csv.endsWith(`"${snapshot.disclaimer}",""`)).toBe(true);
    expect(reportCsv({ ...snapshot, rows: [{ date: '=1+1', volume: 0 }] })).toContain(`"'=1+1"`);
  });

  it('creates a valid Excel workbook file', async () => {
    const buffer = await reportXlsx(snapshot);
    expect(buffer.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('aggregates report totals and unit conversions from stored engine volumes', async () => {
    const params = reportParamsSchema.parse({
      type: 'WATER_BALANCE',
      projectIds: ['project-1'],
      from: '2026-10-01',
      to: '2026-10-14',
      grouping: 'week',
      unit: 'L',
      includeCharts: true,
    });
    const report = await buildReportSnapshot(
      reportDb(),
      params,
      'Report User',
      new Date('2026-10-14T12:00:00.000Z')
    );
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      supply: 2500,
      consumption: 1500,
      unaccounted: 1000,
      unaccountedPercent: 40,
      alerts: expect.stringContaining('HIGH_UNACCOUNTED'),
    });
    expect(report.kpis.find((kpi) => kpi.label === 'Recorded consumption')?.value).toBe('1,500 L');
    expect(report.assumptions).toEqual([
      'Apex Heights: 1 record used the project default velocity (47.24 in/s).',
    ]);
  });

  it('renders a valid PDF file', async () => {
    const buffer = await reportPdf(snapshot);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
