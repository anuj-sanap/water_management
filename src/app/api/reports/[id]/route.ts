import { NextRequest } from 'next/server';
import { requireUser, getAccessibleProjectIds } from '@/lib/auth-helpers';
import { canAccessProject, hasPermission } from '@/lib/rbac';
import prisma from '@/lib/prisma';
import {
  reportCsv,
  reportPdf,
  reportXlsx,
  reportFileName,
  type ReportSnapshot,
} from '@/lib/reporting';
import { z } from 'zod';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function canAccessReportType(role: string, type: string): boolean {
  if (role === 'PROJECT_MANAGER' || role === 'AUDITOR') return true;
  return role === 'SITE_ENGINEER' && (type === 'DAILY_CONSUMPTION' || type === 'ACTIVITY_CONSUMPTION');
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const user = await requireUser();
  if (!hasPermission(user.role, 'reports:view') || !hasPermission(user.role, 'reports:export')) {
    return Response.json({ error: 'You do not have permission to download reports.' }, { status: 403 });
  }

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: 'Report not found.' }, { status: 404 });
  }

  const report = await prisma.reportHistory.findUnique({ where: { id } });
  if (!report) return Response.json({ error: 'Report not found.' }, { status: 404 });
  if (!canAccessReportType(user.role, report.type)) {
    return Response.json({ error: 'Your role cannot download this report type.' }, { status: 403 });
  }

  let snapshot: ReportSnapshot;
  try {
    snapshot = JSON.parse(report.snapshotJson) as ReportSnapshot;
  } catch (error) {
    console.error(`Saved report ${id} has an invalid snapshot:`, error);
    return Response.json({ error: 'The saved report snapshot is unavailable.' }, { status: 500 });
  }

  const accessibleIds = await getAccessibleProjectIds(user);
  let savedParams: unknown;
  try {
    savedParams = JSON.parse(report.paramsJson);
  } catch (error) {
    console.error(`Saved report ${id} has invalid parameters:`, error);
    return Response.json({ error: 'The saved report parameters are unavailable.' }, { status: 500 });
  }
  const paramsResult = z.object({ projectIds: z.array(z.string()) }).safeParse(savedParams);
  if (!paramsResult.success || paramsResult.data.projectIds.some((projectId) =>
    !canAccessProject(user, projectId, accessibleIds)
  )) {
    return Response.json({ error: 'You do not have access to this report.' }, { status: 403 });
  }

  try {
    const format = report.format;
    const filename = reportFileName(snapshot, format as 'pdf' | 'csv' | 'xlsx');
    if (format === 'pdf') {
      const bytes = await reportPdf(snapshot);
      return new Response(new Uint8Array(bytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    if (format === 'xlsx') {
      const bytes = await reportXlsx(snapshot);
      return new Response(new Uint8Array(bytes), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    if (format === 'csv') {
      return new Response(reportCsv(snapshot), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    return Response.json({ error: 'This report export format is not supported.' }, { status: 400 });
  } catch (error) {
    console.error(`Failed to re-download report ${id}:`, error);
    return Response.json({ error: 'The saved report could not be downloaded.' }, { status: 500 });
  }
}
