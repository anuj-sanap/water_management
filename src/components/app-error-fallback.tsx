'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export function AppErrorFallback({ error, reset }: AppErrorFallbackProps) {
  useEffect(() => {
    console.error('Application route error:', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <section
        role="alert"
        className="w-full max-w-lg space-y-5 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
          <AlertTriangle aria-hidden="true" className="size-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Something went wrong</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            The page could not be loaded. Try again or return to the dashboard.
          </p>
          {error.digest && <p className="text-xs text-slate-500">Reference: {error.digest}</p>}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={reset}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Return to dashboard</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
