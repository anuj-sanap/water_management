import prisma from '@/lib/prisma';
import { detectAnomalies } from '@/lib/anomalies';
import { AlertType, AlertSeverity, AlertStatus } from '@prisma/client';

/**
 * Idempotently computes and syncs alerts for a project without needing background workers.
 * Called on dashboard/analytics load and when records are saved.
 */
export async function syncProjectAlerts(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) return [];

  // Query all supplies for project
  const supplies = await prisma.waterSupply.findMany({
    where: { projectId },
    select: { date: true, volumeM3: true },
    orderBy: { date: 'asc' },
  });

  // Query all consumption records for project
  const consumption = await prisma.consumptionRecord.findMany({
    where: { projectId },
    select: {
      id: true,
      date: true,
      volumeM3: true,
      method: true,
      usedAssumedVelocity: true,
    },
    orderBy: { date: 'asc' },
  });

  // Aggregate daily supplies
  const supplyMap = new Map<string, number>();
  for (const s of supplies) {
    const key = s.date.toISOString().slice(0, 10);
    supplyMap.set(key, (supplyMap.get(key) || 0) + s.volumeM3);
  }
  const dailySupply = Array.from(supplyMap.entries()).map(([date, volumeM3]) => ({
    date,
    volumeM3,
  }));

  // Aggregate daily consumption
  const consumptionMap = new Map<string, number>();
  for (const c of consumption) {
    const key = c.date.toISOString().slice(0, 10);
    consumptionMap.set(key, (consumptionMap.get(key) || 0) + c.volumeM3);
  }
  const dailyConsumption = Array.from(consumptionMap.entries()).map(
    ([date, volumeM3]) => ({
      date,
      volumeM3,
    })
  );

  const pipeRecords = consumption
    .filter((c) => c.method === 'PIPE')
    .map((c) => ({
      id: c.id,
      usedAssumedVelocity: c.usedAssumedVelocity,
    }));

  // Run pure detection
  const detected = detectAnomalies({
    projectId: project.id,
    projectName: project.name,
    projectStatus: project.status,
    unaccountedThresholdPercent: project.unaccountedThresholdPercent,
    assumedVelocityInPerSec: project.assumedVelocityInPerSec,
    dailyConsumption,
    dailySupply,
    pipeRecords,
  });

  // 1. Batch fetch all existing alerts for this project in a single query
  const existingAlerts = await prisma.alert.findMany({
    where: { projectId },
  });

  const existingMap = new Map<string, (typeof existingAlerts)[0]>();
  for (const item of existingAlerts) {
    const key = `${item.type}_${item.date.toISOString().slice(0, 10)}`;
    existingMap.set(key, item);
  }

  const toCreate: Array<{
    projectId: string;
    type: AlertType;
    severity: AlertSeverity;
    date: Date;
    message: string;
    status: AlertStatus;
  }> = [];

  const toUpdate: Array<{ id: string; message: string; severity: AlertSeverity }> = [];

  for (const anomaly of detected) {
    const anomalyDate = new Date(`${anomaly.date}T00:00:00.000Z`);
    const key = `${anomaly.type}_${anomaly.date}`;
    const existing = existingMap.get(key);

    if (!existing) {
      toCreate.push({
        projectId,
        type: anomaly.type as AlertType,
        severity: anomaly.severity as AlertSeverity,
        date: anomalyDate,
        message: anomaly.message,
        status: AlertStatus.OPEN,
      });
    } else if (existing.status === AlertStatus.OPEN) {
      if (
        existing.message !== anomaly.message ||
        existing.severity !== (anomaly.severity as AlertSeverity)
      ) {
        toUpdate.push({
          id: existing.id,
          message: anomaly.message,
          severity: anomaly.severity as AlertSeverity,
        });
      }
    }
  }

  // Batch insert all new alerts in a single query
  if (toCreate.length > 0) {
    await prisma.alert.createMany({
      data: toCreate,
    });
  }

  // Update any existing OPEN alerts whose message/severity changed
  for (const u of toUpdate) {
    await prisma.alert.update({
      where: { id: u.id },
      data: {
        message: u.message,
        severity: u.severity,
      },
    });
  }

  // Fetch and return current project alerts
  return prisma.alert.findMany({
    where: { projectId },
    orderBy: [{ status: 'asc' }, { date: 'desc' }],
  });
}
