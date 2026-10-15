import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser, getAccessibleProjectIds } from '@/lib/auth-helpers';
import { canAccessProject, hasPermission } from '@/lib/rbac';
import prisma from '@/lib/prisma';
import { previewVolume } from '@/lib/water-service';

const requestSchema = z.object({
  projectId: z.string().min(1),
  method: z.enum(['flowMeter', 'pipe', 'direct']),
  inputs: z.record(z.string(), z.unknown()),
  intent: z.enum(['entry', 'view']).optional().default('entry'),
});

export async function POST(request: NextRequest) {
  const user = await requireUser();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: 'Check the preview request.',
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400 }
    );
  }

  const permission = parsed.data.intent === 'view' ? 'consumption:view' : 'consumption:create';
  if (!hasPermission(user.role, permission)) {
    return Response.json({ error: 'You do not have permission to preview this record.' }, { status: 403 });
  }

  const accessibleProjectIds = await getAccessibleProjectIds(user);
  if (!canAccessProject(user, parsed.data.projectId, accessibleProjectIds)) {
    return Response.json({ error: 'You are not assigned to this project.' }, { status: 403 });
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { assumedVelocityInPerSec: true },
  });
  if (!project) return Response.json({ error: 'Project not found.' }, { status: 404 });

  const result = previewVolume(
    { method: parsed.data.method, inputs: parsed.data.inputs },
    { assumedVelocityInPerSec: project.assumedVelocityInPerSec }
  );
  return Response.json(result);
}
