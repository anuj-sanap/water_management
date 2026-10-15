'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownToLine, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { SupplySource, VolumeUnit, type Role } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { canDeleteRecord, canEditRecord } from '@/lib/rbac';
import { deleteSupplyAction } from '@/app/actions/water-actions';
import { SupplyFormSheet } from './supply-form-sheet';
import { SupplyImportDialog } from './supply-csv-import-dialog';

export interface SupplyRow {
  id: string;
  date: string;
  source: SupplySource;
  enteredVolume: number;
  enteredUnit: VolumeUnit;
  volumeM3: number;
  supplier: string | null;
  referenceNo: string | null;
  notes: string | null;
  createdById: string;
  createdAt: string;
  addedBy: string;
  addedByRole: Role;
}

interface SupplyManagementProps {
  projectId: string;
  user: { id: string; role: Role };
  canCreate: boolean;
  canImport: boolean;
  initialOpen: boolean;
  supplies: SupplyRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalVolumeM3: number;
  initialFilters: { from: string; to: string; source: string; search: string };
}

const SOURCE_LABELS: Record<SupplySource, string> = {
  TANKER: 'Tanker',
  MUNICIPAL: 'Municipal',
  BOREWELL: 'Borewell',
  STORAGE_TRANSFER: 'Storage transfer',
  OTHER: 'Other',
};

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function formatVolume(value: number) {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value);
}

