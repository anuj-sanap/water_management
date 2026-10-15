import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDashboardRedirect({ params }: PageProps) {
  const { id } = await params;
  redirect(`/dashboard?project=${id}`);
}
