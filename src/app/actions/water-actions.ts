'use server';

import prisma from '@/lib/prisma';
import { requireUser, getAccessibleProjectIds } from '@/lib/auth-helpers';
import {
  hasPermission,
  canEditRecord,
  canDeleteRecord,
  canAccessProject,
} from '@/lib/rbac';
import { revalidatePath } from 'next/cache';
import { SupplySource, VolumeUnit, ConsumptionMethod } from '@prisma/client';
import {
  computeConsumptionRecord,
  computeSupplyVolume,
  computeSupplyVolumePreview,
  mapEngineErrorsToFormFields,
  previewVolume,
} from '@/lib/water-service';
import { signOut } from '@/auth';
import {
  supplyImportRowSchema,
  supplyInputSchema,
  supplyPreviewSchema,
} from '@/lib/supply-validation';
import { syncProjectAlerts } from '@/lib/alert-sync';
import { z } from 'zod';

const consumptionInputSchema = z.object({
  projectId: z.string().min(1, 'Project is required.'),
  date: z.iso.date('Enter a valid date.').refine((date) => date <= new Date().toISOString().slice(0, 10), {
    message: 'Consumption date cannot be in the future.',
  }),
  activityTypeId: z.string().min(1, 'Choose an activity.'),
  method: z.enum(['FLOW_METER', 'PIPE', 'DIRECT']),
  inputs: z.record(z.string(), z.unknown()),
  locationOrZone: z.string().trim().max(120, 'Zone or location must be 120 characters or fewer.').optional(),
  notes: z.string().trim().max(1000, 'Notes must be 1000 characters or fewer.').optional(),
});

export async function signOutAction() {
  await signOut({ redirectTo: '/login' });
}

function collectSupplyFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

function deliveryDateToUtc(date: string): Date {
  return new Date(`${date}T12:00:00.000Z`);
}

async function assertCanAccessSupplyProject(user: Awaited<ReturnType<typeof requireUser>>, projectId: string) {
  const accessibleProjectIds = await getAccessibleProjectIds(user);
  if (!canAccessProject(user, projectId, accessibleProjectIds)) {
    throw new Error('403 Forbidden: You are not assigned to this project.');
  }
}

export async function previewSupplyVolumeAction(rawInput: unknown) {
  const user = await requireUser();
  if (!hasPermission(user.role, 'supply:create')) {
    throw new Error('403 Forbidden: Your role cannot create or edit supply records.');
  }

  const parsed = supplyPreviewSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false as const };
  }

  await assertCanAccessSupplyProject(user, parsed.data.projectId);
  const unit = parsed.data.unit === 'm3' ? 'm3' : 'L';
  return {
    success: true as const,
    ...computeSupplyVolumePreview({ volume: parsed.data.volume, unit }),
  };
}

export async function createSupplyRecordAction(rawInput: unknown) {
  const user = await requireUser();
  if (!hasPermission(user.role, 'supply:create')) {
    throw new Error('403 Forbidden: Your role does not have permission to log water supplies.');
  }

  const parsed = supplyInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false as const, errors: collectSupplyFieldErrors(parsed.error) };
  }
  await assertCanAccessSupplyProject(user, parsed.data.projectId);

  const volumeM3 = computeSupplyVolume({
    volume: parsed.data.enteredVolume,
    unit: parsed.data.enteredUnit === VolumeUnit.M3 ? 'm3' : 'L',
  });

  const record = await prisma.$transaction(async (tx) => {
    const created = await tx.waterSupply.create({
      data: {
        projectId: parsed.data.projectId,
        date: deliveryDateToUtc(parsed.data.date),
        source: parsed.data.source as SupplySource,
        enteredVolume: parsed.data.enteredVolume,
        enteredUnit: parsed.data.enteredUnit as VolumeUnit,
        volumeM3,
        supplier: parsed.data.supplier,
        referenceNo: parsed.data.referenceNo,
        notes: parsed.data.notes,
        createdById: user.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'SUPPLY_CREATED',
        entity: 'WaterSupply',
        entityId: created.id,
        afterJson: JSON.stringify({
          date: created.date,
          source: created.source,
          enteredVolume: created.enteredVolume,
          enteredUnit: created.enteredUnit,
          volumeM3: created.volumeM3,
          supplier: created.supplier,
          referenceNo: created.referenceNo,
          notes: created.notes,
        }),
      },
    });
    return created;
  });

  await syncProjectAlerts(parsed.data.projectId);
  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath(`/projects/${parsed.data.projectId}/supplies`);
  revalidatePath('/alerts');
  return { success: true as const, id: record.id };
}