export function SupplyManagement({
  projectId,
  user,
  canCreate,
  canImport,
  initialOpen,
  supplies,
  page,
  pageSize,
  totalCount,
  totalVolumeM3,
  initialFilters,
}: SupplyManagementProps) {
  const router = useRouter();
  const [dateFrom, setDateFrom] = useState(initialFilters.from);
  const [dateTo, setDateTo] = useState(initialFilters.to);
  const [source, setSource] = useState(initialFilters.source);
  const [search, setSearch] = useState(initialFilters.search);
  const [editing, setEditing] = useState<SupplyRow | null>(null);
  const [isSheetOpen, setSheetOpen] = useState(initialOpen);
  const [deleting, setDeleting] = useState<SupplyRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImportOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (initialOpen) {
      const url = new URL(window.location.href);
      url.searchParams.delete('new');
      window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [initialOpen]);

  useEffect(() => {
    if (search.trim() === initialFilters.search) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const value = search.trim();
      if (value) params.set('q', value);
      else params.delete('q');
      params.delete('new');
      params.delete('page');
      const query = params.toString();
      router.replace(`${window.location.pathname}${query ? `?${query}` : ''}`, { scroll: false });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, router, initialFilters.search]);

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
  const updateQuery = (key: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('new');
    params.delete('page');
    const query = params.toString();
    router.replace(`${window.location.pathname}${query ? `?${query}` : ''}`, { scroll: false });
  };

  const openNew = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    setSheetOpen(false);
    setEditing(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await deleteSupplyAction(deleting.id);
      toast.success('Supply record deleted.');
      setDeleting(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the supply record.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <SlidersHorizontal className="size-4 text-slate-500" />
          Filter supplies
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {canCreate && (
            <Button data-shortcut-new onClick={openNew}>
              <Plus />Log supply
            </Button>
          )}
          {canImport && (
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <ArrowDownToLine />Import CSV
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            From date
            <Input type="date" value={dateFrom} max={dateTo || localDateString()} onChange={(event) => { setDateFrom(event.target.value); updateQuery('from', event.target.value); }} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            To date
            <Input type="date" value={dateTo} min={dateFrom || undefined} max={localDateString()} onChange={(event) => { setDateTo(event.target.value); updateQuery('to', event.target.value); }} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Source
            <select
              value={source}
              onChange={(event) => { setSource(event.target.value); updateQuery('source', event.target.value); }}
              className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">All sources</option>
              {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Supplier or reference
            <span className="relative block">
              <Search className="absolute left-2.5 top-2 size-4 text-slate-400" />
              <Input
                type="search"
                data-shortcut-search
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search records"
                className="pl-8"
              />
            </span>
          </label>
        </div>
        {(dateFrom || dateTo || source || search) && (
          <button
            type="button"
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setSource('');
              setSearch('');
              router.replace(window.location.pathname, { scroll: false });
            }}
            className="mt-3 text-xs font-medium text-sky-700 hover:underline dark:text-sky-300"
          >
            Clear filters
          </button>
        )}
      </section>
      <nav aria-label="Supply records pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-slate-600 dark:text-slate-300">
          {totalCount === 0 ? 'No records' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => {
            const params = new URLSearchParams(window.location.search);
            params.set('page', String(page - 1));
            router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false });
          }}>Previous</Button>
          <span className="self-center tabular-nums">Page {page} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => {
            const params = new URLSearchParams(window.location.search);
            params.set('page', String(page + 1));
            router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false });
          }}>Next</Button>
        </div>
      </nav>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-800/60">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Reference no.</TableHead>
              <TableHead className="text-right">Entered volume</TableHead>
              <TableHead className="text-right">Volume (m³)</TableHead>
              <TableHead>Added by</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {supplies.map((supply) => {
              const mayEdit = canEditRecord(user, supply);
              const mayDelete = canDeleteRecord(user, supply);
              return (
                <TableRow key={supply.id}>
                  <TableCell className="font-medium">{formatDate(supply.date)}</TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
                      {SOURCE_LABELS[supply.source]}
                    </span>
                  </TableCell>
                  <TableCell>{supply.supplier || <span className="text-slate-400">—</span>}</TableCell>
                  <TableCell className="font-mono text-xs">{supply.referenceNo || <span className="font-sans text-slate-400">—</span>}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {new Intl.NumberFormat().format(supply.enteredVolume)} {supply.enteredUnit === VolumeUnit.M3 ? 'm³' : 'L'}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatVolume(supply.volumeM3)}</TableCell>
                  <TableCell>
                    <span className="block">{supply.addedBy}</span>
                    <span className="text-xs text-slate-500">{supply.addedByRole === 'PROJECT_MANAGER' ? 'Project manager' : supply.addedByRole === 'SITE_ENGINEER' ? 'Site engineer' : 'Auditor'}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {mayEdit && (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            setEditing(supply);
                            setSheetOpen(true);
                          }}
                          aria-label={`Edit supply from ${formatDate(supply.date)}`}
                        >
                          Edit
                        </Button>
                      )}
                      {mayDelete && (
                        <Button
                          variant="ghost"
                          size="xs"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleting(supply)}
                          aria-label={`Delete supply from ${formatDate(supply.date)}`}
                        >
                          Delete
                        </Button>
                      )}
                      {!mayEdit && !mayDelete && (
                        <span className="text-xs text-slate-400">
                          {user.role === 'AUDITOR' ? 'Read only' : 'No actions'}
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {supplies.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-44 whitespace-normal text-center">
                  {                  totalCount === 0 ? (
                    <div className="mx-auto max-w-sm space-y-2">
                      <p className="font-semibold text-slate-900 dark:text-white">No supply entries yet</p>
                      <p className="text-sm text-slate-500">Record a delivery to start tracking water received on this project.</p>
                      {canCreate && <Button size="sm" onClick={openNew}><Plus />Log first delivery</Button>}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900 dark:text-white">No matching deliveries</p>
                      <p className="text-sm text-slate-500">Try changing or clearing your filters.</p>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <tfoot className="border-t bg-slate-50 font-medium dark:border-slate-800 dark:bg-slate-800/40">
            <tr>
              <td colSpan={5} className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                Filtered total <span className="ml-1 text-xs font-normal">({totalCount} {totalCount === 1 ? 'record' : 'records'})</span>
              </td>
              <td className="px-4 py-3 text-right text-sm font-bold tabular-nums text-slate-900 dark:text-white">{formatVolume(totalVolumeM3)} m³</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </Table>
      </section>

      {isSheetOpen && (
        <SupplyFormSheet
          key={editing?.id ?? 'new'}
          projectId={projectId}
          record={editing}
          onClose={closeSheet}
          onSaved={() => {
            closeSheet();
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title="Delete supply record?"
        description="This delivery and its audit history will be permanently removed. This action cannot be undone."
        confirmLabel="Delete record"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={confirmDelete}
      />

      <SupplyImportDialog
        projectId={projectId}
        open={isImportOpen}
        onOpenChange={setImportOpen}
        onImported={() => router.refresh()}
      />

      <div className="sr-only" aria-live="polite">{supplies.length} supplies shown on this page</div>
    </div>
  );
}
