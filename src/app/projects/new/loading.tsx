export default function NewProjectLoading() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-8">
      <div className="flex items-center gap-3 text-slate-500">
        <div className="w-5 h-5 border-2 border-sky-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm font-medium">Loading project configuration...</span>
      </div>
    </div>
  );
}
