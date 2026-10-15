'use server';

import prisma from '@/lib/prisma';
import { requireUser, getAccessibleProjectIds } from '@/lib/auth-helpers';
import { canAccessProject } from '@/lib/rbac';
import { startOfWeek, format, subDays, differenceInCalendarDays } from 'date-fns';

export interface ActivityTimeSeriesPoint {
  period: string; // e.g. "2026-03-01", "W10 2026", "Mar 2026"
  sortKey: string;
  total: number;
  [activityName: string]: string | number;
}

export interface ActivityRankingItem {
  id: string;
  name: string;
  color: string;
  totalVolume: number;
  sharePercent: number;
  wowChangePercent: number | null;
  avgPerDay: number;
  peakDay: {
    date: string;
    volume: number;
  };
  recordCount: number;
}

export interface MethodBreakdownItem {
  method: 'FLOW_METER' | 'PIPE' | 'DIRECT';
  label: string;
  volumeM3: number;
  sharePercent: number;
  recordsCount: number;
  usedAssumedCount: number;
  assumedPercent: number;
}

export interface CalendarHeatmapDay {
  date: string;
  volume: number;
  level: 0 | 1 | 2 | 3 | 4;
  recordCount: number;
}

export interface DayOfWeekStat {
  dayName: string;
  dayIndex: number;
  totalVolume: number;
  avgVolume: number;
  daysCount: number;
}

export interface ProjectCompareItem {
  projectId: string;
  projectName: string;
  location: string;
  status: string;
  totalSuppliedM3: number;
  totalConsumedM3: number;
  unaccountedM3: number;
  unaccountedPercent: number;
  activeDays: number;
  normalizedPerActiveDay: number;
  assumedVelocityPercent: number;
  openAlertsCount: number;
}

export interface AnalyticsData {
  projectId: string;
  projectName: string;
  projectLocation: string;
  totalSuppliedM3: number;
  totalConsumedM3: number;
  unaccountedM3: number;
  unaccountedPercent: number;
  unaccountedStatus: 'OK' | 'ATTENTION' | 'DATA_CHECK';
  totalDays: number;
  activeDays: number;
  activities: Array<{ id: string; name: string; color: string }>;
  activityDaily: ActivityTimeSeriesPoint[];
  activityWeekly: ActivityTimeSeriesPoint[];
  activityMonthly: ActivityTimeSeriesPoint[];
  activityRanking: ActivityRankingItem[];
  methodBreakdown: MethodBreakdownItem[];
  assumedVelocityHeavy: boolean;
  heatmapCalendar: CalendarHeatmapDay[];
  dayOfWeekStats: DayOfWeekStat[];
  projectComparison: ProjectCompareItem[];
  canViewCompare: boolean;
}

