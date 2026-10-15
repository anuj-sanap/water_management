'use server';

import prisma from '@/lib/prisma';
import { requireUser } from '@/lib/auth-helpers';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCalculationEngineDocumentation } from '@/lib/water-service';

const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.'),
});

export async function updateProfileAction(rawInput: unknown) {
  const user = await requireUser();
  const parsed = updateProfileSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message || 'Invalid name.' };
  }

  const existing = await prisma.user.findUnique({
    where: { id: user.id },
  });

  if (!existing) {
    return { success: false as const, error: 'User not found.' };
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'USER_PROFILE_UPDATED',
      entity: 'User',
      entityId: user.id,
      beforeJson: JSON.stringify({ name: existing.name }),
      afterJson: JSON.stringify({ name: updated.name }),
    },
  });

  revalidatePath('/settings');
  return { success: true as const, name: updated.name };
}

export async function changePasswordAction(rawInput: unknown) {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message || 'Invalid input.' };
  }

  const existing = await prisma.user.findUnique({
    where: { id: user.id },
  });

  if (!existing) {
    return { success: false as const, error: 'User not found.' };
  }

  const isValidCurrent = bcrypt.compareSync(parsed.data.currentPassword, existing.passwordHash);
  if (!isValidCurrent) {
    return { success: false as const, error: 'The current password entered is incorrect.' };
  }

  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(parsed.data.newPassword, salt);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'USER_PASSWORD_CHANGED',
      entity: 'User',
      entityId: user.id,
      beforeJson: JSON.stringify({ message: 'Previous password invalidated' }),
      afterJson: JSON.stringify({ message: 'New password registered securely' }),
    },
  });

  revalidatePath('/settings');
  return { success: true as const };
}

export async function getEngineDocsAction() {
  await requireUser();
  return getCalculationEngineDocumentation();
}
