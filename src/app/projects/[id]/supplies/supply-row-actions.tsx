'use client';

import { useTransition } from 'react';
import { Role } from '@prisma/client';
import { Trash2, Loader2 } from 'lucide-react';
import { deleteSupplyAction } from '@/app/actions/water-actions';
import { AUDITOR_DISABLED_TOOLTIP, isWithin48Hours } from '@/lib/rbac';

interface SupplyRowActionsProps {
  supplyId: string;
  createdById: string;
  createdAt: string;
  user: {
    id: string;
    role: Role;
  };
}

export function SupplyRowActions({
  supplyId,
  createdById,
  createdAt,
  user,
}: SupplyRowActionsProps) {
  const [isPending, startTransition] = useTransition();

  const isAuditor = user.role === 'AUDITOR';
  const isPM = user.role === 'PROJECT_MANAGER';
  const isSiteEngineer = user.role === 'SITE_ENGINEER';

  let canDelete = false;
  let disabledTooltip = '';

  if (isAuditor) {
    canDelete = false;
    disabledTooltip = AUDITOR_DISABLED_TOOLTIP;
  } else if (isPM) {
    canDelete = true;
  } else if (isSiteEngineer) {
    const isOwn = createdById === user.id;
    const isRecent = isWithin48Hours(createdAt);

    if (!isOwn) {
      canDelete = false;
      disabledTooltip = 'Only original author can delete';
    } else if (!isRecent) {
      canDelete = false;
      disabledTooltip = 'Edit window expired (48 hours)';
    } else {
      canDelete = true;
    }
  }

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this water supply record?')) {
      startTransition(async () => {
        try {
          await deleteSupplyAction(supplyId);
        } catch (err: unknown) {
          alert(err instanceof Error ? err.message : 'Failed to delete record.');
        }
      });
    }
  };

  if (!canDelete) {
    return (
      <div className="relative group inline-block">
        <button
          type="button"
          disabled
          aria-label={disabledTooltip}
          className="p-1.5 rounded-lg text-slate-300 dark:text-slate-700 cursor-not-allowed opacity-50"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        {disabledTooltip && (
          <div className="absolute right-0 bottom-full mb-1.5 hidden group-hover:flex items-center px-2 py-1 rounded bg-slate-900 text-white text-[11px] font-medium whitespace-nowrap shadow-md z-50 pointer-events-none">
            {disabledTooltip}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      title="Delete record"
      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
    >
      {isPending ? <Loader2 className="w-4 h-4 animate-spin text-rose-600" /> : <Trash2 className="w-4 h-4" />}
    </button>
  );
}
