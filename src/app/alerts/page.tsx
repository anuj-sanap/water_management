import { Suspense } from 'react';
import { requireUser, getAccessibleProjectIds } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { Navbar } from '@/components/navbar';
import { AlertsView } from '@/components/alerts/alerts-view';
import { getAlertsAction, getOpenAlertsCountAction } from '@/app/actions/alert-actions';
import AlertsLoading from './loading';

interface AlertsPageProps {
  searchParams: Promise<{ project?: string; status?: string; severity?: string; type?: string }>;
}

async function AlertsContent({ searchParams }: AlertsPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const currentProjectId = params.project;

  const accessibleProjectIds = await getAccessibleProjectIds(user);
  const projects = await prisma.project.findMany({
    where: { id: { in: accessibleProjectIds } },
    select: { id: true, name: true, location: true },
    orderBy: { name: 'asc' },
  });

  const alerts = await getAlertsAction({
    projectId: currentProjectId,
    status: params.status,
    severity: params.severity,
    type: params.type,
  });

  const openAlertsCount = await getOpenAlertsCountAction();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar
        user={user}
        currentProjectId={currentProjectId}
        projects={projects}
        openAlertsCount={openAlertsCount}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <AlertsView
          initialAlerts={alerts}
          projects={projects}
          currentProjectId={currentProjectId}
          userRole={user.role}
        />
      </main>
    </div>
  );
}

export default function AlertsPage({ searchParams }: AlertsPageProps) {
  return (
    <Suspense fallback={<AlertsLoading />}>
      <AlertsContent searchParams={searchParams} />
    </Suspense>
  );
}