export async function updateSupplyRecordAction(supplyId: string, rawInput: unknown) {
  const user = await requireUser();
  if (!hasPermission(user.role, 'supply:edit')) {
    throw new Error('403 Forbidden: Your role cannot edit supply records.');
  }

  const parsed = supplyInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false as const, errors: collectSupplyFieldErrors(parsed.error) };
  }

  const existing = await prisma.waterSupply.findUnique({ where: { id: supplyId } });
  if (!existing) throw new Error('Water supply record not found.');
  await assertCanAccessSupplyProject(user, existing.projectId);
  if (parsed.data.projectId !== existing.projectId) {
    throw new Error('Supply records cannot be moved to another project.');
  }
  if (!canEditRecord(user, existing)) {
    throw new Error(
      user.role === 'AUDITOR'
        ? '403 Forbidden: Read-only for auditors.'
        : '403 Forbidden: You can only edit your own records within 48 hours of creation.'
    );
  }

  const volumeM3 = computeSupplyVolume({
    volume: parsed.data.enteredVolume,
    unit: parsed.data.enteredUnit === VolumeUnit.M3 ? 'm3' : 'L',
  });
  await prisma.$transaction(async (tx) => {
    const updated = await tx.waterSupply.update({
      where: { id: supplyId },
      data: {
        date: deliveryDateToUtc(parsed.data.date),
        source: parsed.data.source as SupplySource,
        enteredVolume: parsed.data.enteredVolume,
        enteredUnit: parsed.data.enteredUnit as VolumeUnit,
        volumeM3,
        supplier: parsed.data.supplier,
        referenceNo: parsed.data.referenceNo,
        notes: parsed.data.notes,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'SUPPLY_UPDATED',
        entity: 'WaterSupply',
        entityId: existing.id,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(updated),
      },
    });
  });

  await syncProjectAlerts(existing.projectId);
  revalidatePath(`/projects/${existing.projectId}`);
  revalidatePath(`/projects/${existing.projectId}/supplies`);
  revalidatePath('/alerts');
  return { success: true as const, id: existing.id };
}

