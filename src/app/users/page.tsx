import { Suspense } from 'react';
import { requireUser } from '@/lib/auth-helpers';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { Navbar } from '@/components/navbar';
import { UsersView } from '@/components/users/users-view';
import { getUsersAction } from '@/app/actions/user-actions';
import { getOpenAlertsCountAction } from '@/app/actions/alert-actions';
import UsersLoading from './loading';

export const metadata = {
  title: 'Team & User Administration | HydroTrack',
};

async function UsersContent() {
  const user = await requireUser();

  // Only Project Managers can manage users
  if (user.role !== 'PROJECT_MANAGER') {
    redirect('/403?from=/users&reason=unauthorized_for_role');
  }

  const [users, allProjects, openAlertsCount] = await Promise.all([
    getUsersAction(),
    prisma.project.findMany({
      select: { id: true, name: true, location: true },
      orderBy: { name: 'asc' },
    }),
    getOpenAlertsCountAction(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar
        user={user}
        projects={allProjects}
        openAlertsCount={openAlertsCount}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <UsersView
          initialUsers={users}
          allProjects={allProjects}
          currentUserId={user.id}
        />
      </main>
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<UsersLoading />}>
      <UsersContent />
    </Suspense>
  );
}
