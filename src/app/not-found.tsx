import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 dark:bg-slate-950">
      <section className="w-full max-w-lg space-y-5 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
          <FileQuestion aria-hidden="true" className="size-7" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">404</p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Page not found</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This page may have moved or you may not have access to it.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </section>
    </main>
  );
}
