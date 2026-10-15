'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  Droplets,
  Gauge,
  Network,
  Waves,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConsumptionMethod, type Role } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { canDeleteRecord, canEditRecord } from '@/lib/rbac';
import { deleteConsumptionAction } from '@/app/actions/water-actions';
import { ConsumptionDetailSheet } from './consumption-detail-sheet';
import { ConsumptionFormSheet, type ConsumptionTemplate } from './consumption-form-sheet';

export interface ActivityOption {
  id: string;
  name: string;
  color: string;
}

export interface ConsumptionRow {
  id: string;
  date: string;
  activityTypeId: string;
  activity: ActivityOption;
  method: ConsumptionMethod;
  inputsJson: string;
  volumeM3: number;
  volumeLitres: number;
  usedAssumedVelocity: boolean;
  warningsJson: string | null;
  locationOrZone: string | null;
  notes: string | null;
  createdById: string;
  createdAt: string;
  addedBy: string;
  addedByRole: Role;
}

interface ConsumptionManagementProps {
  projectId: string;
  assumedVelocityInPerSec: number;
  user: { id: string; role: Role };
  canCreate: boolean;
  initialOpen: boolean;
  activities: ActivityOption[];
  records: ConsumptionRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalVolumeM3: number;
  initialFilters: { from: string; to: string; activity: string; method: string; search: string };
}

const METHOD_DETAILS: Record<ConsumptionMethod, { label: string; icon: typeof Gauge }> = {
  FLOW_METER: { label: 'Flow meter', icon: Gauge },
  PIPE: { label: 'Pipe', icon: Network },
  DIRECT: { label: 'Direct entry', icon: Droplets },
};

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(date));
}

function volumeLabel(volumeM3: number) {
  return `${new Intl.NumberFormat(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(volumeM3)} m³`;
}

function UnitValue({ volumeM3, volumeLitres }: { volumeM3: number; volumeLitres: number }) {
  if (volumeM3 < 1) {
    return (
      <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
        {new Intl.NumberFormat().format(volumeLitres)} L
        <span className="ml-1 text-xs font-normal text-slate-500">({volumeLabel(volumeM3)})</span>
      </span>
    );
  }
  return (
    <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
      {volumeLabel(volumeM3)}
      <span className="ml-1 text-xs font-normal text-slate-500">({new Intl.NumberFormat().format(volumeLitres)} L)</span>
    </span>
  );
}

