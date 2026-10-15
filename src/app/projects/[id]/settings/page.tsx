import { requireUser, getAccessibleProjects } from '@/lib/auth-helpers';
import { canAccessProject } from '@/lib/rbac';
import { notFound, redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { Navbar } from '@/components/navbar';
import { ProjectNav } from '@/components/project-nav';
import { ActionButton } from '@/components/action-button';
import { updateThresholdsAction } from '@/app/actions/water-actions';
import { Sliders, Users, Info } from 'lucide-react';
import { RoleBadge } from '@/components/role-badge';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectSettingsPage({ params }: PageProps) {
  const user = await requireUser();
  const { id } = await params;

  // Site Engineers cannot access settings/thresholds
  if (user.role === 'SITE_ENGINEER') {
    redirect(`/403?from=/projects/${id}/settings&reason=unauthorized_for_site_engineer`);
  }

  const accessibleProjects = await getAccessibleProjects(user);
  const accessibleIds = accessibleProjects.map((p) => p.id);

  if (!canAccessProject(user, id, accessibleIds)) {
    redirect(`/403?from=/projects/${id}/settings&reason=unauthorized`);
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
    },
  });

  if (!project) notFound();

  const isAuditor = user.role === 'AUDITOR';

  async function handleUpdate(formData: FormData) {
    'use server';
    await updateThresholdsAction(id, formData);
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <Navbar user={user} currentProjectId={id} projects={accessibleProjects} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Project Settings & Engineering Thresholds
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Configure acceptable unaccounted water limits, pipe design velocities, and view team roles.
          </p>
        </div>

        <ProjectNav projectId={id} role={user.role} />

        {isAuditor && (
          <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-xs text-purple-800 dark:text-purple-300">
            <Info className="w-4 h-4 shrink-0" />
            <span>
              <strong>Auditor Inspection Mode:</strong> Project settings are displayed in read-only format. Modifications are restricted to Project Managers.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Thresholds Form */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-950/60 flex items-center justify-center text-sky-600 dark:text-sky-400">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Hydraulic & Threshold Parameters
                </h2>
                <p className="text-xs text-slate-500">
                  Global parameters utilized by the calculation engine for this project.
                </p>
              </div>
            </div>

            <form action={handleUpdate} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Unaccounted Water Threshold (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  name="unaccountedThresholdPercent"
                  defaultValue={project.unaccountedThresholdPercent}
                  disabled={isAuditor}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                />
                <p className="text-[11px] text-slate-500">
                  Daily difference exceeding this percentage triggers an anomalous balance alert. Default is 15%.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Assumed Design Velocity (inches/second)
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="assumedVelocityInPerSec"
                  defaultValue={project.assumedVelocityInPerSec}
                  disabled={isAuditor}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:cursor-not-allowed"
                />
                <p className="text-[11px] text-slate-500">
                  Default velocity applied to pipe flow records when no flow meter velocity is provided (~1.2 m/s). Default is 47.24 in/s.
                </p>
              </div>

              <div className="pt-2">
                <ActionButton
                  userRole={user.role}
                  size="md"
                  variant="primary"
                  disabled={isAuditor}
                >
                  <span>Save Threshold Changes</span>
                </ActionButton>
              </div>
            </form>
          </div>

          {/* Assigned Project Members Panel */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <Users className="w-4 h-4 text-sky-600" />
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Assigned Team Members ({project.members.length})
              </h2>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {project.members.map((m) => (
                <div key={m.userId} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">
                      {m.user.name}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{m.user.email}</div>
                  </div>
                  <RoleBadge role={m.user.role} showIcon={false} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
