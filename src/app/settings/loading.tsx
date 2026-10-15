export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="h-16 bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 animate-pulse" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="h-10 w-72 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
        <div className="h-12 w-96 bg-slate-200 dark:bg-slate-800 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded-3xl animate-pulse" />
          <div className="h-80 bg-slate-200 dark:bg-slate-800 rounded-3xl animate-pulse" />
        </div>
      </div>
    </div>
  );
}
