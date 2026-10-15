import { requireUser, getAccessibleProjects } from '@/lib/auth-helpers';
import { canAccessProject } from '@/lib/rbac';
import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NewConsumptionRecordPage({ params }: PageProps) {
  const user = await requireUser();
  const { id } = await params;
  if (user.role === 'AUDITOR') {
    redirect(`/403?from=/projects/${id}/consumption/new&reason=read_only_for_auditors`);
  }

  const projects = await getAccessibleProjects(user);
  if (!canAccessProject(user, id, projects.map((project) => project.id))) {
    redirect(`/403?from=/projects/${id}/consumption/new&reason=unauthorized`);
  }
  redirect(`/projects/${id}/consumption?new=1`);
}
