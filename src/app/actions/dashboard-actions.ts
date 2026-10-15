'use server';

import prisma from '@/lib/prisma';
import { requireUser, getAccessibleProjectIds } from '@/lib/auth-helpers';
import { canAccessProject } from '@/lib/rbac';
import { getWaterBalance } from '@/lib/water-service';

export interface DashboardAlert {
  id: string;
  date: string;
  severity: 'ATTENTION' | 'DATA_CHECK';
  title: string;
  description: string;
}

export interface RecentRecord {
  id: string;
  date: string;
  type: 'SUPPLY' | 'CONSUMPTION';
  methodOrSource: string;
  activityOrSupplier: string;
  volumeM3: number;
  usedAssumedVelocity?: boolean;
}

export interface DashboardDataResult {
  project: {
    id: string;
    name: string;
    location: string;
    clientName: string | null;
    unaccountedThresholdPercent: number;
    assumedVelocityInPerSec: number;
  };
  current: {
    from: string;
    to: string;
    suppliedM3: number;
    consumedM3: number;
    unaccountedM3: number;
    unaccountedPercent: number;
    status: 'OK' | 'ATTENTION' | 'DATA_CHECK';
    activeAlertsCount: number;
    byActivity: Array<{
      activityTypeId: string;
      activityName: string;
      volumeM3: number;
      color: string;
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
      unaccountedM3: number;
      unaccountedPercent: number;
      status: 'OK' | 'ATTENTION' | 'DATA_CHECK';
    }>;
  };
  previous?: {
    from: string;
    to: string;
    suppliedM3: number;
    consumedM3: number;
    unaccountedM3: number;
    unaccountedPercent: number;
    status: 'OK' | 'ATTENTION' | 'DATA_CHECK';
    activeAlertsCount: number;
  };
  deltas?: {
    suppliedM3: number;
    suppliedPercent: number;
    consumedM3: number;
    consumedPercent: number;
    unaccountedM3: number;
    unaccountedPercentDiff: number;
    alertsDiff: number;
  };
  alerts: DashboardAlert[];
  recentRecords: RecentRecord[];
  dataQuality: {
    totalConsumptionRecords: number;
    assumedVelocityRecords: number;
    assumedVelocityPercent: number;
    daysWithNoConsumption: number;
    daysConsumptionExceededSupply: number;
    totalDaysInPeriod: number;
  };
}

