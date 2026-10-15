import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';

export const REPORT_TYPES = [
  'DAILY_CONSUMPTION',
  'WATER_BALANCE',
  'ACTIVITY_CONSUMPTION',
  'AUDIT',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];
export type ReportFormat = 'pdf' | 'csv' | 'xlsx';

export const reportParamsSchema = z.object({
  type: z.enum(REPORT_TYPES),
  projectIds: z.array(z.string().min(1)).min(1).max(25),
  from: z.iso.date(),
  to: z.iso.date(),
  grouping: z.enum(['day', 'week', 'month']).default('day'),
  includeCharts: z.boolean().default(true),
  unit: z.enum(['m3', 'L']).default('m3'),
})
  .refine((params) => new Set(params.projectIds).size === params.projectIds.length, {
    message: 'Select each project only once.',
    path: ['projectIds'],
  })
  .refine((params) => params.from <= params.to, {
    message: 'The start date must be on or before the end date.',
    path: ['to'],
  });
export type ReportParams = z.infer<typeof reportParamsSchema>;

export interface ReportColumn {
  key: string;
  label: string;
}

export type ReportCell = string | number;
export type ReportRow = Record<string, ReportCell>;

export interface ReportSnapshot {
  type: ReportType;
  title: string;
  projectNames: string[];
  from: string;
  to: string;
  generatedBy: string;
  generatedAt: string;
  unit: 'm3' | 'L';
  includeCharts: boolean;
  columns: ReportColumn[];
  rows: ReportRow[];
  kpis: Array<{ label: string; value: string }>;
  chartData: Array<{ label: string; suppliedM3: number; consumedM3: number }>;
  assumptions: string[];
  disclaimer: string;
}

const DISCLAIMER =
  'Unaccounted water is the difference between supplied and recorded water and is not necessarily wastage.';

const TITLES: Record<ReportType, string> = {
  DAILY_CONSUMPTION: 'Daily consumption report',
  WATER_BALANCE: 'Water balance report',
  ACTIVITY_CONSUMPTION: 'Activity-wise consumption report',
  AUDIT: 'Water records audit report',
};

function dayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatVolume(valueM3: number, unit: ReportParams['unit']): number {
  return unit === 'L' ? valueM3 * 1000 : valueM3;
}