export async function importSupplyRecordsAction(projectId: string, rawRows: unknown) {
  const user = await requireUser();
  if (user.role !== 'PROJECT_MANAGER') {
    throw new Error('403 Forbidden: Only project managers can import supply records.');
  }
  if (!hasPermission(user.role, 'supply:create')) {
    throw new Error('403 Forbidden: Your role does not have permission to import supplies.');
  }
  await assertCanAccessSupplyProject(user, projectId);

  const rowsSchema = z.array(z.unknown()).max(200, 'Import no more than 200 rows at a time.');
  const rowsResult = rowsSchema.safeParse(rawRows);
  if (!rowsResult.success) {
    return {
      success: false as const,
      errors: { 0: [rowsResult.error.issues[0]?.message ?? 'Invalid import data.'] },
      imported: 0,
    };
  }

  const validRows: Array<z.infer<typeof supplyImportRowSchema>> = [];
  const errors: Record<number, string[]> = {};
  rowsResult.data.forEach((row, index) => {
    const parsedRow = supplyImportRowSchema.safeParse(row);
    if (parsedRow.success) {
      validRows.push(parsedRow.data);
    } else {
      errors[index + 1] = parsedRow.error.issues.map((issue) => issue.message);
    }
  });

  const imported = await prisma.$transaction(async (tx) => {
    for (const row of validRows) {
      const volumeM3 = computeSupplyVolume({
        volume: row.enteredVolume,
        unit: row.enteredUnit === VolumeUnit.M3 ? 'm3' : 'L',
      });
      const created = await tx.waterSupply.create({
        data: {
          projectId,
          date: deliveryDateToUtc(row.date),
          source: row.source as SupplySource,
          enteredVolume: row.enteredVolume,
          enteredUnit: row.enteredUnit as VolumeUnit,
          volumeM3,
          supplier: row.supplier,
          referenceNo: row.referenceNo,
          notes: row.notes,
          createdById: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'SUPPLY_IMPORTED',
          entity: 'WaterSupply',
          entityId: created.id,
          afterJson: JSON.stringify(created),
        },
      });
    }
    return validRows.length;
  });

  await syncProjectAlerts(projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/supplies`);
  revalidatePath('/alerts');
  return { success: true as const, imported, errors };
}

  function collectConsumptionFieldErrors(error: z.ZodError): Record<string, string> {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      const field = issue.path[0] === 'inputs' ? issue.path[1] : issue.path[0];
      if (typeof field === 'string' && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return fieldErrors;
  }

  function consumptionMethod(method: z.infer<typeof consumptionInputSchema>['method']) {
    if (method === 'FLOW_METER') return 'flowMeter' as const;
    if (method === 'PIPE') return 'pipe' as const;
    return 'direct' as const;
  }

  async function assertCanAccessConsumptionProject(
    user: Awaited<ReturnType<typeof requireUser>>,
    projectId: string
  ) {
    const accessibleProjectIds = await getAccessibleProjectIds(user);
    if (!canAccessProject(user, projectId, accessibleProjectIds)) {
      throw new Error('403 Forbidden: You are not assigned to this project.');
    }
  }

  export async function createConsumptionRecordAction(rawInput: unknown) {
    const user = await requireUser();
    if (!hasPermission(user.role, 'consumption:create')) {
      throw new Error('403 Forbidden: Your role does not have permission to log consumption records.');
    }

    const parsed = consumptionInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false as const, errors: collectConsumptionFieldErrors(parsed.error) };
    }
    await assertCanAccessConsumptionProject(user, parsed.data.projectId);

    const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
    if (!project) throw new Error('Project not found.');
    const activityType = await prisma.activityType.findFirst({
      where: {
        id: parsed.data.activityTypeId,
        active: true,
        OR: [{ projectId: parsed.data.projectId }, { projectId: null }],
      },
    });
    if (!activityType) {
      return { success: false as const, errors: { activityTypeId: 'Choose an active activity for this project.' } };
    }

    const method = consumptionMethod(parsed.data.method);
    const engineResult = previewVolume(
      { method, inputs: parsed.data.inputs },
      { assumedVelocityInPerSec: project.assumedVelocityInPerSec }
    );
    if (!engineResult.valid) {
      const errors: Record<string, string> = {};
      for (const error of mapEngineErrorsToFormFields(engineResult.errors)) {
        if (!errors[error.field]) errors[error.field] = error.message;
      }
      return { success: false as const, errors };
    }

    const computed = computeConsumptionRecord({ method, inputs: parsed.data.inputs }, project);
    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.consumptionRecord.create({
        data: {
          projectId: parsed.data.projectId,
          date: deliveryDateToUtc(parsed.data.date),
          activityTypeId: activityType.id,
          method: parsed.data.method as ConsumptionMethod,
          inputsJson: computed.inputsJson,
          volumeM3: computed.volumeM3,
          usedAssumedVelocity: computed.usedAssumedVelocity,
          warningsJson: computed.warnings.length ? JSON.stringify(computed.warnings) : null,
          locationOrZone: parsed.data.locationOrZone || null,
          notes: parsed.data.notes || null,
          createdById: user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'CONSUMPTION_CREATED',
          entity: 'ConsumptionRecord',
          entityId: created.id,
          afterJson: JSON.stringify({
            method: created.method,
            volumeM3: created.volumeM3,
            usedAssumedVelocity: created.usedAssumedVelocity,
            inputsJson: created.inputsJson,
            warningsJson: created.warningsJson,
          }),
        },
      });
      return created;
    });

    await syncProjectAlerts(parsed.data.projectId);
    revalidatePath(`/projects/${parsed.data.projectId}`);
    revalidatePath(`/projects/${parsed.data.projectId}/consumption`);
    revalidatePath('/alerts');
    return { success: true as const, id: record.id };
  }

  export async function updateConsumptionRecordAction(recordId: string, rawInput: unknown) {
    const user = await requireUser();
    if (!hasPermission(user.role, 'consumption:edit')) {
      throw new Error('403 Forbidden: Your role cannot edit consumption records.');
    }

    const parsed = consumptionInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false as const, errors: collectConsumptionFieldErrors(parsed.error) };
    }
    const existing = await prisma.consumptionRecord.findUnique({ where: { id: recordId } });
    if (!existing) throw new Error('Consumption record not found.');
    await assertCanAccessConsumptionProject(user, existing.projectId);
    if (parsed.data.projectId !== existing.projectId) {
      throw new Error('Consumption records cannot be moved to another project.');
    }
    if (!canEditRecord(user, existing)) {
      throw new Error(
        user.role === 'AUDITOR'
          ? '403 Forbidden: Read-only for auditors.'
          : '403 Forbidden: You can only edit your own records within 48 hours of creation.'
      );
    }

    const project = await prisma.project.findUnique({ where: { id: existing.projectId } });
    if (!project) throw new Error('Project not found.');
    const activityType = await prisma.activityType.findFirst({
      where: {
        id: parsed.data.activityTypeId,
        active: true,
        OR: [{ projectId: existing.projectId }, { projectId: null }],
      },
    });
    if (!activityType) {
      return { success: false as const, errors: { activityTypeId: 'Choose an active activity for this project.' } };
    }

    const method = consumptionMethod(parsed.data.method);
    const engineResult = previewVolume(
      { method, inputs: parsed.data.inputs },
      { assumedVelocityInPerSec: project.assumedVelocityInPerSec }
    );
    if (!engineResult.valid) {
      const errors: Record<string, string> = {};
      for (const error of mapEngineErrorsToFormFields(engineResult.errors)) {
        if (!errors[error.field]) errors[error.field] = error.message;
      }
      return { success: false as const, errors };
    }
    const computed = computeConsumptionRecord({ method, inputs: parsed.data.inputs }, project);

    await prisma.$transaction(async (tx) => {
      const updated = await tx.consumptionRecord.update({
        where: { id: recordId },
        data: {
          date: deliveryDateToUtc(parsed.data.date),
          activityTypeId: activityType.id,
          method: parsed.data.method as ConsumptionMethod,
          inputsJson: computed.inputsJson,
          volumeM3: computed.volumeM3,
          usedAssumedVelocity: computed.usedAssumedVelocity,
          warningsJson: computed.warnings.length ? JSON.stringify(computed.warnings) : null,
          locationOrZone: parsed.data.locationOrZone || null,
          notes: parsed.data.notes || null,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'CONSUMPTION_UPDATED',
          entity: 'ConsumptionRecord',
          entityId: existing.id,
          beforeJson: JSON.stringify(existing),
          afterJson: JSON.stringify(updated),
        },
      });
    });

    await syncProjectAlerts(existing.projectId);
    revalidatePath(`/projects/${existing.projectId}`);
    revalidatePath(`/projects/${existing.projectId}/consumption`);
    revalidatePath('/alerts');
    return { success: true as const, id: existing.id };
  }

/**
 * Server Action: Create Water Supply Record
 * Re-checks user authentication, role permissions, and project membership.
 */
export async function createSupplyAction(formData: FormData) {
  return createSupplyRecordAction({
    projectId: formData.get('projectId'),
    date: formData.get('date'),
    source: formData.get('source'),
    enteredVolume: formData.get('enteredVolume'),
    enteredUnit: formData.get('enteredUnit'),
    supplier: formData.get('supplier'),
    referenceNo: formData.get('referenceNo'),
    notes: formData.get('notes'),
  });
}

/**
 * Server Action: Delete Water Supply Record
 * Re-checks user authentication, ownership, project membership, and the 48-hour rule.
 */
export async function deleteSupplyAction(supplyId: string) {
  const user = await requireUser();

  const record = await prisma.waterSupply.findUnique({
    where: { id: supplyId },
  });

  if (!record) {
    throw new Error('Water supply record not found.');
  }

  // Check project membership
  const accessibleProjectIds = await getAccessibleProjectIds(user);
  if (!canAccessProject(user, record.projectId, accessibleProjectIds)) {
    throw new Error('403 Forbidden: You are not assigned to this project.');
  }

  // Dynamic check: 48-hour rule for site engineers, full for PM, forbidden for Auditor
  if (!canDeleteRecord(user, record)) {
    throw new Error(
      user.role === 'AUDITOR'
        ? '403 Forbidden: Read-only for auditors.'
        : '403 Forbidden: You can only delete your own records within 48 hours of creation.'
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.waterSupply.delete({ where: { id: supplyId } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'SUPPLY_DELETED',
        entity: 'WaterSupply',
        entityId: record.id,
        beforeJson: JSON.stringify(record),
        afterJson: null,
      },
    });
  });

  await syncProjectAlerts(record.projectId);
  revalidatePath(`/projects/${record.projectId}`);
  revalidatePath(`/projects/${record.projectId}/supplies`);
  revalidatePath('/alerts');
  return { success: true };
}

/**
 * Server Action: Create Consumption Record
 * Invokes the Water Calculation Engine to compute volumeM3!
 */
export async function createConsumptionAction(formData: FormData) {
  const method = formData.get('method');
  const numberField = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' && value.trim() ? Number(value) : undefined;
  };
  let inputs: Record<string, unknown> = {};
  if (method === 'FLOW_METER') {
    inputs = {
      flowRate: numberField('flowRate'),
      flowRateUnit: formData.get('flowRateUnit'),
      time: numberField('time'),
      timeUnit: formData.get('timeUnit'),
    };
  } else if (method === 'PIPE') {
    const pipeTime = numberField('time');
    inputs = {
      diameterInches: numberField('diameterInches'),
      ...(pipeTime !== undefined
        ? { time: pipeTime, timeUnit: formData.get('timeUnit') ?? 's' }
        : { timeSeconds: numberField('timeSeconds') }),
    };
    const velocity = numberField('velocityInPerSec');
    if (velocity !== undefined) inputs.velocityInPerSec = velocity;
  } else if (method === 'DIRECT') {
    inputs = { volumeLitres: numberField('volumeLitres') };
  }

  return createConsumptionRecordAction({
    projectId: formData.get('projectId'),
    date: formData.get('date'),
    activityTypeId: formData.get('activityTypeId'),
    method,
    inputs,
    locationOrZone: formData.get('locationOrZone'),
    notes: formData.get('notes'),
  });
}

/**
 * Server Action: Delete Consumption Record
 * Re-checks user authentication, ownership, project membership, and the 48-hour rule.
 */
export async function deleteConsumptionAction(recordId: string) {
  const user = await requireUser();

  const record = await prisma.consumptionRecord.findUnique({
    where: { id: recordId },
  });

  if (!record) {
    throw new Error('Consumption record not found.');
  }

  const accessibleProjectIds = await getAccessibleProjectIds(user);
  if (!canAccessProject(user, record.projectId, accessibleProjectIds)) {
    throw new Error('403 Forbidden: You are not assigned to this project.');
  }

  if (!canDeleteRecord(user, record)) {
    throw new Error(
      user.role === 'AUDITOR'
        ? '403 Forbidden: Read-only for auditors.'
        : '403 Forbidden: You can only delete your own records within 48 hours of creation.'
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.consumptionRecord.delete({ where: { id: recordId } });
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'CONSUMPTION_DELETED',
        entity: 'ConsumptionRecord',
        entityId: record.id,
        beforeJson: JSON.stringify(record),
        afterJson: null,
      },
    });
  });

  await syncProjectAlerts(record.projectId);
  revalidatePath(`/projects/${record.projectId}`);
  revalidatePath(`/projects/${record.projectId}/consumption`);
  revalidatePath('/alerts');
  return { success: true };
}

/**
 * Server Action: Update Project Thresholds
 * Only PROJECT_MANAGER role permitted!
 */
export async function updateThresholdsAction(projectId: string, formData: FormData) {
  const user = await requireUser();

  if (!hasPermission(user.role, 'thresholds:edit')) {
    throw new Error('403 Forbidden: Only Project Managers can modify thresholds and default velocity.');
  }

  const unaccountedThresholdPercent = parseFloat(formData.get('unaccountedThresholdPercent') as string);
  const assumedVelocityInPerSec = parseFloat(formData.get('assumedVelocityInPerSec') as string);

  if (isNaN(unaccountedThresholdPercent) || isNaN(assumedVelocityInPerSec)) {
    throw new Error('Threshold values must be valid numbers.');
  }

  const before = await prisma.project.findUnique({ where: { id: projectId } });

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      unaccountedThresholdPercent,
      assumedVelocityInPerSec,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'UPDATE_THRESHOLDS',
      entity: 'Project',
      entityId: projectId,
      beforeJson: JSON.stringify({
        unaccountedThresholdPercent: before?.unaccountedThresholdPercent,
        assumedVelocityInPerSec: before?.assumedVelocityInPerSec,
      }),
      afterJson: JSON.stringify({
        unaccountedThresholdPercent: updated.unaccountedThresholdPercent,
        assumedVelocityInPerSec: updated.assumedVelocityInPerSec,
      }),
    },
  });

  await syncProjectAlerts(projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/settings`);
  revalidatePath('/alerts');
  return { success: true };
}
