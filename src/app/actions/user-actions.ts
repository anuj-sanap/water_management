'use server';

import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth-helpers';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
  email: z.string().trim().email('Enter a valid email address.'),
  role: z.nativeEnum(Role),
  password: z.string().min(8, 'Temporary password must be at least 8 characters.'),
  projectIds: z.array(z.string()).default([]),
});

const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
  role: z.nativeEnum(Role),
  projectIds: z.array(z.string()).default([]),
});

export async function getUsersAction() {
  const user = await requireUser();
  if (user.role !== 'PROJECT_MANAGER') {
    throw new Error('403 Forbidden: Only Project Managers can view and manage user accounts.');
  }

  const users = await prisma.user.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: {
      projectMembers: {
        include: {
          project: {
            select: { id: true, name: true, location: true },
          },
        },
      },
    },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt,
    assignedProjects: u.projectMembers.map((pm) => pm.project),
  }));
}

export async function createUserAction(rawInput: unknown) {
  const currentUser = await requireUser();
  if (currentUser.role !== 'PROJECT_MANAGER') {
    throw new Error('403 Forbidden: Only Project Managers can invite or create users.');
  }

  const parsed = createUserSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message || 'Invalid input data.' };
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });

  if (existing) {
    return { success: false as const, error: 'A user with this email address already exists.' };
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(parsed.data.password, salt);

  const newUser = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email.toLowerCase(),
        role: parsed.data.role,
        passwordHash,
        active: true,
      },
    });

    if (parsed.data.projectIds.length > 0) {
      await tx.projectMember.createMany({
        data: parsed.data.projectIds.map((pid) => ({
          projectId: pid,
          userId: created.id,
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        userId: currentUser.id,
        action: 'USER_CREATED',
        entity: 'User',
        entityId: created.id,
        beforeJson: null,
        afterJson: JSON.stringify({
          name: created.name,
          email: created.email,
          role: created.role,
          assignedProjectIds: parsed.data.projectIds,
        }),
      },
    });

    return created;
  });

  revalidatePath('/users');
  revalidatePath('/projects');
  return { success: true as const, userId: newUser.id };
}

export async function updateUserAction(rawInput: unknown) {
  const currentUser = await requireUser();
  if (currentUser.role !== 'PROJECT_MANAGER') {
    throw new Error('403 Forbidden: Only Project Managers can modify user accounts.');
  }

  const parsed = updateUserSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message || 'Invalid input data.' };
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    include: { projectMembers: true },
  });

  if (!targetUser) {
    return { success: false as const, error: 'User not found.' };
  }

  // Safety rule: Prevent removing or changing role of the last active Project Manager
  if (targetUser.role === 'PROJECT_MANAGER' && parsed.data.role !== 'PROJECT_MANAGER') {
    const activePmCount = await prisma.user.count({
      where: { role: 'PROJECT_MANAGER', active: true },
    });

    if (activePmCount <= 1) {
      return {
        success: false as const,
        error: 'Cannot change role: At least one active Project Manager must remain in the system.',
      };
    }
  }

  const oldProjectIds = targetUser.projectMembers.map((pm) => pm.projectId);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: targetUser.id },
      data: {
        name: parsed.data.name,
        role: parsed.data.role,
      },
    });

    // Update project assignments
    await tx.projectMember.deleteMany({
      where: { userId: targetUser.id },
    });

    if (parsed.data.projectIds.length > 0) {
      await tx.projectMember.createMany({
        data: parsed.data.projectIds.map((pid) => ({
          projectId: pid,
          userId: targetUser.id,
        })),
      });
    }

    await tx.auditLog.create({
      data: {
        userId: currentUser.id,
        action: 'USER_UPDATED',
        entity: 'User',
        entityId: targetUser.id,
        beforeJson: JSON.stringify({
          name: targetUser.name,
          role: targetUser.role,
          assignedProjectIds: oldProjectIds,
        }),
        afterJson: JSON.stringify({
          name: updated.name,
          role: updated.role,
          assignedProjectIds: parsed.data.projectIds,
        }),
      },
    });
  });

  revalidatePath('/users');
  revalidatePath('/projects');
  return { success: true as const };
}

export async function toggleUserActiveAction(userId: string) {
  const currentUser = await requireUser();
  if (currentUser.role !== 'PROJECT_MANAGER') {
    throw new Error('403 Forbidden: Only Project Managers can deactivate or reactivate users.');
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!targetUser) {
    return { success: false as const, error: 'User not found.' };
  }

  // Safety rule: Prevent deactivating the last active Project Manager
  if (targetUser.role === 'PROJECT_MANAGER' && targetUser.active === true) {
    const activePmCount = await prisma.user.count({
      where: { role: 'PROJECT_MANAGER', active: true },
    });

    if (activePmCount <= 1) {
      return {
        success: false as const,
        error: 'Cannot deactivate: At least one active Project Manager must remain in the system.',
      };
    }
  }

  const newActiveStatus = !targetUser.active;
  const actionName = newActiveStatus ? 'USER_REACTIVATED' : 'USER_DEACTIVATED';

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: targetUser.id },
      data: { active: newActiveStatus },
    });

    await tx.auditLog.create({
      data: {
        userId: currentUser.id,
        action: actionName,
        entity: 'User',
        entityId: targetUser.id,
        beforeJson: JSON.stringify({ active: targetUser.active }),
        afterJson: JSON.stringify({ active: newActiveStatus }),
      },
    });
  });

  revalidatePath('/users');
  return { success: true as const, active: newActiveStatus };
}
