import { requireUser, getAccessibleProjects } from '@/lib/auth-helpers';
import { canAccessProject, hasPermission } from '@/lib/rbac';
import { notFound, redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { Navbar } from '@/components/navbar';
import { ProjectNav } from '@/components/project-nav';
import { SupplyManagement } from './supply-management';
import { Prisma, SupplySource } from '@prisma/client';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    new?: string;
    page?: string;
    from?: string;
    to?: string;
    source?: string;
    q?: string;
  }>;
}

export default async function WaterSuppliesPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const accessibleProjects = await getAccessibleProjects(user);
  const accessibleIds = accessibleProjects.map((project) => project.id);

  if (!canAccessProject(user, id, accessibleIds)) {
    redirect(`/403?from=/projects/${id}/supplies&reason=unauthorized`);
  }

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const pageSize = 50;
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const where: Prisma.WaterSupplyWhereInput = { projectId: id };
  const date: Prisma.DateTimeFilter = {};
  if (query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from)) {
    date.gte = new Date(`${query.from}T00:00:00.000Z`);
  }
  if (query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
    date.lte = new Date(`${query.to}T23:59:59.999Z`);
  }
  if (date.gte || date.lte) where.date = date;
  if (Object.values(SupplySource).includes(query.source as SupplySource)) {
    where.source = query.source as SupplySource;
  }
  const search = query.q?.trim().slice(0, 100);
  if (search) {
    where.OR = [
      { supplier: { contains: search } },
      { referenceNo: { contains: search } },
    ];
  }
  const [supplies, totalCount, totals] = await Promise.all([
    prisma.waterSupply.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { createdBy: { select: { id: true, name: true, role: true } } },
    }),
    prisma.waterSupply.count({ where }),
    prisma.waterSupply.aggregate({ where, _sum: { volumeM3: true } }),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <Navbar user={user} currentProjectId={id} projects={accessibleProjects} />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              Water supplies
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Deliveries and intake recorded for {project.name}.
            </p>
          </div>
        </div>

        <ProjectNav projectId={id} role={user.role} />
        <SupplyManagement
          projectId={id}
          user={{ id: user.id, role: user.role }}
          canCreate={hasPermission(user.role, 'supply:create')}
          canImport={user.role === 'PROJECT_MANAGER'}
          initialOpen={query.new === '1'}
          supplies={supplies.map((supply) => ({
            id: supply.id,
            date: supply.date.toISOString(),
            source: supply.source,
            enteredVolume: supply.enteredVolume,
            enteredUnit: supply.enteredUnit,
            volumeM3: supply.volumeM3,
            supplier: supply.supplier,
            referenceNo: supply.referenceNo,
            notes: supply.notes,
            createdById: supply.createdById,
            createdAt: supply.createdAt.toISOString(),
            addedBy: supply.createdBy.name,
            addedByRole: supply.createdBy.role,
          }))}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          totalVolumeM3={totals._sum.volumeM3 ?? 0}
          initialFilters={{
            from: query.from ?? '',
            to: query.to ?? '',
            source: Object.values(SupplySource).includes(query.source as SupplySource) ? query.source! : '',
            search: query.q ?? '',
          }}
        />
      </main>
    </div>
  );
}
