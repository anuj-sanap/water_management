'use server';

import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth-helpers';
import { revalidatePath } from 'next/cache';
import { ProjectStatus } from '@prisma/client';

export interface ActivityTypeInput {
  id?: string;
  name: string;
  color: string;
  active: boolean;
}

export interface ProjectInput {
  name: string;
  location: string;
  clientName?: string | null;
  startDate: string;
  endDate?: string | null;
  status: ProjectStatus;
  unaccountedThresholdPercent: number;
  assumedVelocityInPerSec: number;
  memberUserIds: string[];
  activityTypes?: ActivityTypeInput[];
}

/**
 * Server Action: Create Project
 * Only Project Managers can create projects.
 */
export async function createProjectAction(data: ProjectInput) {
  const user = await requireUser();

  if (user.role !== 'PROJECT_MANAGER') {
    throw new Error('403 Forbidden: Only Project Managers can create projects.');
  }

  if (!data.name?.trim()) {
    throw new Error('Project name is required.');
  }
  if (!data.location?.trim()) {
    throw new Error('Project location is required.');
  }

  const startDate = new Date(data.startDate);
  const endDate = data.endDate ? new Date(data.endDate) : null;

  // Make sure current user is in members
  const memberSet = new Set(data.memberUserIds || []);
  memberSet.add(user.id);
  const memberUserIds = Array.from(memberSet);

  const defaultActivities = [
    { name: 'Curing', color: '#0284c7', active: true },
    { name: 'Dust Suppression', color: '#059669', active: true },
    { name: 'Concrete Mixing', color: '#d97706', active: true },
    { name: 'Site Cleaning', color: '#7c3aed', active: true },
    { name: 'Soil Compaction', color: '#db2777', active: true },
  ];

  const activitiesToCreate =
    data.activityTypes && data.activityTypes.length > 0
      ? data.activityTypes.map((a) => ({
          name: a.name.trim(),
          color: a.color || '#0284c7',
          active: a.active ?? true,
        }))
      : defaultActivities;

  const project = await prisma.project.create({
    data: {
      name: data.name.trim(),
      location: data.location.trim(),
      clientName: data.clientName?.trim() || null,
      startDate,
      endDate,
      status: data.status || ProjectStatus.ACTIVE,
      unaccountedThresholdPercent: data.unaccountedThresholdPercent ?? 15,
      assumedVelocityInPerSec: data.assumedVelocityInPerSec ?? 47.24,
      members: {
        create: memberUserIds.map((userId) => ({
          userId,
        })),
      },
      activityTypes: {
        create: activitiesToCreate,
      },
    },
    include: {
      members: { include: { user: true } },
      activityTypes: true,
    },
  });

  // Log to AuditLog
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'PROJECT_CREATED',
      entity: 'Project',
      entityId: project.id,
      beforeJson: null,
      afterJson: JSON.stringify({
        id: project.id,
        name: project.name,
        location: project.location,
        clientName: project.clientName,
        status: project.status,
        unaccountedThresholdPercent: project.unaccountedThresholdPercent,
        assumedVelocityInPerSec: project.assumedVelocityInPerSec,
        membersCount: project.members.length,
      }),
    },
  });

  revalidatePath('/projects');
  return { success: true, projectId: project.id };
}

/**
 * Server Action: Update Project
 * Only Project Managers can update projects.
 */
