import { requireUser, getAccessibleProjects } from '@/lib/auth-helpers';
import { notFound, redirect } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import prisma from '@/lib/prisma';
import { ProjectForm } from '@/components/projects/project-form';

export const metadata = {
  title: 'Edit Project | HydroTrack Water Management',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditProjectPage({ params }: PageProps) {
  const user = await requireUser();
  const { id } = await params;

  // Defense-in-depth: only Project Managers can edit projects
  if (user.role !== 'PROJECT_MANAGER') {
    redirect(`/403?from=/projects/${id}/edit&reason=unauthorized`);
  }

  const projects = await getAccessibleProjects(user);

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      members: { select: { userId: true } },
      activityTypes: {
        select: { id: true, name: true, color: true, active: true },
        orderBy: { name: 'asc' },
      },
    },
  });

  if (!project) {
    notFound();
  }

  const users = await prisma.user.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <Navbar user={user} currentProjectId={id} projects={projects} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <ProjectForm
          isEdit
          availableUsers={users}
          initialData={{
            id: project.id,
            name: project.name,
            location: project.location,
            clientName: project.clientName,
            startDate: project.startDate.toISOString(),
            endDate: project.endDate ? project.endDate.toISOString() : null,
            status: project.status,
            unaccountedThresholdPercent: project.unaccountedThresholdPercent,
            assumedVelocityInPerSec: project.assumedVelocityInPerSec,
            memberUserIds: project.members.map((m) => m.userId),
            activityTypes: project.activityTypes.map((a) => ({
              id: a.id,
              name: a.name,
              color: a.color,
              active: a.active,
            })),
          }}
        />
      </main>
    </div>
  );
}
