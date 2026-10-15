import { requireUser, getAccessibleProjects } from '@/lib/auth-helpers';
import { canAccessProject } from '@/lib/rbac';
import { notFound, redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { Navbar } from '@/components/navbar';
import { ProjectNav } from '@/components/project-nav';
import { ActionButton } from '@/components/action-button';
import { Truck, Droplet, MapPin, Calendar } from 'lucide-react';
import { ProjectDashboardTabs, ProjectDashboardData } from '@/components/projects/project-dashboard-tabs';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDashboardPage({ params }: PageProps) {
  const user = await requireUser();
  const { id } = await params;

  const accessibleProjects = await getAccessibleProjects(user);
  const accessibleIds = accessibleProjects.map((p) => p.id);

  if (!canAccessProject(user, id, accessibleIds)) {
    redirect(`/403?from=/projects/${id}&reason=unauthorized`);
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, role: true, email: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      activityTypes: {
        include: {
          _count: {
            select: { consumptionRecords: true },
          },
        },
        orderBy: { name: 'asc' },
      },
    },
  });

  if (!project) {
    notFound();
  }

  // Aggregate metrics
  const supplies = await prisma.waterSupply.findMany({
    where: { projectId: id },
    orderBy: { date: 'desc' },
  });

  const consumption = await prisma.consumptionRecord.findMany({
    where: { projectId: id },
    orderBy: { date: 'desc' },
    include: { activityType: true, createdBy: { select: { name: true, email: true } } },
  });

  const totalSuppliedM3 = supplies.reduce((acc, s) => acc + s.volumeM3, 0);
  const totalConsumedM3 = consumption.reduce((acc, c) => acc + c.volumeM3, 0);
  const unaccountedM3 = totalSuppliedM3 - totalConsumedM3;
  const unaccountedPercent = totalSuppliedM3 > 0 ? (unaccountedM3 / totalSuppliedM3) * 100 : 0;
  const thresholdExceeded = unaccountedPercent > project.unaccountedThresholdPercent;

  const assumedVelocityCount = consumption.filter((c) => c.usedAssumedVelocity).length;

  const recentSupplies = supplies.slice(0, 5).map((s) => ({
    id: s.id,
    date: s.date.toISOString(),
    volumeM3: s.volumeM3,
    source: s.source,
    supplier: s.supplier,
    referenceNo: s.referenceNo,
  }));

  const recentConsumption = consumption.slice(0, 5).map((c) => ({
    id: c.id,
    date: c.date.toISOString(),
    volumeM3: c.volumeM3,
    method: c.method,
    usedAssumedVelocity: c.usedAssumedVelocity,
    locationOrZone: c.locationOrZone,
    activityType: {
      name: c.activityType.name,
      color: c.activityType.color,
    },
  }));

  const dashboardData: ProjectDashboardData = {
    project: {
      id: project.id,
      name: project.name,
      location: project.location,
      clientName: project.clientName,
      startDate: project.startDate.toISOString(),
      endDate: project.endDate ? project.endDate.toISOString() : null,
      status: project.status,
      unaccountedThresholdPercent: project.unaccountedThresholdPercent,
      assumedVelocityInPerSec: project.assumedVelocityInPerSec,
    },
    members: project.members.map((m) => ({
      userId: m.userId,
      createdAt: m.createdAt.toISOString(),
      user: m.user,
    })),
    activityTypes: project.activityTypes.map((a) => ({
      id: a.id,
      name: a.name,
      color: a.color,
      active: a.active,
      recordsCount: a._count.consumptionRecords,
    })),
    metrics: {
      totalSuppliedM3,
      totalConsumedM3,
      unaccountedM3,
      unaccountedPercent,
      thresholdExceeded,
      assumedVelocityCount,
    },
    recentSupplies,
    recentConsumption,
    counts: {
      suppliesCount: supplies.length,
      consumptionCount: consumption.length,
    },
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <Navbar user={user} currentProjectId={id} projects={accessibleProjects} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Project Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                Site Dashboard
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="text-xs text-slate-500 font-mono">{project.status}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {project.name}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1.5">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {project.location}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Started {new Date(project.startDate).toLocaleDateString()}
              </span>
              {project.clientName && (
                <>
                  <span>•</span>
                  <span>Client: {project.clientName}</span>
                </>
              )}
            </div>
          </div>

          {/* Action Buttons: Log Supply & Record Consumption */}
          <div className="flex items-center gap-2.5">
            <ActionButton
              userRole={user.role}
              href={`/projects/${id}/supplies/new`}
              variant="secondary"
              size="sm"
            >
              <Truck className="w-4 h-4 text-sky-600" />
              <span>Log Water Supply</span>
            </ActionButton>

            <ActionButton
              userRole={user.role}
              href={`/projects/${id}/consumption/new`}
              variant="primary"
              size="sm"
            >
              <Droplet className="w-4 h-4" />
              <span>Record Consumption</span>
            </ActionButton>
          </div>
        </div>

        {/* Project Navigation (Role-aware) */}
        <ProjectNav projectId={id} role={user.role} />

        {/* Project Tabs: Overview, Team, Activity Types, Settings */}
        <ProjectDashboardTabs data={dashboardData} currentUserRole={user.role} />
      </main>
    </div>
  );
}
