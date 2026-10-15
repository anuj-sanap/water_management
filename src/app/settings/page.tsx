import { Suspense } from 'react';
import { requireUser, getAccessibleProjects } from '@/lib/auth-helpers';
import { Navbar } from '@/components/navbar';
import { SettingsView } from '@/components/settings/settings-view';
import { getEngineDocsAction } from '@/app/actions/settings-actions';
import { getOpenAlertsCountAction } from '@/app/actions/alert-actions';
import SettingsLoading from './loading';

export const metadata = {
  title: 'Settings & Calculations | HydroTrack',
};

async function SettingsContent() {
  const user = await requireUser();

  const [accessibleProjects, engineDocs, openAlertsCount] = await Promise.all([
    getAccessibleProjects(user),
    getEngineDocsAction(),
    getOpenAlertsCountAction(),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <Navbar
        user={user}
        projects={accessibleProjects}
        openAlertsCount={openAlertsCount}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <SettingsView user={user} engineDocs={engineDocs} />
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsLoading />}>
      <SettingsContent />
    </Suspense>
  );
}
