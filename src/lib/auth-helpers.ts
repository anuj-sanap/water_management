import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { Role } from '@prisma/client';
import { redirect } from 'next/navigation';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/**
 * Get current session user on server side.
 * Redirects to /login if not authenticated.
 */
export async function requireUser(): Promise<AuthenticatedUser> {
  const session = await auth();
  if (!session?.user?.id || !session?.user?.role) {
    redirect('/login');
  }
  return {
    id: session.user.id,
    name: session.user.name || '',
    email: session.user.email || '',
    role: session.user.role as Role,
  };
}

/**
 * Retrieve project IDs accessible by the user:
 * - PROJECT_MANAGER & AUDITOR: all projects
 * - SITE_ENGINEER: only assigned projects via ProjectMember
 */
export async function getAccessibleProjects(user: AuthenticatedUser) {
  if (user.role === 'PROJECT_MANAGER' || user.role === 'AUDITOR') {
    return prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, role: true, email: true } } },
        },
        _count: {
          select: {
            waterSupplies: true,
            consumptionRecords: true,
          },
        },
      },
    });
  }

  // SITE_ENGINEER: only assigned projects
  return prisma.project.findMany({
    where: {
      members: {
        some: {
          userId: user.id,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, role: true, email: true } } },
      },
      _count: {
        select: {
          waterSupplies: true,
          consumptionRecords: true,
        },
      },
    },
  });
}

/**
 * Returns list of accessible project IDs for fast lookup
 */
export async function getAccessibleProjectIds(user: AuthenticatedUser): Promise<string[]> {
  const projects = await getAccessibleProjects(user);
  return projects.map((p) => p.id);
}
