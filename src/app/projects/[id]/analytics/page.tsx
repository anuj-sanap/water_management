import { Suspense } from 'react';
import { requireUser, getAccessibleProjects } from '@/lib/auth-helpers';
import { canAccessProject } from '@/lib/rbac';
import { redirect } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { ProjectNav } from '@/components/project-nav';
import { AnalyticsView } from '@/components/analytics/analytics-view';
import { getAnalyticsDataAction } from '@/app/actions/analytics-actions';
import { getOpenAlertsCountAction } from '@/app/actions/alert-actions';

interface PageProps {
  params: Promise<{ id: string }>;
}

async function ProjectAnalyticsContent({ params }: PageProps) {
  const user = await requireUser();
  const { id } = await params;

  const accessibleProjects = await getAccessibleProjects(user);
  const accessibleIds = accessibleProjects.map((p) => p.id);

  if (!canAccessProject(user, id, accessibleIds)) {
    redirect(`/403?from=/projects/${id}/analytics&reason=unauthorized`);
  }

  const [analyticsData, openAlertsCount] = await Promise.all([
    getAnalyticsDataAction(id),
    getOpenAlertsCountAction(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <Navbar
        user={user}
        currentProjectId={id}
        projects={accessibleProjects}
        openAlertsCount={openAlertsCount}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <ProjectNav projectId={id} role={user.role} openAlertsCount={openAlertsCount} />

        <AnalyticsView
          data={analyticsData}
          projects={accessibleProjects}
          currentProjectId={id}
        />
      </main>
    </div>
  );
}

export default function ProjectAnalyticsPage({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
          <div className="h-16 bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 animate-pulse" />
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            <div className="h-10 w-72 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
            <div className="h-96 w-full bg-slate-200 dark:bg-slate-800 rounded-3xl animate-pulse" />
          </div>
        </div>
      }
    >
      <ProjectAnalyticsContent params={params} />
    </Suspense>
  );
}