export async function getDashboardDataAction(
  projectId: string,
  fromIso: string,
  toIso: string,
  compareFromIso?: string,
  compareToIso?: string
): Promise<DashboardDataResult> {
  const user = await requireUser();

  const accessibleIds = await getAccessibleProjectIds(user);
  if (!canAccessProject(user, projectId, accessibleIds)) {
    throw new Error('403 Forbidden: You do not have access to this project.');
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      activityTypes: true,
    },
  });

  if (!project) {
    throw new Error('Project not found.');
  }

  const fromDate = new Date(fromIso);
  const toDate = new Date(toIso);

  // 1. Fetch current water balance via engine service
  const currentBalance = await getWaterBalance(projectId, fromDate, toDate);

  // Map activity colors
  const activityColorMap = new Map<string, string>();
  project.activityTypes.forEach((a) => activityColorMap.set(a.id, a.color));

  const byActivityWithColors = currentBalance.byActivity.map((a) => ({
    ...a,
    color: activityColorMap.get(a.activityTypeId) || '#0284c7',
  }));

  // Build daily stats with unaccounted % and status
  const dailyWithStats = currentBalance.daily.map((d) => {
    const unacc = d.suppliedM3 - d.consumedM3;
    const pct = d.suppliedM3 > 0 ? (unacc / d.suppliedM3) * 100 : 0;
    let dayStatus: 'OK' | 'ATTENTION' | 'DATA_CHECK' = 'OK';

    if (d.consumedM3 > d.suppliedM3) {
      dayStatus = 'DATA_CHECK';
    } else if (pct > project.unaccountedThresholdPercent) {
      dayStatus = 'ATTENTION';
    }

    return {
      date: d.date,
      suppliedM3: d.suppliedM3,
      consumedM3: d.consumedM3,
      unaccountedM3: unacc,
      unaccountedPercent: pct,
      status: dayStatus,
    };
  });

  // Extract alerts from daily data
  const alerts: DashboardAlert[] = [];
  dailyWithStats.forEach((d) => {
    if (d.status === 'DATA_CHECK') {
      alerts.push({
        id: `alert-dc-${d.date}`,
        date: d.date,
        severity: 'DATA_CHECK',
        title: 'Consumption Exceeded Delivery',
        description: `Recorded consumption (${d.consumedM3.toFixed(1)} m³) exceeded delivered volume (${d.suppliedM3.toFixed(1)} m³) on ${d.date}. Check site buffer or verify meter readings.`,
      });
    } else if (d.status === 'ATTENTION') {
      alerts.push({
        id: `alert-att-${d.date}`,
        date: d.date,
        severity: 'ATTENTION',
        title: 'Unaccounted Threshold Exceeded',
        description: `Unaccounted water variance reached ${d.unaccountedPercent.toFixed(1)}% on ${d.date}, exceeding the ${project.unaccountedThresholdPercent}% site tolerance limit.`,
      });
    }
  });

  // 2. Data Quality metrics in current period
  const periodConsumptions = await prisma.consumptionRecord.findMany({
    where: {
      projectId,
      date: { gte: fromDate, lte: toDate },
    },
    select: {
      id: true,
      usedAssumedVelocity: true,
      date: true,
    },
  });

  const totalConsRecords = periodConsumptions.length;
  const assumedVelRecords = periodConsumptions.filter((c) => c.usedAssumedVelocity).length;
  const assumedVelPercent = totalConsRecords > 0 ? (assumedVelRecords / totalConsRecords) * 100 : 0;

  // Days with no consumption
  const daysInPeriod = Math.max(
    1,
    Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );
  const activeConsumptionDays = new Set(
    periodConsumptions.map((c) => c.date.toISOString().slice(0, 10))
  );
  const daysWithNoConsumption = Math.max(0, daysInPeriod - activeConsumptionDays.size);
  const daysConsumptionExceeded = dailyWithStats.filter((d) => d.status === 'DATA_CHECK').length;

  // 3. Fetch latest 8 combined records (supplies & consumption)
  const [latestSupplies, latestConsumption] = await Promise.all([
    prisma.waterSupply.findMany({
      where: { projectId },
      orderBy: { date: 'desc' },
      take: 8,
    }),
    prisma.consumptionRecord.findMany({
      where: { projectId },
      orderBy: { date: 'desc' },
      take: 8,
      include: { activityType: true },
    }),
  ]);

  const combinedRecords: RecentRecord[] = [
    ...latestSupplies.map((s) => ({
      id: s.id,
      date: s.date.toISOString().slice(0, 10),
      type: 'SUPPLY' as const,
      methodOrSource: s.source,
      activityOrSupplier: s.supplier || 'Direct delivery',
      volumeM3: s.volumeM3,
    })),
    ...latestConsumption.map((c) => ({
      id: c.id,
      date: c.date.toISOString().slice(0, 10),
      type: 'CONSUMPTION' as const,
      methodOrSource: c.method,
      activityOrSupplier: c.activityType.name,
      volumeM3: c.volumeM3,
      usedAssumedVelocity: c.usedAssumedVelocity,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  // 4. Comparison period computation (if requested)
  let previousData: DashboardDataResult['previous'];
  let deltas: DashboardDataResult['deltas'];

  if (compareFromIso && compareToIso) {
    const prevFromDate = new Date(compareFromIso);
    const prevToDate = new Date(compareToIso);

    const prevBalance = await getWaterBalance(projectId, prevFromDate, prevToDate);

    // Count prev alerts
    let prevAlertsCount = 0;
    prevBalance.daily.forEach((d) => {
      const unacc = d.suppliedM3 - d.consumedM3;
      const pct = d.suppliedM3 > 0 ? (unacc / d.suppliedM3) * 100 : 0;
      if (d.consumedM3 > d.suppliedM3 || pct > project.unaccountedThresholdPercent) {
        prevAlertsCount++;
      }
    });

    previousData = {
      from: compareFromIso,
      to: compareToIso,
      suppliedM3: prevBalance.suppliedM3,
      consumedM3: prevBalance.consumedM3,
      unaccountedM3: prevBalance.unaccountedM3,
      unaccountedPercent: prevBalance.unaccountedPercent ?? 0,
      status: prevBalance.status,
      activeAlertsCount: prevAlertsCount,
    };

    const suppliedDiff = currentBalance.suppliedM3 - prevBalance.suppliedM3;
    const suppliedPctDiff =
      prevBalance.suppliedM3 > 0 ? (suppliedDiff / prevBalance.suppliedM3) * 100 : 0;

    const consumedDiff = currentBalance.consumedM3 - prevBalance.consumedM3;
    const consumedPctDiff =
      prevBalance.consumedM3 > 0 ? (consumedDiff / prevBalance.consumedM3) * 100 : 0;

    const unaccDiff = currentBalance.unaccountedM3 - prevBalance.unaccountedM3;
    const unaccPctDiff = (currentBalance.unaccountedPercent ?? 0) - (prevBalance.unaccountedPercent ?? 0);

    deltas = {
      suppliedM3: suppliedDiff,
      suppliedPercent: suppliedPctDiff,
      consumedM3: consumedDiff,
      consumedPercent: consumedPctDiff,
      unaccountedM3: unaccDiff,
      unaccountedPercentDiff: unaccPctDiff,
      alertsDiff: alerts.length - prevAlertsCount,
    };
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      location: project.location,
      clientName: project.clientName,
      unaccountedThresholdPercent: project.unaccountedThresholdPercent,
      assumedVelocityInPerSec: project.assumedVelocityInPerSec,
    },
    current: {
      from: fromIso,
      to: toIso,
      suppliedM3: currentBalance.suppliedM3,
      consumedM3: currentBalance.consumedM3,
      unaccountedM3: currentBalance.unaccountedM3,
      unaccountedPercent: currentBalance.unaccountedPercent ?? 0,
      status: currentBalance.status,
      activeAlertsCount: alerts.length,
      byActivity: byActivityWithColors,
      byMethod: currentBalance.byMethod,
      daily: dailyWithStats,
    },
    previous: previousData,
    deltas,
    alerts,
    recentRecords: combinedRecords,
    dataQuality: {
      totalConsumptionRecords: totalConsRecords,
      assumedVelocityRecords: assumedVelRecords,
      assumedVelocityPercent: assumedVelPercent,
      daysWithNoConsumption,
      daysConsumptionExceededSupply: daysConsumptionExceeded,
      totalDaysInPeriod: daysInPeriod,
    },
  };
}