function periodFor(date: Date, grouping: ReportParams['grouping']): string {
  const day = dayString(date);
  if (grouping === 'day') return day;
  if (grouping === 'month') return day.slice(0, 7);
  const start = new Date(`${day}T00:00:00.000Z`);
  const offset = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - offset);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${dayString(start)} – ${dayString(end)}`;
}

function safeJson(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return JSON.stringify(JSON.parse(value));
  } catch {
    return value;
  }
}

function displayMethod(method: string): string {
  return method === 'FLOW_METER' ? 'Flow meter' : method === 'PIPE' ? 'Pipe' : method === 'DIRECT' ? 'Direct entry' : method;
}

function displayAction(action: string): string {
  return action.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
}

function dateRange(from: string, to: string) {
  return {
    gte: new Date(`${from}T00:00:00.000Z`),
    lte: new Date(`${to}T23:59:59.999Z`),
  };
}

export async function buildReportSnapshot(
  db: PrismaClient,
  params: ReportParams,
  generatedBy: string,
  generatedAt = new Date()
): Promise<ReportSnapshot> {
  const dates = dateRange(params.from, params.to);
  const projects = await db.project.findMany({
    where: { id: { in: params.projectIds } },
    orderBy: { name: 'asc' },
    include: {
      waterSupplies: {
        where: { date: dates },
        include: { createdBy: { select: { name: true } } },
        orderBy: { date: 'asc' },
      },
      consumptionRecords: {
        where: { date: dates },
        include: {
          activityType: { select: { name: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: { date: 'asc' },
      },
      alerts: {
        where: { date: dates },
        select: { date: true, type: true, severity: true, status: true },
      },
    },
  });

  if (projects.length !== params.projectIds.length) {
    throw new Error('One or more selected projects could not be loaded.');
  }

  const supplyTotalM3 = projects.reduce(
    (sum, project) => sum + project.waterSupplies.reduce((sub, record) => sub + record.volumeM3, 0),
    0
  );
  const consumptionTotalM3 = projects.reduce(
    (sum, project) => sum + project.consumptionRecords.reduce((sub, record) => sub + record.volumeM3, 0),
    0
  );
  const unaccountedM3 = supplyTotalM3 - consumptionTotalM3;
  const unaccountedPercent = supplyTotalM3 > 0 ? (unaccountedM3 / supplyTotalM3) * 100 : 0;
  const assumedGroups = new Map<string, { count: number; velocity: number }>();
  for (const project of projects) {
    const assumedCount = project.consumptionRecords.filter((record) => record.usedAssumedVelocity).length;
    if (assumedCount > 0) assumedGroups.set(project.name, { count: assumedCount, velocity: project.assumedVelocityInPerSec });
  }
  const assumptions = Array.from(assumedGroups, ([name, value]) =>
    `${name}: ${value.count} record${value.count === 1 ? '' : 's'} used the project default velocity (${value.velocity.toFixed(2)} in/s).`
  );

  const columns: ReportColumn[] = [];
  const rows: ReportRow[] = [];
  const chartBuckets = new Map<string, { suppliedM3: number; consumedM3: number }>();

  if (params.type === 'DAILY_CONSUMPTION') {
    columns.push(
      { key: 'project', label: 'Project' },
      { key: 'date', label: 'Date' },
      { key: 'activity', label: 'Activity' },
      { key: 'method', label: 'Method' },
      { key: 'records', label: 'Records' },
      { key: 'volume', label: `Consumption (${params.unit})` }
    );
    const grouped = new Map<string, ReportRow>();
    for (const project of projects) {
      for (const supply of project.waterSupplies) {
        const date = dayString(supply.date);
        const bucket = chartBuckets.get(date) ?? { suppliedM3: 0, consumedM3: 0 };
        bucket.suppliedM3 += supply.volumeM3;
        chartBuckets.set(date, bucket);
      }
      for (const record of project.consumptionRecords) {
        const date = dayString(record.date);
        const key = [project.id, date, record.activityType.name, record.method].join('|');
        const row = grouped.get(key) ?? {
          project: project.name,
          date,
          activity: record.activityType.name,
          method: displayMethod(record.method),
          records: 0,
          volume: 0,
        };
        row.records = Number(row.records) + 1;
        row.volume = Number(row.volume) + formatVolume(record.volumeM3, params.unit);
        grouped.set(key, row);
        const bucket = chartBuckets.get(date) ?? { suppliedM3: 0, consumedM3: 0 };
        bucket.consumedM3 += record.volumeM3;
        chartBuckets.set(date, bucket);
      }
    }
    rows.push(...Array.from(grouped.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))));
  } else if (params.type === 'ACTIVITY_CONSUMPTION') {
    columns.push(
      { key: 'project', label: 'Project' },
      { key: 'period', label: `Period (${params.grouping})` },
      { key: 'activity', label: 'Activity' },
      { key: 'method', label: 'Method' },
      { key: 'records', label: 'Records' },
      { key: 'volume', label: `Consumption (${params.unit})` }
    );
    const grouped = new Map<string, ReportRow>();
    for (const project of projects) {
      for (const supply of project.waterSupplies) {
        const period = periodFor(supply.date, params.grouping);
        const chartKey = `${period} · ${project.name}`;
        const bucket = chartBuckets.get(chartKey) ?? { suppliedM3: 0, consumedM3: 0 };
        bucket.suppliedM3 += supply.volumeM3;
        chartBuckets.set(chartKey, bucket);
      }
      for (const record of project.consumptionRecords) {
        const period = periodFor(record.date, params.grouping);
        const key = [project.id, period, record.activityType.name, record.method].join('|');
        const row = grouped.get(key) ?? {
          project: project.name,
          period,
          activity: record.activityType.name,
          method: displayMethod(record.method),
          records: 0,
          volume: 0,
        };
        row.records = Number(row.records) + 1;
        row.volume = Number(row.volume) + formatVolume(record.volumeM3, params.unit);
        grouped.set(key, row);
        const bucket = chartBuckets.get(`${period} · ${project.name}`) ?? { suppliedM3: 0, consumedM3: 0 };
        bucket.consumedM3 += record.volumeM3;
        chartBuckets.set(`${period} · ${project.name}`, bucket);
      }
    }
    rows.push(...Array.from(grouped.values()).sort((a, b) => String(a.period).localeCompare(String(b.period))));
  } else if (params.type === 'WATER_BALANCE') {
    columns.push(
      { key: 'project', label: 'Project' },
      { key: 'period', label: `Period (${params.grouping})` },
      { key: 'supply', label: `Supply (${params.unit})` },
      { key: 'consumption', label: `Recorded consumption (${params.unit})` },
      { key: 'activityBreakdown', label: 'Consumption by activity' },
      { key: 'methodBreakdown', label: 'Consumption by method' },
      { key: 'unaccounted', label: `Unaccounted (${params.unit})` },
      { key: 'unaccountedPercent', label: 'Unaccounted (%)' },
      { key: 'alerts', label: 'Alerts summary' }
    );
    for (const project of projects) {
      const periods = new Map<string, {
        supplyM3: number;
        consumedM3: number;
        activities: Map<string, number>;
        methods: Map<string, number>;
      }>();
      for (const supply of project.waterSupplies) {
        const period = periodFor(supply.date, params.grouping);
        const bucket = periods.get(period) ?? { supplyM3: 0, consumedM3: 0, activities: new Map(), methods: new Map() };
        bucket.supplyM3 += supply.volumeM3;
        periods.set(period, bucket);
      }
      for (const record of project.consumptionRecords) {
        const period = periodFor(record.date, params.grouping);
        const bucket = periods.get(period) ?? { supplyM3: 0, consumedM3: 0, activities: new Map(), methods: new Map() };
        bucket.consumedM3 += record.volumeM3;
        bucket.activities.set(record.activityType.name, (bucket.activities.get(record.activityType.name) ?? 0) + record.volumeM3);
        const method = displayMethod(record.method);
        bucket.methods.set(method, (bucket.methods.get(method) ?? 0) + record.volumeM3);
        periods.set(period, bucket);
      }
      for (const alert of project.alerts) {
        const period = periodFor(alert.date, params.grouping);
        if (!periods.has(period)) {
          periods.set(period, { supplyM3: 0, consumedM3: 0, activities: new Map(), methods: new Map() });
        }
      }
      for (const [period, bucket] of Array.from(periods.entries()).sort(([a], [b]) => a.localeCompare(b))) {
        const unaccounted = bucket.supplyM3 - bucket.consumedM3;
        const alerts = project.alerts.filter((alert) => periodFor(alert.date, params.grouping) === period);
        const alertSummary = alerts.length
          ? `${alerts.length} alert(s): ${Array.from(new Set(alerts.map((alert) => `${alert.type} (${alert.severity})`))).join(', ')}`
          : 'None';
        rows.push({
          project: project.name,
          period,
          supply: formatVolume(bucket.supplyM3, params.unit),
          consumption: formatVolume(bucket.consumedM3, params.unit),
          activityBreakdown: Array.from(bucket.activities, ([name, volume]) => `${name}: ${formatVolume(volume, params.unit).toFixed(2)} ${params.unit}`).join('; ') || 'None',
          methodBreakdown: Array.from(bucket.methods, ([name, volume]) => `${name}: ${formatVolume(volume, params.unit).toFixed(2)} ${params.unit}`).join('; ') || 'None',
          unaccounted: formatVolume(unaccounted, params.unit),
          unaccountedPercent: bucket.supplyM3 > 0 ? (unaccounted / bucket.supplyM3) * 100 : 0,
          alerts: alertSummary,
        });
        const bucketForChart = chartBuckets.get(`${period} · ${project.name}`) ?? { suppliedM3: 0, consumedM3: 0 };
        bucketForChart.suppliedM3 += bucket.supplyM3;
        bucketForChart.consumedM3 += bucket.consumedM3;
        chartBuckets.set(`${period} · ${project.name}`, bucketForChart);
      }
    }
  } else {
    columns.push(
      { key: 'project', label: 'Project' },
      { key: 'recordType', label: 'Record type' },
      { key: 'date', label: 'Record date' },
      { key: 'recordId', label: 'Record ID' },
      { key: 'activityOrSource', label: 'Activity / source' },
      { key: 'method', label: 'Method / source' },
      { key: 'volume', label: `Volume (${params.unit})` },
      { key: 'assumedVelocity', label: 'Assumed velocity' },
      { key: 'inputs', label: 'Inputs' },
      { key: 'addedBy', label: 'Added by' },
      { key: 'enteredAt', label: 'Entered at' },
      { key: 'editHistory', label: 'Edit history' }
    );
    const records: Array<{
      id: string;
      projectId: string;
      project: string;
      recordType: string;
      date: Date;
      activityOrSource: string;
      method: string;
      volumeM3: number;
      assumedVelocity: string;
      inputs: string;
      addedBy: string;
      enteredAt: string;
    }> = [];
    for (const project of projects) {
      for (const record of project.waterSupplies) {
        records.push({
          id: record.id,
          projectId: project.id,
          project: project.name,
          recordType: 'Supply',
          date: record.date,
          activityOrSource: record.supplier || record.source,
          method: record.source,
          volumeM3: record.volumeM3,
          assumedVelocity: 'No',
          inputs: safeJson(JSON.stringify({
            source: record.source,
            enteredVolume: record.enteredVolume,
            enteredUnit: record.enteredUnit,
            supplier: record.supplier,
            referenceNo: record.referenceNo,
            notes: record.notes,
          })),
          addedBy: record.createdBy.name,
          enteredAt: record.createdAt.toISOString(),
        });
      }
      for (const record of project.consumptionRecords) {
        records.push({
          id: record.id,
          projectId: project.id,
          project: project.name,
          recordType: 'Consumption',
          date: record.date,
          activityOrSource: record.activityType.name,
          method: displayMethod(record.method),
          volumeM3: record.volumeM3,
          assumedVelocity: record.usedAssumedVelocity ? 'Yes' : 'No',
          inputs: safeJson(record.inputsJson),
          addedBy: record.createdBy.name,
          enteredAt: record.createdAt.toISOString(),
        });
      }
    }

    const currentIds = records.map((record) => record.id);
    const currentIdSet = new Set(currentIds);
    const deletionCandidates = await db.auditLog.findMany({
      where: {
        entity: { in: ['WaterSupply', 'ConsumptionRecord'] },
        action: { in: ['SUPPLY_DELETED', 'CONSUMPTION_DELETED'] },
      },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const deletedRecords = new Map<string, { log: (typeof deletionCandidates)[number]; data: Record<string, unknown> }>();
    for (const log of deletionCandidates) {
      if (!log.beforeJson) continue;
      try {
        const data = JSON.parse(log.beforeJson) as Record<string, unknown>;
        const deletedDate = new Date(String(data.date ?? ''));
        if (
          params.projectIds.includes(String(data.projectId ?? '')) &&
          Number.isFinite(deletedDate.getTime()) &&
          deletedDate >= dates.gte &&
          deletedDate <= dates.lte
        ) {
          deletedRecords.set(log.entityId, { log, data });
        }
      } catch (error) {
        console.error(`Skipping malformed deletion audit entry ${log.id}:`, error);
      }
    }
    const deletedCreatorIds = Array.from(new Set(
      Array.from(deletedRecords.values())
        .map(({ data }) => data.createdById)
        .filter((value): value is string => typeof value === 'string')
    ));
    const deletedCreators = deletedCreatorIds.length
      ? await db.user.findMany({
          where: { id: { in: deletedCreatorIds } },
          select: { id: true, name: true },
        })
      : [];
    const creatorNames = new Map(deletedCreators.map((creator) => [creator.id, creator.name]));
    const deletedAssumedCounts = new Map<string, number>();
    for (const [id, deleted] of deletedRecords) {
      if (currentIdSet.has(id)) continue;
      const { data, log } = deleted;
      const projectId = String(data.projectId ?? '');
      const project = projects.find((item) => item.id === projectId);
      if (data.usedAssumedVelocity && project) {
        deletedAssumedCounts.set(project.name, (deletedAssumedCounts.get(project.name) ?? 0) + 1);
      }
      records.push({
        id,
        projectId,
        project: project?.name ?? 'Project',
        recordType: log.entity === 'WaterSupply' ? 'Deleted supply' : 'Deleted consumption',
        date: new Date(String(data.date)),
        activityOrSource: String(data.supplier ?? data.source ?? data.activityTypeId ?? 'Deleted record'),
        method: String(data.method ?? data.source ?? '—'),
        volumeM3: Number(data.volumeM3 ?? 0),
        assumedVelocity: data.usedAssumedVelocity ? 'Yes' : 'No',
        inputs: safeJson(log.beforeJson),
        addedBy: creatorNames.get(String(data.createdById ?? '')) ?? 'Unknown',
        enteredAt: typeof data.createdAt === 'string' ? data.createdAt : '',
      });
    }
    for (const [projectName, count] of deletedAssumedCounts) {
      assumptions.push(`${projectName}: ${count} deleted record${count === 1 ? '' : 's'} in this audit period used assumed velocity.`);
    }
    const reportRecordIds = records.map((record) => record.id);
    const logs = await db.auditLog.findMany({
      where: {
        entity: { in: ['WaterSupply', 'ConsumptionRecord'] },
        entityId: { in: reportRecordIds },
      },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const recordLogs = new Map<string, string[]>();
    for (const log of logs) {
      const before = safeJson(log.beforeJson);
      const after = safeJson(log.afterJson);
      const change = `${displayAction(log.action)} — ${log.user.name} at ${log.createdAt.toISOString()}${before || after ? `; before: ${before || '—'}; after: ${after || '—'}` : ''}`;
      const history = recordLogs.get(log.entityId) ?? [];
      history.push(change);
      recordLogs.set(log.entityId, history);
    }
    for (const record of records.sort((a, b) => a.date.getTime() - b.date.getTime())) {
      rows.push({
        project: record.project,
        recordType: record.recordType,
        date: dayString(record.date),
        recordId: record.id,
        activityOrSource: record.activityOrSource,
        method: record.method,
        volume: formatVolume(record.volumeM3, params.unit),
        assumedVelocity: record.assumedVelocity,
        inputs: record.inputs,
        addedBy: record.addedBy,
        enteredAt: record.enteredAt,
        editHistory: (recordLogs.get(record.id) ?? []).join('\n') || 'No audit events available',
      });
    }
  }

  const chartData = Array.from(chartBuckets.entries())
    .map(([label, values]) => ({ label, ...values }))
    .slice(0, 24);
  const formatKpiVolume = (volumeM3: number) =>
    `${formatVolume(volumeM3, params.unit).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${params.unit}`;
  const kpis = [
    { label: 'Supplied', value: formatKpiVolume(supplyTotalM3) },
    { label: 'Recorded consumption', value: formatKpiVolume(consumptionTotalM3) },
    { label: 'Unaccounted water', value: `${formatKpiVolume(unaccountedM3)} (${unaccountedPercent.toFixed(2)}%)` },
    { label: 'Consumption records', value: String(projects.reduce((count, project) => count + project.consumptionRecords.length, 0)) },
    { label: 'Alerts', value: String(projects.reduce((count, project) => count + project.alerts.length, 0)) },
  ];

  return {
    type: params.type,
    title: TITLES[params.type],
    projectNames: projects.map((project) => project.name),
    from: params.from,
    to: params.to,
    generatedBy,
    generatedAt: generatedAt.toISOString(),
    unit: params.unit,
    includeCharts: params.includeCharts,
    columns,
    rows,
    kpis,
    chartData,
    assumptions,
    disclaimer: DISCLAIMER,
  };
}

function safeSpreadsheetText(value: string): string {
  return /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: ReportCell): string {
  const safeValue = typeof value === 'string' ? safeSpreadsheetText(value) : value;
  const normalized = String(safeValue);
  return `"${normalized.replaceAll('"', '""')}"`;
}

