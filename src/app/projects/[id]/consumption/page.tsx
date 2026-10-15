import { requireUser, getAccessibleProjects } from '@/lib/auth-helpers';
import { canAccessProject, hasPermission } from '@/lib/rbac';
import { notFound, redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { Navbar } from '@/components/navbar';
import { ProjectNav } from '@/components/project-nav';
import { ConsumptionManagement } from './consumption-management';
import { cubicMetresToLitres } from '@/lib/water-service';
import { ConsumptionMethod, Prisma } from '@prisma/client';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    new?: string;
    page?: string;
    from?: string;
    to?: string;
    activity?: string;
    method?: string;
    q?: string;
  }>;
}

export default async function ConsumptionPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const accessibleProjects = await getAccessibleProjects(user);
  const accessibleIds = accessibleProjects.map((project) => project.id);
  if (!canAccessProject(user, id, accessibleIds)) {
    redirect(`/403?from=/projects/${id}/consumption&reason=unauthorized`);
  }

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  const pageSize = 50;
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const where: Prisma.ConsumptionRecordWhereInput = { projectId: id };
  const date: Prisma.DateTimeFilter = {};
  if (query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from)) {
    date.gte = new Date(`${query.from}T00:00:00.000Z`);
  }
  if (query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
    date.lte = new Date(`${query.to}T23:59:59.999Z`);
  }
  if (date.gte || date.lte) where.date = date;
  if (query.activity) where.activityTypeId = query.activity;
  if (Object.values(ConsumptionMethod).includes(query.method as ConsumptionMethod)) {
    where.method = query.method as ConsumptionMethod;
  }
  const search = query.q?.trim().slice(0, 100);
  if (search) {
    where.OR = [
      { locationOrZone: { contains: search } },
      { notes: { contains: search } },
      { activityType: { is: { name: { contains: search } } } },
      { createdBy: { is: { name: { contains: search } } } },
    ];
  }

  const [records, activities, totalCount, totals] = await Promise.all([
    prisma.consumptionRecord.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        activityType: { select: { id: true, name: true, color: true } },
        createdBy: { select: { id: true, name: true, role: true } },
      },
    }),
    prisma.activityType.findMany({
      where: { OR: [{ projectId: id }, { projectId: null }], active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true },
    }),
    prisma.consumptionRecord.count({ where }),
    prisma.consumptionRecord.aggregate({ where, _sum: { volumeM3: true } }),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <Navbar user={user} currentProjectId={id} projects={accessibleProjects} />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Water consumption
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Record measured and calculated water use for {project.name}.
          </p>
        </div>
        <ProjectNav projectId={id} role={user.role} />
        <ConsumptionManagement
          projectId={id}
          assumedVelocityInPerSec={project.assumedVelocityInPerSec}
          user={{ id: user.id, role: user.role }}
          canCreate={hasPermission(user.role, 'consumption:create')}
          initialOpen={query.new === '1'}
          activities={activities}
          records={records.map((record) => ({
            id: record.id,
            date: record.date.toISOString(),
            activityTypeId: record.activityTypeId,
            activity: record.activityType,
            method: record.method,
            inputsJson: record.inputsJson,
            volumeM3: record.volumeM3,
            volumeLitres: cubicMetresToLitres(record.volumeM3),
            usedAssumedVelocity: record.usedAssumedVelocity,
            warningsJson: record.warningsJson,
            locationOrZone: record.locationOrZone,
            notes: record.notes,
            createdById: record.createdById,
            createdAt: record.createdAt.toISOString(),
            addedBy: record.createdBy.name,
            addedByRole: record.createdBy.role,
          }))}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          totalVolumeM3={totals._sum.volumeM3 ?? 0}
          initialFilters={{
            from: query.from ?? '',
            to: query.to ?? '',
            activity: query.activity ?? '',
            method: Object.values(ConsumptionMethod).includes(query.method as ConsumptionMethod) ? query.method! : '',
            search: query.q ?? '',
          }}
        />
      </main>
    </div>
  );
}
