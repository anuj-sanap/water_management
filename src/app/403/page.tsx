import Link from 'next/link';
import { ShieldAlert, ArrowLeft, Droplets, LogOut } from 'lucide-react';
import { auth, signOut } from '@/auth';
import { Suspense } from 'react';

interface PageProps {
  searchParams: Promise<{ from?: string; reason?: string }>;
}

async function ForbiddenContent({ searchParams }: PageProps) {
  const session = await auth();
  const { from, reason } = await searchParams;

  const isAuditorReadOnly = reason === 'read_only_for_auditors';

  return (
    <div className="w-full max-w-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-xl border border-sky-100 dark:border-slate-800 p-8 sm:p-10 text-center relative overflow-hidden">
      {/* Decorative water wave accent */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-sky-500 via-cyan-400 to-blue-600" />

      <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center mb-6 shadow-sm">
        <ShieldAlert className="w-8 h-8 text-amber-600 dark:text-amber-400" />
      </div>

      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 mb-3">
        <Droplets className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
        <span>HydroTrack Security</span>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">
        Access Restricted (403)
      </h1>

      <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base leading-relaxed mb-6">
        {isAuditorReadOnly ? (
          <>
            <strong>Auditors have read-only access.</strong> As an auditor, you can inspect all project data, balances, and audit logs, but you cannot create, edit, or delete records.
          </>
        ) : (
          'Your account does not have sufficient role privileges to view or perform operations on this route.'
        )}
      </p>

      {session?.user && (
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 mb-6 border border-slate-200/70 dark:border-slate-700/60 text-left text-xs sm:text-sm space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 dark:text-slate-400">Signed in as:</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{session.user.name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500 dark:text-slate-400">Assigned Role:</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
              {session.user.role}
            </span>
          </div>
          {from && (
            <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700">
              <span className="text-slate-500 dark:text-slate-400">Attempted Path:</span>
              <code className="text-xs text-rose-600 dark:text-rose-400 font-mono truncate max-w-[200px]">
                {from}
              </code>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
        <Link
          href="/projects"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Projects
        </Link>

        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/login' });
          }}
          className="w-full sm:w-auto"
        >
          <button
            type="submit"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out / Switch User
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ForbiddenPage({ searchParams }: PageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-slate-50 to-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex flex-col justify-center items-center px-4 py-12">
      <Suspense fallback={<div className="text-slate-400 text-sm">Loading security verification...</div>}>
        <ForbiddenContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
