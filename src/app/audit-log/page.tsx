import { Suspense } from 'react';
import { requireUser, getAccessibleProjects } from '@/lib/auth-helpers';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { Navbar } from '@/components/navbar';
import { AuditLogView } from '@/components/audit/audit-log-view';
import { getOpenAlertsCountAction } from '@/app/actions/alert-actions';
import AuditLogLoading from './loading';

export const metadata = {
  title: 'Compliance & Audit Trail | HydroTrack',
};

async function AuditLogContent({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const query = await searchParams;

  // Site Engineers are strictly forbidden from viewing audit logs
  if (user.role === 'SITE_ENGINEER') {
    redirect('/403?from=/audit-log&reason=unauthorized_for_site_engineer');
  }

  const pageSize = 50;
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const [accessibleProjects, logs, totalCount, openAlertsCount] = await Promise.all([
    getAccessibleProjects(user),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { name: true, email: true, role: true } },
      },
    }),
    prisma.auditLog.count(),
    getOpenAlertsCountAction(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar
        user={user}
        projects={accessibleProjects}
        openAlertsCount={openAlertsCount}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <AuditLogView initialLogs={logs} userRole={user.role} page={page} pageSize={pageSize} totalCount={totalCount} />
      </main>
    </div>
  );
}

export default function AuditLogPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return (
    <Suspense fallback={<AuditLogLoading />}>
      <AuditLogContent searchParams={searchParams} />
    </Suspense>
  );
}