export async function getAnalyticsDataAction(projectId?: string): Promise<AnalyticsData> {
  const user = await requireUser();
  const accessibleProjectIds = await getAccessibleProjectIds(user);

  if (accessibleProjectIds.length === 0) {
    throw new Error('No accessible projects found.');
  }

  // Determine current project
  let targetProjectId = projectId;
  if (!targetProjectId || !accessibleProjectIds.includes(targetProjectId)) {
    targetProjectId = accessibleProjectIds[0];
  }

  if (!canAccessProject(user, targetProjectId, accessibleProjectIds)) {
    throw new Error('403 Forbidden: You do not have access to this project.');
  }

  const project = await prisma.project.findUnique({
    where: { id: targetProjectId },
  });

  if (!project) {
    throw new Error('Project not found.');
  }

  // Fetch all supplies and consumption for the project
  const [supplies, consumption, activityTypes] = await Promise.all([
    prisma.waterSupply.findMany({
      where: { projectId: targetProjectId },
      orderBy: { date: 'asc' },
    }),
    prisma.consumptionRecord.findMany({
      where: { projectId: targetProjectId },
      orderBy: { date: 'asc' },
      include: { activityType: true },
    }),
    prisma.activityType.findMany({
      where: {
        OR: [{ projectId: targetProjectId }, { projectId: null }],
        active: true,
      },
      select: { id: true, name: true, color: true },
    }),
  ]);

  const totalSuppliedM3 = supplies.reduce((acc, s) => acc + s.volumeM3, 0);
  const totalConsumedM3 = consumption.reduce((acc, c) => acc + c.volumeM3, 0);
  const unaccountedM3 = totalSuppliedM3 - totalConsumedM3;
  const unaccountedPercent = totalSuppliedM3 > 0 ? (unaccountedM3 / totalSuppliedM3) * 100 : 0;

  let unaccountedStatus: 'OK' | 'ATTENTION' | 'DATA_CHECK' = 'OK';
  if (totalConsumedM3 > totalSuppliedM3) {
    unaccountedStatus = 'DATA_CHECK';
  } else if (unaccountedPercent > project.unaccountedThresholdPercent) {
    unaccountedStatus = 'ATTENTION';
  }

  // Active days: unique dates with consumption
  const uniqueDates = new Set<string>();
  consumption.forEach((c) => {
    uniqueDates.add(c.date.toISOString().slice(0, 10));
  });
  const activeDays = uniqueDates.size || 1;

  // Date span
  let minDate = consumption.length > 0 ? consumption[0].date : new Date();
  let maxDate = consumption.length > 0 ? consumption[consumption.length - 1].date : new Date();
  if (supplies.length > 0) {
    if (supplies[0].date < minDate) minDate = supplies[0].date;
    if (supplies[supplies.length - 1].date > maxDate) maxDate = supplies[supplies.length - 1].date;
  }
  const totalDays = Math.max(1, differenceInCalendarDays(maxDate, minDate) + 1);

  // Activity list lookup
  const actNameMap = new Map<string, { name: string; color: string }>();
  activityTypes.forEach((a) => actNameMap.set(a.id, { name: a.name, color: a.color }));
  // Ensure all activities referenced in records are mapped
  consumption.forEach((c) => {
    if (!actNameMap.has(c.activityTypeId)) {
      actNameMap.set(c.activityTypeId, {
        name: c.activityType.name,
        color: c.activityType.color || '#64748b',
      });
    }
  });

  const activeActivities = Array.from(actNameMap.entries()).map(([id, info]) => ({
    id,
    name: info.name,
    color: info.color,
  }));

  // 1. Grouping: Day, Week, Month for Stacked Area Charts
  type GroupBucket = { total: number; label: string; activities: Record<string, number> };
  const dailyMap = new Map<string, { total: number; activities: Record<string, number> }>();
  const weeklyMap = new Map<string, GroupBucket>();
  const monthlyMap = new Map<string, GroupBucket>();

  // Activity ranking helpers
  const activityTotals = new Map<string, number>();
  const activityDailyTotals = new Map<string, Map<string, number>>();
  const activityRecordCounts = new Map<string, number>();

  // WoW helper: last 7 days vs previous 7 days (relative to maxDate)
  const last7Start = subDays(maxDate, 6);
  const prev7Start = subDays(maxDate, 13);
  const activityLast7 = new Map<string, number>();
  const activityPrev7 = new Map<string, number>();

  consumption.forEach((c) => {
    const act = actNameMap.get(c.activityTypeId)?.name || 'Other';
    const dayKey = c.date.toISOString().slice(0, 10);
    const weekStart = startOfWeek(c.date, { weekStartsOn: 1 });
    const weekKey = format(weekStart, 'yyyy-MM-dd');
    const weekLabel = `Wk ${format(weekStart, 'w, yyyy')}`;
    const monthKey = format(c.date, 'yyyy-MM');
    const monthLabel = format(c.date, 'MMM yyyy');

    // Daily
    if (!dailyMap.has(dayKey)) dailyMap.set(dayKey, { total: 0, activities: {} });
    const dObj = dailyMap.get(dayKey)!;
    dObj.total += c.volumeM3;
    dObj.activities[act] = (dObj.activities[act] || 0) + c.volumeM3;

    // Weekly
    if (!weeklyMap.has(weekKey)) weeklyMap.set(weekKey, { total: 0, label: weekLabel, activities: {} });
    const wObj = weeklyMap.get(weekKey)!;
    wObj.total += c.volumeM3;
    wObj.activities[act] = (wObj.activities[act] || 0) + c.volumeM3;

    // Monthly
    if (!monthlyMap.has(monthKey)) monthlyMap.set(monthKey, { total: 0, label: monthLabel, activities: {} });
    const mObj = monthlyMap.get(monthKey)!;
    mObj.total += c.volumeM3;
    mObj.activities[act] = (mObj.activities[act] || 0) + c.volumeM3;

    // Activity stats
    activityTotals.set(c.activityTypeId, (activityTotals.get(c.activityTypeId) || 0) + c.volumeM3);
    activityRecordCounts.set(c.activityTypeId, (activityRecordCounts.get(c.activityTypeId) || 0) + 1);

    if (!activityDailyTotals.has(c.activityTypeId)) {
      activityDailyTotals.set(c.activityTypeId, new Map());
    }
    const actDays = activityDailyTotals.get(c.activityTypeId)!;
    actDays.set(dayKey, (actDays.get(dayKey) || 0) + c.volumeM3);

    // WoW
    if (c.date >= last7Start && c.date <= maxDate) {
      activityLast7.set(c.activityTypeId, (activityLast7.get(c.activityTypeId) || 0) + c.volumeM3);
    } else if (c.date >= prev7Start && c.date < last7Start) {
      activityPrev7.set(c.activityTypeId, (activityPrev7.get(c.activityTypeId) || 0) + c.volumeM3);
    }
  });

  const activityDaily: ActivityTimeSeriesPoint[] = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => {
      const point: ActivityTimeSeriesPoint = {
        period: date,
        sortKey: date,
        total: Math.round(data.total * 100) / 100,
      };
      activeActivities.forEach((act) => {
        point[act.name] = Math.round((data.activities[act.name] || 0) * 100) / 100;
      });
      return point;
    });

  const activityWeekly: ActivityTimeSeriesPoint[] = Array.from(weeklyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => {
      const point: ActivityTimeSeriesPoint = {
        period: data.label,
        sortKey: key,
        total: Math.round(data.total * 100) / 100,
      };
      activeActivities.forEach((act) => {
        point[act.name] = Math.round((data.activities[act.name] || 0) * 100) / 100;
      });
      return point;
    });

  const activityMonthly: ActivityTimeSeriesPoint[] = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, data]) => {
      const point: ActivityTimeSeriesPoint = {
        period: data.label,
        sortKey: key,
        total: Math.round(data.total * 100) / 100,
      };
      activeActivities.forEach((act) => {
        point[act.name] = Math.round((data.activities[act.name] || 0) * 100) / 100;
      });
      return point;
    });

  // Ranking table
  const activityRanking: ActivityRankingItem[] = activeActivities
    .map((act) => {
      const totalVolume = activityTotals.get(act.id) || 0;
      const sharePercent = totalConsumedM3 > 0 ? (totalVolume / totalConsumedM3) * 100 : 0;
      const actDays = activityDailyTotals.get(act.id);
      let peakDay = { date: 'N/A', volume: 0 };
      if (actDays) {
        for (const [date, vol] of actDays.entries()) {
          if (vol > peakDay.volume) {
            peakDay = { date, volume: vol };
          }
        }
      }

      const last7 = activityLast7.get(act.id) || 0;
      const prev7 = activityPrev7.get(act.id) || 0;
      let wowChangePercent: number | null = null;
      if (prev7 > 0) {
        wowChangePercent = ((last7 - prev7) / prev7) * 100;
      } else if (last7 > 0) {
        wowChangePercent = 100;
      }

      const avgPerDay = totalDays > 0 ? totalVolume / totalDays : 0;

      return {
        id: act.id,
        name: act.name,
        color: act.color,
        totalVolume: Math.round(totalVolume * 100) / 100,
        sharePercent: Math.round(sharePercent * 10) / 10,
        wowChangePercent: wowChangePercent !== null ? Math.round(wowChangePercent * 10) / 10 : null,
        avgPerDay: Math.round(avgPerDay * 100) / 100,
        peakDay: {
          date: peakDay.date,
          volume: Math.round(peakDay.volume * 100) / 100,
        },
        recordCount: activityRecordCounts.get(act.id) || 0,
      };
    })
    .sort((a, b) => b.totalVolume - a.totalVolume);

  // 2. Method Breakdown
  const methodStats = {
    FLOW_METER: { volume: 0, count: 0, usedAssumed: 0 },
    PIPE: { volume: 0, count: 0, usedAssumed: 0 },
    DIRECT: { volume: 0, count: 0, usedAssumed: 0 },
  };

  consumption.forEach((c) => {
    const s = methodStats[c.method];
    if (s) {
      s.volume += c.volumeM3;
      s.count += 1;
      if (c.usedAssumedVelocity) s.usedAssumed += 1;
    }
  });

  const methodBreakdown: MethodBreakdownItem[] = [
    {
      method: 'FLOW_METER',
      label: 'Flow Meter (Direct Telemetry)',
      volumeM3: Math.round(methodStats.FLOW_METER.volume * 100) / 100,
      sharePercent: totalConsumedM3 > 0 ? Math.round((methodStats.FLOW_METER.volume / totalConsumedM3) * 1000) / 10 : 0,
      recordsCount: methodStats.FLOW_METER.count,
      usedAssumedCount: 0,
      assumedPercent: 0,
    },
    {
      method: 'PIPE',
      label: 'Pipe Discharge Calculation',
      volumeM3: Math.round(methodStats.PIPE.volume * 100) / 100,
      sharePercent: totalConsumedM3 > 0 ? Math.round((methodStats.PIPE.volume / totalConsumedM3) * 1000) / 10 : 0,
      recordsCount: methodStats.PIPE.count,
      usedAssumedCount: methodStats.PIPE.usedAssumed,
      assumedPercent:
        methodStats.PIPE.count > 0
          ? Math.round((methodStats.PIPE.usedAssumed / methodStats.PIPE.count) * 1000) / 10
          : 0,
    },
    {
      method: 'DIRECT',
      label: 'Direct Volume Entry',
      volumeM3: Math.round(methodStats.DIRECT.volume * 100) / 100,
      sharePercent: totalConsumedM3 > 0 ? Math.round((methodStats.DIRECT.volume / totalConsumedM3) * 1000) / 10 : 0,
      recordsCount: methodStats.DIRECT.count,
      usedAssumedCount: 0,
      assumedPercent: 0,
    },
  ];

  const assumedVelocityHeavy = methodBreakdown[1].assumedPercent > 30;

  // 3. Time Breakdown: Heatmap Calendar & Day of Week
  const dayVolumes = new Map<string, { volume: number; count: number }>();
  let maxDailyVolume = 0;

  consumption.forEach((c) => {
    const day = c.date.toISOString().slice(0, 10);
    const cur = dayVolumes.get(day) || { volume: 0, count: 0 };
    cur.volume += c.volumeM3;
    cur.count += 1;
    dayVolumes.set(day, cur);
    if (cur.volume > maxDailyVolume) maxDailyVolume = cur.volume;
  });

  const heatmapCalendar: CalendarHeatmapDay[] = Array.from(dayVolumes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { volume, count }]) => {
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (volume > 0 && maxDailyVolume > 0) {
        const ratio = volume / maxDailyVolume;
        if (ratio > 0.75) level = 4;
        else if (ratio > 0.5) level = 3;
        else if (ratio > 0.25) level = 2;
        else level = 1;
      }
      return {
        date,
        volume: Math.round(volume * 100) / 100,
        level,
        recordCount: count,
      };
    });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dowTotals = dayNames.map((name, i) => ({
    dayName: name,
    dayIndex: i,
    totalVolume: 0,
    count: 0,
    uniqueDays: new Set<string>(),
  }));

  consumption.forEach((c) => {
    const dow = c.date.getUTCDay();
    dowTotals[dow].totalVolume += c.volumeM3;
    dowTotals[dow].count += 1;
    dowTotals[dow].uniqueDays.add(c.date.toISOString().slice(0, 10));
  });

  // Start with Monday (1) through Sunday (0)
  const orderedDowIndices = [1, 2, 3, 4, 5, 6, 0];
  const dayOfWeekStats: DayOfWeekStat[] = orderedDowIndices.map((i) => {
    const d = dowTotals[i];
    const daysCount = d.uniqueDays.size || 1;
    return {
      dayName: d.dayName,
      dayIndex: i,
      totalVolume: Math.round(d.totalVolume * 100) / 100,
      avgVolume: Math.round((d.totalVolume / daysCount) * 100) / 100,
      daysCount: d.uniqueDays.size,
    };
  });

  // 4. Compare Tab: Project comparison normalized per active day
  // Accessible to Project Managers and Auditors only
  const canViewCompare = user.role === 'PROJECT_MANAGER' || user.role === 'AUDITOR';
  let projectComparison: ProjectCompareItem[] = [];

  if (canViewCompare) {
    const allProjects = await prisma.project.findMany({
      where: { id: { in: accessibleProjectIds } },
      include: {
        waterSupplies: { select: { volumeM3: true } },
        consumptionRecords: {
          select: {
            volumeM3: true,
            date: true,
            method: true,
            usedAssumedVelocity: true,
          },
        },
        alerts: {
          where: { status: 'OPEN' },
          select: { id: true },
        },
      },
    });

    projectComparison = allProjects.map((p) => {
      const pSupplied = p.waterSupplies.reduce((acc, supply) => acc + supply.volumeM3, 0);
      const pConsumed = p.consumptionRecords.reduce((acc, record) => acc + record.volumeM3, 0);
      const pUnaccounted = pSupplied - pConsumed;
      const pUnaccountedPercent = pSupplied > 0 ? (pUnaccounted / pSupplied) * 100 : 0;

      const pActiveDates = new Set(p.consumptionRecords.map((record) => record.date.toISOString().slice(0, 10)));
      const pActiveDays = pActiveDates.size || 1;
      const normalizedPerActiveDay = pConsumed / pActiveDays;

      const pipeRecords = p.consumptionRecords.filter((record) => record.method === 'PIPE');
      const assumedPipeRecords = pipeRecords.filter((record) => record.usedAssumedVelocity);
      const assumedVelocityPercent =
        pipeRecords.length > 0 ? (assumedPipeRecords.length / pipeRecords.length) * 100 : 0;

      return {
        projectId: p.id,
        projectName: p.name,
        location: p.location,
        status: p.status,
        totalSuppliedM3: Math.round(pSupplied * 100) / 100,
        totalConsumedM3: Math.round(pConsumed * 100) / 100,
        unaccountedM3: Math.round(pUnaccounted * 100) / 100,
        unaccountedPercent: Math.round(pUnaccountedPercent * 10) / 10,
        activeDays: pActiveDates.size,
        normalizedPerActiveDay: Math.round(normalizedPerActiveDay * 100) / 100,
        assumedVelocityPercent: Math.round(assumedVelocityPercent * 10) / 10,
        openAlertsCount: p.alerts.length,
      };
    });
  }

  return {
    projectId: project.id,
    projectName: project.name,
    projectLocation: project.location,
    totalSuppliedM3: Math.round(totalSuppliedM3 * 100) / 100,
    totalConsumedM3: Math.round(totalConsumedM3 * 100) / 100,
    unaccountedM3: Math.round(unaccountedM3 * 100) / 100,
    unaccountedPercent: Math.round(unaccountedPercent * 10) / 10,
    unaccountedStatus,
    totalDays,
    activeDays,
    activities: activeActivities,
    activityDaily,
    activityWeekly,
    activityMonthly,
    activityRanking,
    methodBreakdown,
    assumedVelocityHeavy,
    heatmapCalendar,
    dayOfWeekStats,
    projectComparison,
    canViewCompare,
  };
}
