import { requireUser, getAccessibleProjects } from '@/lib/auth-helpers';
import { hasPermission } from '@/lib/rbac';
import prisma from '@/lib/prisma';
import { Navbar } from '@/components/navbar';
import { ProjectNav } from '@/components/project-nav';
import { ReportsManagement, type ReportHistoryItem } from './reports-management';

interface PageProps {
  searchParams: Promise<{ project?: string }>;
}

export const metadata = {
  title: 'Reports | HydroTrack Water Management',
};

export default async function ReportsPage({ searchParams }: PageProps) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const projects = await getAccessibleProjects(user);
  const accessibleIds = new Set(projects.map((project) => project.id));
  const selectedProjectId = query.project && accessibleIds.has(query.project)
    ? query.project
    : projects[0]?.id;
  const storedHistory = hasPermission(user.role, 'reports:view')
    ? await prisma.reportHistory.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          type: true,
          format: true,
          paramsJson: true,
          createdAt: true,
          createdBy: { select: { name: true } },
        },
      })
    : [];
  const history: ReportHistoryItem[] = storedHistory.flatMap((entry) => {
    try {
      const params = JSON.parse(entry.paramsJson) as { projectIds?: unknown };
      if (
        !Array.isArray(params.projectIds) ||
        params.projectIds.length === 0 ||
        !params.projectIds.every((id) => typeof id === 'string' && accessibleIds.has(id)) ||
        (user.role === 'SITE_ENGINEER' &&
          entry.type !== 'DAILY_CONSUMPTION' &&
          entry.type !== 'ACTIVITY_CONSUMPTION')
      ) {
        return [];
      }
      return [{
        id: entry.id,
        type: entry.type,
        format: entry.format,
        createdAt: entry.createdAt.toISOString(),
        createdBy: entry.createdBy.name,
        projectNames: params.projectIds.map((id) => projects.find((project) => project.id === id)?.name ?? ''),
      }];
    } catch (error) {
      console.error(`Saved report ${entry.id} has invalid parameters:`, error);
      return [];
    }
  });

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <Navbar user={user} currentProjectId={selectedProjectId} projects={projects} />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        {selectedProjectId && <ProjectNav projectId={selectedProjectId} role={user.role} />}
        <ReportsManagement
          projects={projects.map(({ id, name, location }) => ({ id, name, location }))}
          initialProjectId={selectedProjectId ?? ''}
          user={{ id: user.id, name: user.name, role: user.role }}
          initialHistory={history}
        />
      </main>
    </div>
  );
}
