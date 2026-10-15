import { NextRequest } from 'next/server';
import { requireUser, getAccessibleProjectIds } from '@/lib/auth-helpers';
import { canAccessProject, hasPermission } from '@/lib/rbac';
import prisma from '@/lib/prisma';
import {
  buildReportSnapshot,
  reportParamsSchema,
  type ReportFormat,
} from '@/lib/reporting';
import { z } from 'zod';

const requestSchema = z.object({
  action: z.enum(['preview', 'generate']),
  format: z.enum(['pdf', 'csv', 'xlsx']).optional(),
  params: reportParamsSchema,
});

function canGenerateType(role: string, type: string): boolean {
  if (role === 'PROJECT_MANAGER' || role === 'AUDITOR') return true;
  return role === 'SITE_ENGINEER' && (type === 'DAILY_CONSUMPTION' || type === 'ACTIVITY_CONSUMPTION');
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!hasPermission(user.role, 'reports:view')) {
    return Response.json({ error: 'You do not have permission to view reports.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({
      error: 'Check the report options and date range.',
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    }, { status: 400 });
  }
  const { action, format, params } = parsed.data;
  if (!canGenerateType(user.role, params.type)) {
    return Response.json({ error: 'Your role cannot generate this report type.' }, { status: 403 });
  }
  if (action === 'generate' && (!format || !hasPermission(user.role, 'reports:export'))) {
    return Response.json({ error: 'Choose an export format you are allowed to generate.' }, { status: 403 });
  }

  const accessibleIds = await getAccessibleProjectIds(user);
  if (params.projectIds.some((projectId) => !canAccessProject(user, projectId, accessibleIds))) {
    return Response.json({ error: 'You do not have access to one or more selected projects.' }, { status: 403 });
  }

  try {
    const snapshot = await buildReportSnapshot(prisma, params, user.name);
    if (action === 'preview') return Response.json(snapshot);

    const created = await prisma.reportHistory.create({
      data: {
        type: params.type,
        format: format as ReportFormat,
        paramsJson: JSON.stringify(params),
        snapshotJson: JSON.stringify(snapshot),
        createdById: user.id,
      },
      select: { id: true, createdAt: true },
    });

    return Response.json({
      id: created.id,
      type: params.type,
      format,
      createdAt: created.createdAt.toISOString(),
      createdBy: user.name,
      params,
      downloadUrl: `/api/reports/${created.id}`,
      filename: `${params.type.toLowerCase()}-${params.from}-to-${params.to}.${format}`,
    });
  } catch (error) {
    console.error('Report preview or generation failed:', error);
    return Response.json({ error: 'The report could not be generated. Please try again.' }, { status: 500 });
  }
}
