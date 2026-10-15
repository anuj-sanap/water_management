import { requireUser, getAccessibleProjects } from '@/lib/auth-helpers';
import { canAccessProject } from '@/lib/rbac';
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NewWaterSupplyPage({ params }: PageProps) {
  const user = await requireUser();
  const { id } = await params;

  // Strict Auditor Block: redirect immediately to 403
  if (user.role === 'AUDITOR') {
    redirect(`/403?from=/projects/${id}/supplies/new&reason=read_only_for_auditors`);
  }

  const accessibleProjects = await getAccessibleProjects(user);
  const accessibleIds = accessibleProjects.map((p) => p.id);

  if (!canAccessProject(user, id, accessibleIds)) {
    redirect(`/403?from=/projects/${id}/supplies/new&reason=unauthorized`);
  }

  redirect(`/projects/${id}/supplies?new=1`);
}
