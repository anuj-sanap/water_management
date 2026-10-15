import { requireUser, getAccessibleProjects } from '@/lib/auth-helpers';
import { Navbar } from '@/components/navbar';
import { RoleBadge } from '@/components/role-badge';
import prisma from '@/lib/prisma';
import { ProjectsView, ProjectListItem } from '@/components/projects/projects-view';

export const metadata = {
  title: 'Projects | HydroTrack Water Management',
};

export default async function ProjectsPage() {
  const user = await requireUser();
  const rawProjects = await getAccessibleProjects(user);

  // Load telemetry for all accessible projects in two indexed queries instead of per-project queries.
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const projectIds = rawProjects.map((project) => project.id);
  const [supplies, consumptions] = await Promise.all([
    prisma.waterSupply.findMany({
        where: {
          projectId: { in: projectIds },
          date: { gte: thirtyDaysAgo },
        },
        select: { projectId: true, date: true, volumeM3: true },
        orderBy: { date: 'asc' },
      }),
    prisma.consumptionRecord.findMany({
        where: {
          projectId: { in: projectIds },
          date: { gte: thirtyDaysAgo },
        },
        select: { projectId: true, date: true, volumeM3: true },
        orderBy: { date: 'asc' },
      }),
  ]);

  const projectsWithStats: ProjectListItem[] = rawProjects.map((project) => {
      const projectSupplies = supplies.filter((supply) => supply.projectId === project.id);
      const projectConsumptions = consumptions.filter((record) => record.projectId === project.id);
      const suppliedM3 = projectSupplies.reduce((acc, s) => acc + s.volumeM3, 0);
      const consumedM3 = projectConsumptions.reduce((acc, c) => acc + c.volumeM3, 0);
      const unaccountedM3 = suppliedM3 - consumedM3;
      const unaccountedPercent = suppliedM3 > 0 ? (unaccountedM3 / suppliedM3) * 100 : 0;

      let status: 'OK' | 'ATTENTION' | 'DATA_CHECK' = 'OK';
      if (consumedM3 > suppliedM3) {
        status = 'DATA_CHECK';
      } else if (unaccountedPercent > project.unaccountedThresholdPercent) {
        status = 'ATTENTION';
      }

      // Build daily consumption data points for sparkline
      // Map across the last 30 days (or all entries)
      const dayMap = new Map<string, number>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dayKey = d.toISOString().slice(0, 10);
        dayMap.set(dayKey, 0);
      }

      for (const c of projectConsumptions) {
        const dayKey = c.date.toISOString().slice(0, 10);
        if (dayMap.has(dayKey)) {
          dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + c.volumeM3);
        }
      }

      const sparklineData = Array.from(dayMap.values());

      return {
        id: project.id,
        name: project.name,
        location: project.location,
        clientName: project.clientName,
        startDate: project.startDate.toISOString(),
        endDate: project.endDate ? project.endDate.toISOString() : null,
        status: project.status,
        unaccountedThresholdPercent: project.unaccountedThresholdPercent,
        assumedVelocityInPerSec: project.assumedVelocityInPerSec,
        members: project.members.map((m) => ({
          userId: m.userId,
          user: {
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
            role: m.user.role,
          },
        })),
        stats30d: {
          suppliedM3,
          consumedM3,
          unaccountedM3,
          unaccountedPercent,
          status,
          sparklineData,
        },
      };
    });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <Navbar user={user} projects={rawProjects} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
        {/* Header section with Role banner */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                Civil Construction Projects
              </h1>
              <RoleBadge role={user.role} />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {user.role === 'PROJECT_MANAGER' &&
                'Full administrative visibility across all managed sites, members, and parameters.'}
              {user.role === 'SITE_ENGINEER' &&
                'Showing only your assigned engineering projects and operational log access.'}
              {user.role === 'AUDITOR' &&
                'Read-only compliance audit mode across all operational project telemetry.'}
            </p>
          </div>
        </div>

        {/* Interactive Projects View (Card Grid & Table Toggle with Search & Filters) */}
        <ProjectsView projects={projectsWithStats} userRole={user.role} />
      </main>
    </div>
  );
}
