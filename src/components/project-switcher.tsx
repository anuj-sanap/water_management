'use client';

import { useRouter } from 'next/navigation';
import { Building2, ChevronDown } from 'lucide-react';

interface ProjectOption {
  id: string;
  name: string;
  location: string;
}

interface ProjectSwitcherProps {
  currentProjectId?: string;
  projects: ProjectOption[];
}

export function ProjectSwitcher({ currentProjectId, projects }: ProjectSwitcherProps) {
  const router = useRouter();

  if (projects.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Building2 className="w-4 h-4" />
        <span>No assigned projects</span>
      </div>
    );
  }

  const activeProject = projects.find((p) => p.id === currentProjectId) || projects[0];

  return (
    <div className="relative inline-flex items-center">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors">
        <Building2 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
        <select
          value={activeProject?.id || ''}
          onChange={(e) => {
            const nextId = e.target.value;
            if (nextId) {
              router.push(`/projects/${nextId}`);
            }
          }}
          className="bg-transparent text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none cursor-pointer pr-6 appearance-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
      </div>
    </div>
  );
}