export async function updateProjectAction(projectId: string, data: ProjectInput) {
  const user = await requireUser();

  if (user.role !== 'PROJECT_MANAGER') {
    throw new Error('403 Forbidden: Only Project Managers can modify projects.');
  }

  const existing = await prisma.project.findUnique({
    where: { id: projectId },
    include: { members: true, activityTypes: true },
  });

  if (!existing) {
    throw new Error('Project not found.');
  }

  const startDate = new Date(data.startDate);
  const endDate = data.endDate ? new Date(data.endDate) : null;

  // Sync members
  const memberSet = new Set(data.memberUserIds || []);
  memberSet.add(user.id);
  const targetMemberIds = Array.from(memberSet);

  const existingMemberUserIds = existing.members.map((m) => m.userId);
  const membersToAdd = targetMemberIds.filter((id) => !existingMemberUserIds.includes(id));
  const membersToRemove = existingMemberUserIds.filter(
    (id) => !targetMemberIds.includes(id) && id !== user.id
  );

  // Sync Activity Types
  if (data.activityTypes && data.activityTypes.length > 0) {
    for (const act of data.activityTypes) {
      if (act.id) {
        await prisma.activityType.update({
          where: { id: act.id },
          data: {
            name: act.name.trim(),
            color: act.color,
            active: act.active,
          },
        });
      } else {
        await prisma.activityType.create({
          data: {
            projectId,
            name: act.name.trim(),
            color: act.color || '#0284c7',
            active: act.active ?? true,
          },
        });
      }
    }
  }

  // Update project fields and members
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      name: data.name.trim(),
      location: data.location.trim(),
      clientName: data.clientName?.trim() || null,
      startDate,
      endDate,
      status: data.status,
      unaccountedThresholdPercent: data.unaccountedThresholdPercent,
      assumedVelocityInPerSec: data.assumedVelocityInPerSec,
      members: {
        deleteMany: membersToRemove.length > 0 ? { userId: { in: membersToRemove } } : undefined,
        create: membersToAdd.map((userId) => ({ userId })),
      },
    },
    include: { members: true, activityTypes: true },
  });

  // Log to AuditLog
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'PROJECT_UPDATED',
      entity: 'Project',
      entityId: projectId,
      beforeJson: JSON.stringify({
        name: existing.name,
        location: existing.location,
        clientName: existing.clientName,
        status: existing.status,
        unaccountedThresholdPercent: existing.unaccountedThresholdPercent,
        assumedVelocityInPerSec: existing.assumedVelocityInPerSec,
      }),
      afterJson: JSON.stringify({
        name: updated.name,
        location: updated.location,
        clientName: updated.clientName,
        status: updated.status,
        unaccountedThresholdPercent: updated.unaccountedThresholdPercent,
        assumedVelocityInPerSec: updated.assumedVelocityInPerSec,
      }),
    },
  });

  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/edit`);
  revalidatePath(`/projects/${projectId}/settings`);

  return { success: true };
}

/**
 * Server Action: Update Project Status (Archive / Complete)
 */
export async function updateProjectStatusAction(projectId: string, newStatus: ProjectStatus) {
  const user = await requireUser();

  if (user.role !== 'PROJECT_MANAGER') {
    throw new Error('403 Forbidden: Only Project Managers can modify project status.');
  }

  const existing = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!existing) {
    throw new Error('Project not found.');
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { status: newStatus },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'PROJECT_STATUS_UPDATED',
      entity: 'Project',
      entityId: projectId,
      beforeJson: JSON.stringify({ status: existing.status }),
      afterJson: JSON.stringify({ status: updated.status }),
    },
  });

  revalidatePath('/projects');
  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

/**
 * Server Action: Save / Create an activity type directly
 */
export async function saveActivityTypeAction(
  projectId: string,
  activity: { id?: string; name: string; color: string; active?: boolean }
) {
  const user = await requireUser();

  if (user.role !== 'PROJECT_MANAGER') {
    throw new Error('403 Forbidden: Only Project Managers can manage activity types.');
  }

  if (activity.id) {
    const existing = await prisma.activityType.findUnique({ where: { id: activity.id } });
    const updated = await prisma.activityType.update({
      where: { id: activity.id },
      data: {
        name: activity.name.trim(),
        color: activity.color,
        active: activity.active ?? true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'ACTIVITY_TYPE_UPDATED',
        entity: 'ActivityType',
        entityId: activity.id,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
      },
    });
  } else {
    const created = await prisma.activityType.create({
      data: {
        projectId,
        name: activity.name.trim(),
        color: activity.color,
        active: activity.active ?? true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'ACTIVITY_TYPE_CREATED',
        entity: 'ActivityType',
        entityId: created.id,
        beforeJson: null,
        afterJson: JSON.stringify(created),
      },
    });
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/edit`);
  return { success: true };
}

/**
 * Server Action: Toggle activity type status
 */
export async function toggleActivityTypeAction(activityTypeId: string) {
  const user = await requireUser();

  if (user.role !== 'PROJECT_MANAGER') {
    throw new Error('403 Forbidden: Only Project Managers can modify activity types.');
  }

  const existing = await prisma.activityType.findUnique({
    where: { id: activityTypeId },
  });

  if (!existing) {
    throw new Error('Activity type not found.');
  }

  const updated = await prisma.activityType.update({
    where: { id: activityTypeId },
    data: { active: !existing.active },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'ACTIVITY_TYPE_TOGGLED',
      entity: 'ActivityType',
      entityId: activityTypeId,
      beforeJson: JSON.stringify({ active: existing.active }),
      afterJson: JSON.stringify({ active: updated.active }),
    },
  });

  if (existing.projectId) {
    revalidatePath(`/projects/${existing.projectId}`);
    revalidatePath(`/projects/${existing.projectId}/edit`);
  }
  return { success: true, active: updated.active };
}