export function ConsumptionManagement({
  projectId,
  assumedVelocityInPerSec,
  user,
  canCreate,
  initialOpen,
  activities,
  records,
  page,
  pageSize,
  totalCount,
  totalVolumeM3,
  initialFilters,
}: ConsumptionManagementProps) {
  const router = useRouter();
  const [dateFrom, setDateFrom] = useState(initialFilters.from);
  const [dateTo, setDateTo] = useState(initialFilters.to);
  const [activityId, setActivityId] = useState(initialFilters.activity);
  const [method, setMethod] = useState(initialFilters.method);
  const [search, setSearch] = useState(initialFilters.search);
  const [groupByDay, setGroupByDay] = useState(true);
  const [entryOpen, setEntryOpen] = useState(initialOpen);
  const [editing, setEditing] = useState<ConsumptionRow | null>(null);
  const [template, setTemplate] = useState<ConsumptionTemplate | null>(null);
  const [detail, setDetail] = useState<ConsumptionRow | null>(null);
  const [deleting, setDeleting] = useState<ConsumptionRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const filteredRecords = records;
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

  const groups = useMemo(() => {
    const result = new Map<string, ConsumptionRow[]>();
    for (const record of filteredRecords) {
      const date = record.date.slice(0, 10);
      const dayRecords = result.get(date) ?? [];
      dayRecords.push(record);
      result.set(date, dayRecords);
    }
    return Array.from(result.entries());
  }, [filteredRecords]);

  const presets = useMemo(() => {
    const seen = new Set<string>();
    return records.filter((record) => {
      const key = `${record.activityTypeId}:${record.method}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 3);
  }, [records]);

  const openNew = (seed?: ConsumptionRow) => {
    setEditing(null);
    setTemplate(seed ? {
      activityTypeId: seed.activityTypeId,
      method: seed.method,
      inputsJson: seed.inputsJson,
      locationOrZone: seed.locationOrZone,
      notes: seed.notes,
    } : null);
    setEntryOpen(true);
  };

  const closeEntry = () => {
    setEntryOpen(false);
    setEditing(null);
    setTemplate(null);
  };

  const deleteRecord = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await deleteConsumptionAction(deleting.id);
      toast.success('Consumption record deleted.');
      setDeleting(null);
      setDetail(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the consumption record.');
    } finally {
      setIsDeleting(false);
    }
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setActivityId('');
    setMethod('');
    setSearch('');
    router.replace(window.location.pathname, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Consumption log</h2>
            <p className="text-xs text-slate-500">{filteredRecords.length} {filteredRecords.length === 1 ? 'entry' : 'entries'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreate && records[0] && (
              <Button type="button" variant="outline" onClick={() => openNew(records[0])}>
                <Waves />Duplicate last entry
              </Button>
            )}
            {canCreate && (
              <Button data-shortcut-new type="button" onClick={() => openNew()}>
                <Droplets />Add consumption
              </Button>
            )}
          </div>
        </div>

        {canCreate && presets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Quick add</span>
            {presets.map((preset) => (
              <button
                key={`${preset.activityTypeId}-${preset.method}`}
                type="button"
                onClick={() => openNew(preset)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-sky-300 hover:bg-sky-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-sky-950/40"
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: preset.activity.color }} />
                {preset.activity.name} · {METHOD_DETAILS[preset.method].label}
              </button>
            ))}
          </div>
        )}

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
            Activity
            <select
              value={activityId}
              onChange={(event) => { setActivityId(event.target.value); updateQuery('activity', event.target.value); }}
              className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">All activities</option>
              {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Method
            <select
              value={method}
              onChange={(event) => { setMethod(event.target.value); updateQuery('method', event.target.value); }}
              className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">All methods</option>
              {Object.entries(METHOD_DETAILS).map(([value, details]) => <option key={value} value={value}>{details.label}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            Search entries
            <Input
              type="search"
              data-shortcut-search
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Activity, location, notes"
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {(dateFrom || dateTo || activityId || method || search) ? (
            <button type="button" onClick={clearFilters} className="text-xs font-medium text-sky-700 hover:underline dark:text-sky-300">
              Clear filters
            </button>
          ) : <span />}
          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={groupByDay} onChange={(event) => setGroupByDay(event.target.checked)} className="size-4 rounded border-slate-300 accent-sky-600" />
            Group by day
          </label>
        </div>
      </section>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="text-slate-600 dark:text-slate-300">
          <span>{totalCount === 0 ? 'No records' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`}</span>
          <span className="ml-3 font-semibold text-slate-900 dark:text-white">
            Filtered total: {volumeLabel(totalVolumeM3)}
          </span>
        </div>
        <nav aria-label="Consumption records pagination" className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => {
            const params = new URLSearchParams(window.location.search);
            params.set('page', String(page - 1));
            router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false });
          }}>Previous</Button>
          <span className="tabular-nums">Page {page} of {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => {
            const params = new URLSearchParams(window.location.search);
            params.set('page', String(page + 1));
            router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false });
          }}>Next</Button>
        </nav>
      </section>

      {canCreate && presets.length === 0 && activities.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Add an active project activity before recording consumption.
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Zone / location</th>
                <th className="px-4 py-3 text-right">Volume</th>
                <th className="px-4 py-3">Added by</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([date, dayRecords]) => (
                <FragmentDay
                  key={date}
                  date={date}
                  records={dayRecords}
                  grouped={groupByDay}
                  user={user}
                  onDetail={setDetail}
                  onEdit={(record) => {
                    setEditing(record);
                    setTemplate(null);
                    setEntryOpen(true);
                  }}
                  onDelete={setDeleting}
                />
              ))}
              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={7} className="h-48 px-4 text-center">
                    <CalendarDays className="mx-auto mb-2 size-7 text-slate-400" />
                    {records.length === 0 ? (
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-900 dark:text-white">No consumption recorded yet</p>
                        <p className="text-sm text-slate-500">Start with a flow meter, pipe calculation, or direct volume entry.</p>
                        {canCreate && <Button className="mt-2" onClick={() => openNew()}><Droplets />Add first entry</Button>}
                      </div>
                    ) : (
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">No matching entries</p>
                        <p className="text-sm text-slate-500">Adjust or clear the filters.</p>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {entryOpen && (
        <ConsumptionFormSheet
          key={editing?.id ?? (template ? `${template.activityTypeId}-${template.method}` : 'new')}
          projectId={projectId}
          assumedVelocityInPerSec={assumedVelocityInPerSec}
          activities={activities}
          record={editing}
          template={template}
          onClose={closeEntry}
          onSaved={(addAnother) => {
            router.refresh();
            if (!addAnother) closeEntry();
          }}
        />
      )}

      <ConsumptionDetailSheet
        projectId={projectId}
        record={detail}
        onClose={() => setDetail(null)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title="Delete consumption record?"
        description="This consumption entry will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete record"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={deleteRecord}
      />
      <div className="sr-only" aria-live="polite">{filteredRecords.length} consumption entries shown on this page</div>
    </div>
  );
}

function FragmentDay({
  date,
  records,
  grouped,
  user,
  onDetail,
  onEdit,
  onDelete,
}: {
  date: string;
  records: ConsumptionRow[];
  grouped: boolean;
  user: { id: string; role: Role };
  onDetail: (record: ConsumptionRow) => void;
  onEdit: (record: ConsumptionRow) => void;
  onDelete: (record: ConsumptionRow) => void;
}) {
  const subtotal = records.reduce((total, record) => total + record.volumeM3, 0);
  return (
    <>
      {grouped && (
        <tr className="border-y border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/30">
          <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{dateLabel(`${date}T12:00:00.000Z`)}</td>
          <td className="px-4 py-2 text-right text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">{volumeLabel(subtotal)} subtotal</td>
          <td colSpan={2} className="px-4 py-2 text-right text-xs text-slate-500">{records.length} {records.length === 1 ? 'entry' : 'entries'}</td>
        </tr>
      )}
      {records.map((record) => {
        const canEdit = canEditRecord(user, record);
        const canDelete = canDeleteRecord(user, record);
        const MethodIcon = METHOD_DETAILS[record.method].icon;
        return (
          <tr
            key={record.id}
            tabIndex={0}
            role="button"
            onClick={() => onDetail(record)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onDetail(record);
              }
            }}
            className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-sky-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 dark:border-slate-800 dark:hover:bg-slate-800/40"
          >
            <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 dark:text-white">{dateLabel(record.date)}</td>
            <td className="px-4 py-3">
              <span className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${record.activity.color}22`, color: record.activity.color }}>
                <span className="size-2 rounded-full" style={{ backgroundColor: record.activity.color }} />
                {record.activity.name}
              </span>
            </td>
            <td className="px-4 py-3">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                <MethodIcon className="size-3.5" />{METHOD_DETAILS[record.method].label}
              </span>
              {record.usedAssumedVelocity && (
                <span title="Used the project default velocity, not a measured value." className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Assumed velocity
                </span>
              )}
            </td>
            <td className="max-w-48 truncate px-4 py-3 text-slate-600 dark:text-slate-300">{record.locationOrZone || '—'}</td>
            <td className="px-4 py-3 text-right tabular-nums">
              <UnitValue volumeM3={record.volumeM3} volumeLitres={record.volumeLitres} />
            </td>
            <td className="px-4 py-3">
              <span className="block text-slate-700 dark:text-slate-200">{record.addedBy}</span>
              <span className="text-xs text-slate-500">{record.addedByRole === 'PROJECT_MANAGER' ? 'Project manager' : record.addedByRole === 'SITE_ENGINEER' ? 'Site engineer' : 'Auditor'}</span>
            </td>
            <td className="px-4 py-3 text-right" onClick={(event) => event.stopPropagation()}>
              <div className="inline-flex gap-1">
                {canEdit && <Button type="button" variant="outline" size="xs" onClick={() => onEdit(record)}>Edit</Button>}
                {canDelete && <Button type="button" variant="ghost" size="xs" className="text-destructive" onClick={() => onDelete(record)}>Delete</Button>}
                {!canEdit && !canDelete && <span className="text-xs text-slate-400">{user.role === 'AUDITOR' ? 'Read only' : '—'}</span>}
              </div>
            </td>
          </tr>
        );
      })}
    </>
  );
}
