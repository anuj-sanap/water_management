import { requireUser, getAccessibleProjects } from '@/lib/auth-helpers';
import { redirect } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import prisma from '@/lib/prisma';
import { ProjectForm } from '@/components/projects/project-form';

export const metadata = {
  title: 'New Project | HydroTrack Water Management',
};

export default async function NewProjectPage() {
  const user = await requireUser();

  // Defense-in-depth: only Project Managers can create projects
  if (user.role !== 'PROJECT_MANAGER') {
    redirect('/403?from=/projects/new&reason=unauthorized');
  }

  const projects = await getAccessibleProjects(user);

  // Fetch all active users for member picker
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
      <Navbar user={user} projects={projects} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <ProjectForm
          availableUsers={users}
          initialData={{
            name: '',
            location: '',
            clientName: '',
            startDate: new Date().toISOString(),
            status: 'ACTIVE',
            unaccountedThresholdPercent: 15.0,
            assumedVelocityInPerSec: 47.24,
            memberUserIds: [user.id],
            activityTypes: [
              { name: 'Curing', color: '#0284c7', active: true },
              { name: 'Dust Suppression', color: '#059669', active: true },
              { name: 'Concrete Mixing', color: '#d97706', active: true },
              { name: 'Site Cleaning', color: '#7c3aed', active: true },
              { name: 'Soil Compaction', color: '#db2777', active: true },
            ],
          }}
        />
      </main>
    </div>
  );
}
