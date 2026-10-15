import { requireUser, getAccessibleProjects } from '@/lib/auth-helpers';
import { Navbar } from '@/components/navbar';
import { ProjectNav } from '@/components/project-nav';
import { getDashboardDataAction } from '@/app/actions/dashboard-actions';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { Suspense } from 'react';
import Link from 'next/link';
import { Building2, Plus } from 'lucide-react';
import prisma from '@/lib/prisma';

export const metadata = {
  title: 'Water Telemetry Dashboard | HydroTrack',
};

interface PageProps {
  searchParams: Promise<{ project?: string; projectId?: string }>;
}

async function DashboardContent({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const accessibleProjects = await getAccessibleProjects(user);

  if (accessibleProjects.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
        <Navbar user={user} projects={[]} />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto">
            <Building2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            No Accessible Projects Found
          </h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            You do not currently have access to any active civil engineering projects.
          </p>
          {user.role === 'PROJECT_MANAGER' && (
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Project</span>
            </Link>
          )}
        </main>
      </div>
    );
  }

  // Selected project or default to first accessible
  const targetProjectId =
    params.project || params.projectId || accessibleProjects[0].id;
  const projectExists = accessibleProjects.some((p) => p.id === targetProjectId);

  const selectedProjectId = projectExists ? targetProjectId : accessibleProjects[0].id;

  // Initial 30-day range
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  from.setHours(0, 0, 0, 0);

  // Previous 30-day compare range
  const compTo = new Date(from.getTime() - 1);
  const compFrom = new Date(compTo.getTime() - (to.getTime() - from.getTime()));

  const dashboardData = await getDashboardDataAction(
    selectedProjectId,
    from.toISOString(),
    to.toISOString(),
    compFrom.toISOString(),
    compTo.toISOString()
  );
  const [supplyCount, consumptionCount] = await Promise.all([
    prisma.waterSupply.count({ where: { projectId: selectedProjectId } }),
    prisma.consumptionRecord.count({ where: { projectId: selectedProjectId } }),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <Navbar
        user={user}
        currentProjectId={selectedProjectId}
        projects={accessibleProjects}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <ProjectNav projectId={selectedProjectId} role={user.role} />
        <DashboardView
          initialData={dashboardData}
          userRole={user.role}
          onboarding={{ projectCreated: true, supplyAdded: supplyCount > 0, consumptionRecorded: consumptionCount > 0 }}
        />
      </main>
    </div>
  );
}

export default function DashboardPage({ searchParams }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-8">
          <div className="flex items-center gap-3 text-slate-500 text-sm">
            <div className="w-5 h-5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading telemetry dashboard...</span>
          </div>
        </div>
      }
    >
      <DashboardContent searchParams={searchParams} />
    </Suspense>
  );
}