export function reportCsv(snapshot: ReportSnapshot): string {
  const header = snapshot.columns.map((column) => csvCell(column.label)).join(',');
  const rows = snapshot.rows.map((row) =>
    snapshot.columns.map((column) => csvCell(row[column.key] ?? '')).join(',')
  );
  const footer = [csvCell(snapshot.disclaimer), ...snapshot.columns.slice(1).map(() => csvCell(''))].join(',');
  return `\uFEFF${[header, ...rows, footer].join('\r\n')}`;
}

export async function reportXlsx(snapshot: ReportSnapshot): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = snapshot.generatedBy;
  workbook.created = new Date(snapshot.generatedAt);
  const sheet = workbook.addWorksheet(snapshot.title.slice(0, 31));
  sheet.addRow([snapshot.title]);
  sheet.addRow([`Projects: ${snapshot.projectNames.join(', ')}`]);
  sheet.addRow([`Date range: ${snapshot.from} to ${snapshot.to}`]);
  sheet.addRow([`Generated by: ${snapshot.generatedBy} · ${snapshot.generatedAt}`]);
  sheet.addRow([]);
  sheet.addRow(snapshot.columns.map((column) => column.label));
  const headerRow = sheet.lastRow;
  if (headerRow) {
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075985' } };
    headerRow.alignment = { vertical: 'middle', wrapText: true };
  }
  for (const row of snapshot.rows) {
    sheet.addRow(snapshot.columns.map((column) => {
      const value = row[column.key] ?? '';
      return typeof value === 'string' ? safeSpreadsheetText(value) : value;
    }));
  }
  const footerRow = sheet.addRow([snapshot.disclaimer]);
  sheet.mergeCells(footerRow.number, 1, footerRow.number, snapshot.columns.length);
  footerRow.font = { italic: true, color: { argb: 'FF475569' } };
  sheet.columns.forEach((column) => {
    let width = 12;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      width = Math.max(width, Math.min(44, String(cell.value ?? '').length + 2));
    });
    column.width = width;
  });
  sheet.views = [{ state: 'frozen', ySplit: 6 }];
  const summary = workbook.addWorksheet('Summary');
  summary.addRows([
    ['KPI', 'Value'],
    ...snapshot.kpis.map((kpi) => [kpi.label, safeSpreadsheetText(kpi.value)]),
    [],
    ['Assumptions'],
    ...(snapshot.assumptions.length ? snapshot.assumptions.map((assumption) => [safeSpreadsheetText(assumption)]) : [['No assumed velocity used.']]),
    [],
    [snapshot.disclaimer],
  ]);
  summary.getRow(1).font = { bold: true };
  summary.columns = [{ width: 34 }, { width: 58 }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const pdfStyles = StyleSheet.create({
  page: { padding: 34, paddingBottom: 58, fontFamily: 'Helvetica', fontSize: 8, color: '#0f172a' },
  header: { borderBottomWidth: 2, borderBottomColor: '#0284c7', paddingBottom: 12, marginBottom: 14 },
  brand: { fontSize: 8, color: '#0284c7', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 5 },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  meta: { fontSize: 8, color: '#475569', marginBottom: 3 },
  kpis: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  kpi: { flexGrow: 1, flexBasis: 0, padding: 8, backgroundColor: '#f1f5f9', borderRadius: 4 },
  kpiLabel: { color: '#64748b', fontSize: 7, marginBottom: 4 },
  kpiValue: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  section: { fontFamily: 'Helvetica-Bold', fontSize: 11, marginTop: 8, marginBottom: 7 },
  chartRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  chartLabel: { width: 112, fontSize: 7, color: '#475569' },
  chartTrack: { flexGrow: 1, height: 7, backgroundColor: '#e2e8f0', marginRight: 4 },
  chartSupply: { height: 7, backgroundColor: '#0284c7' },
  chartConsumption: { height: 7, backgroundColor: '#14b8a6' },
  chartLegend: { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 10 },
  legendText: { fontSize: 7, color: '#475569' },
  table: { marginTop: 6 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#0c4a6e', color: '#ffffff', padding: 5 },
  tableRow: { flexDirection: 'row', padding: 5, borderBottomWidth: 0.5, borderBottomColor: '#cbd5e1' },
  cell: { fontSize: 6.5, paddingRight: 3 },
  assumptions: { fontSize: 8, marginBottom: 4, color: '#92400e' },
  footer: { position: 'absolute', bottom: 20, left: 34, right: 34, borderTopWidth: 0.5, borderTopColor: '#cbd5e1', paddingTop: 6 },
  disclaimer: { fontSize: 7, color: '#475569', marginBottom: 4 },
  pageNumber: { fontSize: 7, color: '#64748b', textAlign: 'right' },
});

function PdfDocument({ snapshot }: { snapshot: ReportSnapshot }) {
  const chartMax = Math.max(1, ...snapshot.chartData.map((entry) => Math.max(entry.suppliedM3, entry.consumedM3)));
  const colWidth = `${100 / Math.max(1, snapshot.columns.length)}%` as `${number}%`;
  const chart = snapshot.includeCharts && snapshot.chartData.length > 0;
  return (
    <Document title={snapshot.title} author={snapshot.generatedBy} subject={`${snapshot.from} to ${snapshot.to}`}>
      <Page size="A4" orientation="landscape" style={pdfStyles.page} wrap>
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.brand}>HydroTrack · Water Management</Text>
          <Text style={pdfStyles.title}>{snapshot.title}</Text>
          <Text style={pdfStyles.meta}>Project: {snapshot.projectNames.join(', ')}</Text>
          <Text style={pdfStyles.meta}>Date range: {snapshot.from} to {snapshot.to}</Text>
          <Text style={pdfStyles.meta}>Generated by {snapshot.generatedBy} · {new Date(snapshot.generatedAt).toLocaleString()}</Text>
        </View>
        <View style={pdfStyles.kpis}>
          {snapshot.kpis.map((kpi) => (
            <View key={kpi.label} style={pdfStyles.kpi}>
              <Text style={pdfStyles.kpiLabel}>{kpi.label}</Text>
              <Text style={pdfStyles.kpiValue}>{kpi.value}</Text>
            </View>
          ))}
        </View>
        {chart && (
          <View>
            <Text style={pdfStyles.section}>Volume by period</Text>
            {snapshot.chartData.map((entry) => (
              <View key={entry.label} style={pdfStyles.chartRow} wrap={false}>
                <Text style={pdfStyles.chartLabel}>{entry.label}</Text>
                <View style={pdfStyles.chartTrack}>
                  <View style={{ ...pdfStyles.chartSupply, width: `${(entry.suppliedM3 / chartMax) * 100}%` }} />
                </View>
                <View style={pdfStyles.chartTrack}>
                  <View style={{ ...pdfStyles.chartConsumption, width: `${(entry.consumedM3 / chartMax) * 100}%` }} />
                </View>
              </View>
            ))}
            <View style={pdfStyles.chartLegend}>
              <Text style={pdfStyles.legendText}>Blue: supplied ({snapshot.unit})</Text>
              <Text style={pdfStyles.legendText}>Teal: recorded consumption ({snapshot.unit})</Text>
            </View>
          </View>
        )}
        <Text style={pdfStyles.section}>Report data</Text>
        <View style={pdfStyles.table}>
          <View style={pdfStyles.tableHeader} fixed>
            {snapshot.columns.map((column) => (
              <Text key={column.key} style={{ ...pdfStyles.cell, width: colWidth, fontFamily: 'Helvetica-Bold' }}>{column.label}</Text>
            ))}
          </View>
          {snapshot.rows.map((row, index) => (
            <View key={`${String(row.recordId ?? row.date ?? row.period ?? index)}-${index}`} style={index % 2 ? { ...pdfStyles.tableRow, backgroundColor: '#f8fafc' } : pdfStyles.tableRow} wrap={false}>
              {snapshot.columns.map((column) => (
                <Text key={column.key} style={{ ...pdfStyles.cell, width: colWidth }}>{String(row[column.key] ?? '')}</Text>
              ))}
            </View>
          ))}
          {snapshot.rows.length === 0 && <Text style={pdfStyles.meta}>No records match this date range.</Text>}
        </View>
        <Text style={pdfStyles.section}>Assumptions</Text>
        {snapshot.assumptions.length
          ? snapshot.assumptions.map((assumption) => <Text key={assumption} style={pdfStyles.assumptions}>{assumption}</Text>)
          : <Text style={pdfStyles.meta}>No assumed velocity was used in this report.</Text>}
        <View style={pdfStyles.footer} fixed>
          <Text style={pdfStyles.disclaimer}>{snapshot.disclaimer}</Text>
          <Text
            style={pdfStyles.pageNumber}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

export async function reportPdf(snapshot: ReportSnapshot): Promise<Buffer> {
  return Buffer.from(await renderToBuffer(<PdfDocument snapshot={snapshot} />));
}

export function reportFileName(snapshot: ReportSnapshot, format: ReportFormat): string {
  const project = snapshot.projectNames.length === 1
    ? snapshot.projectNames[0].replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '')
    : 'multi-project';
  return `${project}-${snapshot.type.toLowerCase()}-${snapshot.from}-to-${snapshot.to}.${format}`;
}
