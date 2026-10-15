'use server';

import prisma from '@/lib/prisma';
import { requireUser, getAccessibleProjectIds } from '@/lib/auth-helpers';
import { canAccessProject } from '@/lib/rbac';
import { revalidatePath } from 'next/cache';
import { AlertStatus, AlertSeverity, AlertType } from '@prisma/client';
import { syncProjectAlerts } from '@/lib/alert-sync';

/**
 * Server Action: Acknowledge an alert
 * Permitted for Site Engineers and Project Managers. Read-only for Auditors.
 */
export async function acknowledgeAlertAction(alertId: string) {
  const user = await requireUser();

  if (user.role === 'AUDITOR') {
    throw new Error('403 Forbidden: Auditors have read-only access and cannot acknowledge alerts.');
  }

  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
  });

  if (!alert) {
    throw new Error('Alert not found.');
  }

  const accessibleIds = await getAccessibleProjectIds(user);
  if (!canAccessProject(user, alert.projectId, accessibleIds)) {
    throw new Error('403 Forbidden: You do not have access to this project.');
  }

  const updated = await prisma.alert.update({
    where: { id: alertId },
    data: {
      status: AlertStatus.ACKNOWLEDGED,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'ALERT_ACKNOWLEDGED',
      entity: 'Alert',
      entityId: alertId,
      beforeJson: JSON.stringify({ status: alert.status }),
      afterJson: JSON.stringify({ status: updated.status }),
    },
  });

  revalidatePath('/alerts');
  revalidatePath('/dashboard');
  revalidatePath(`/projects/${alert.projectId}`);
  return { success: true };
}

/**
 * Server Action: Resolve an alert with an optional resolution note
 * Permitted for Site Engineers and Project Managers. Read-only for Auditors.
 */
export async function resolveAlertAction(alertId: string, resolutionNote?: string) {
  const user = await requireUser();

  if (user.role === 'AUDITOR') {
    throw new Error('403 Forbidden: Auditors have read-only access and cannot resolve alerts.');
  }

  const alert = await prisma.alert.findUnique({
    where: { id: alertId },
  });

  if (!alert) {
    throw new Error('Alert not found.');
  }

  const accessibleIds = await getAccessibleProjectIds(user);
  if (!canAccessProject(user, alert.projectId, accessibleIds)) {
    throw new Error('403 Forbidden: You do not have access to this project.');
  }

  const updated = await prisma.alert.update({
    where: { id: alertId },
    data: {
      status: AlertStatus.RESOLVED,
      resolvedById: user.id,
      resolutionNote: resolutionNote?.trim() || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'ALERT_RESOLVED',
      entity: 'Alert',
      entityId: alertId,
      beforeJson: JSON.stringify({ status: alert.status }),
      afterJson: JSON.stringify({
        status: updated.status,
        resolutionNote: updated.resolutionNote,
        resolvedById: user.id,
      }),
    },
  });

  revalidatePath('/alerts');
  revalidatePath('/dashboard');
  revalidatePath(`/projects/${alert.projectId}`);
  return { success: true };
}

/**
 * Server Action: Recompute & fetch alerts across all accessible projects
 */
export async function getAlertsAction(filters?: {
  projectId?: string;
  status?: string;
  severity?: string;
  type?: string;
}) {
  const user = await requireUser();
  const accessibleProjectIds = await getAccessibleProjectIds(user);

  const targetProjectIds = filters?.projectId && filters.projectId !== 'ALL'
    ? accessibleProjectIds.filter((id) => id === filters.projectId)
    : accessibleProjectIds;

  // Background-free idempotent sync across accessible projects
  for (const pid of targetProjectIds) {
    await syncProjectAlerts(pid);
  }

  return prisma.alert.findMany({
    where: {
      projectId: { in: targetProjectIds },
      status:
        filters?.status && filters.status !== 'ALL'
          ? (filters.status as AlertStatus)
          : undefined,
      severity:
        filters?.severity && filters.severity !== 'ALL'
          ? (filters.severity as AlertSeverity)
          : undefined,
      type:
        filters?.type && filters.type !== 'ALL'
          ? (filters.type as AlertType)
          : undefined,
    },
    include: {
      project: { select: { id: true, name: true, location: true } },
      resolvedBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: [{ status: 'asc' }, { date: 'desc' }],
  });
}

/**
 * Server Action: Get unread/open alert count for navigation badge
 */
export async function getOpenAlertsCountAction() {
  const user = await requireUser();
  const accessibleProjectIds = await getAccessibleProjectIds(user);

  return prisma.alert.count({
    where: {
      projectId: { in: accessibleProjectIds },
      status: AlertStatus.OPEN,
    },
  });
}
