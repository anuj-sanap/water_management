import { Suspense } from 'react';
import { requireUser, getAccessibleProjectIds } from '@/lib/auth-helpers';
import prisma from '@/lib/prisma';
import { Navbar } from '@/components/navbar';
import { AnalyticsView } from '@/components/analytics/analytics-view';
import { getAnalyticsDataAction } from '@/app/actions/analytics-actions';
import { getOpenAlertsCountAction } from '@/app/actions/alert-actions';
import AnalyticsLoading from './loading';

interface AnalyticsPageProps {
  searchParams: Promise<{ project?: string }>;
}

async function AnalyticsContent({ searchParams }: AnalyticsPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const currentProjectId = params.project;

  const accessibleProjectIds = await getAccessibleProjectIds(user);
  const projects = await prisma.project.findMany({
    where: { id: { in: accessibleProjectIds } },
    select: { id: true, name: true, location: true },
    orderBy: { name: 'asc' },
  });

  const analyticsData = await getAnalyticsDataAction(currentProjectId);
  const openAlertsCount = await getOpenAlertsCountAction();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar
        user={user}
        currentProjectId={analyticsData.projectId}
        projects={projects}
        openAlertsCount={openAlertsCount}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <AnalyticsView
          data={analyticsData}
          projects={projects}
          currentProjectId={analyticsData.projectId}
        />
      </main>
    </div>
  );
}

export default function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  return (
    <Suspense fallback={<AnalyticsLoading />}>
      <AnalyticsContent searchParams={searchParams} />
    </Suspense>
  );
}
