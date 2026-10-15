export default function SuppliesLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8" aria-label="Loading supplies">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
      <div className="h-16 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="grid grid-cols-4 gap-4">
            <div className="h-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        ))}
      </div>
    </div>
  );
}
