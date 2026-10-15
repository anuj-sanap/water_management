'use client';

import { useEffect, useState, useTransition } from 'react';
import { LoaderCircle, Save, Truck } from 'lucide-react';
import { toast } from 'sonner';
import {
  createSupplyRecordAction,
  previewSupplyVolumeAction,
  updateSupplyRecordAction,
} from '@/app/actions/water-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { SupplySource, VolumeUnit } from '@prisma/client';
import type { SupplyRow } from './supply-management';

interface SupplyFormSheetProps {
  projectId: string;
  record: SupplyRow | null;
  onClose: () => void;
  onSaved: () => void;
}

interface SupplyFormValues {
  date: string;
  source: SupplySource;
  enteredVolume: string;
  enteredUnit: VolumeUnit;
  supplier: string;
  referenceNo: string;
  notes: string;
}

function todayLocal() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

const SOURCE_OPTIONS: Array<{ value: SupplySource; label: string }> = [
  { value: 'TANKER', label: 'Tanker delivery' },
  { value: 'MUNICIPAL', label: 'Municipal' },
  { value: 'BOREWELL', label: 'Borewell' },
  { value: 'STORAGE_TRANSFER', label: 'Storage transfer' },
  { value: 'OTHER', label: 'Other' },
];

function initialValues(record: SupplyRow | null): SupplyFormValues {
  return {
    date: record?.date.slice(0, 10) ?? todayLocal(),
    source: record?.source ?? 'TANKER',
    enteredVolume: record ? String(record.enteredVolume) : '',
    enteredUnit: record?.enteredUnit ?? 'M3',
    supplier: record?.supplier ?? '',
    referenceNo: record?.referenceNo ?? '',
    notes: record?.notes ?? '',
  };
}

export function SupplyFormSheet({
  projectId,
  record,
  onClose,
  onSaved,
}: SupplyFormSheetProps) {
  const [values, setValues] = useState(() => initialValues(record));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewState, setPreviewState] = useState<{
    key: string;
    result?: { volumeM3: number; volumeL: number };
    error?: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const previewKey = `${values.enteredUnit}:${values.enteredVolume}`;
  const preview = previewState?.key === previewKey ? previewState.result ?? null : null;
  const previewError = previewState?.key === previewKey ? previewState.error ?? '' : '';

  useEffect(() => {
    const volume = Number(values.enteredVolume);
    if (!values.enteredVolume || !Number.isFinite(volume) || volume <= 0) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await previewSupplyVolumeAction({
          projectId,
          volume,
          unit: values.enteredUnit === 'M3' ? 'm3' : 'L',
        });
        if (active && result.success) {
          setPreviewState({
            key: previewKey,
            result: { volumeM3: result.volumeM3, volumeL: result.volumeL },
          });
        } else if (active) {
          setPreviewState({
            key: previewKey,
            error: 'Conversion preview is unavailable. The saved volume will still be validated.',
          });
        }
      } catch (error) {
        if (active) {
          setPreviewState({
            key: previewKey,
            error: error instanceof Error ? error.message : 'Conversion preview is unavailable.',
          });
        }
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [projectId, previewKey, values.enteredUnit, values.enteredVolume]);

  const update = <K extends keyof SupplyFormValues>(field: K, value: SupplyFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    startTransition(async () => {
      try {
        const payload = {
          projectId,
          ...values,
        };
        const result = record
          ? await updateSupplyRecordAction(record.id, payload)
          : await createSupplyRecordAction(payload);
        if (!result.success) {
          setErrors(result.errors);
          toast.error('Check the highlighted fields.');
          return;
        }
        toast.success(record ? 'Supply record updated.' : 'Supply delivery recorded.');
        onSaved();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not save the supply record.');
      }
    });
  };

  const fieldClass = (field: string) =>
    `space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 ${errors[field] ? '[&_input]:border-destructive [&_select]:border-destructive [&_textarea]:border-destructive' : ''}`;

  return (
    <Sheet open onOpenChange={(open) => { if (!open && !isPending) onClose(); }}>
      <SheetContent
        side="right"
        className="h-[100dvh] w-screen max-w-none gap-0 rounded-none border-0 p-0 sm:w-[min(100vw,34rem)] sm:max-w-xl sm:rounded-l-2xl sm:border sm:border-border"
      >
        <SheetHeader className="border-b border-slate-200 px-5 py-5 pr-14 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              <Truck className="size-5" />
            </div>
            <div>
              <SheetTitle className="text-lg font-bold text-slate-900 dark:text-white">
                {record ? 'Edit supply delivery' : 'Log supply delivery'}
              </SheetTitle>
              <SheetDescription>
                Enter the delivery details. Volume is converted and verified before saving.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className={fieldClass('date')}>
                Delivery date
                <Input
                  type="date"
                  value={values.date}
                  max={todayLocal()}
                  required
                  aria-invalid={Boolean(errors.date)}
                  onChange={(event) => update('date', event.target.value)}
                  className="mt-1.5 h-10"
                />
                {errors.date && <span className="block text-xs font-normal text-destructive">{errors.date}</span>}
              </label>
              <label className={fieldClass('source')}>
                Source
                <select
                  value={values.source}
                  onChange={(event) => update('source', event.target.value as SupplySource)}
                  className="mt-1.5 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {SOURCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                {errors.source && <span className="block text-xs font-normal text-destructive">{errors.source}</span>}
              </label>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="supply-volume" className="text-sm font-medium text-slate-700 dark:text-slate-200">Delivered volume</label>
              <div className="flex gap-2">
                <Input
                  id="supply-volume"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder={values.enteredUnit === 'M3' ? 'e.g. 12.5' : 'e.g. 12500'}
                  value={values.enteredVolume}
                  aria-invalid={Boolean(errors.enteredVolume)}
                  onChange={(event) => update('enteredVolume', event.target.value)}
                  className="h-10 flex-1"
                />
                <div className="inline-flex h-10 shrink-0 rounded-lg border border-slate-200 p-1 dark:border-slate-700" aria-label="Volume unit">
                  {(['M3', 'L'] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      aria-pressed={values.enteredUnit === unit}
                      onClick={() => update('enteredUnit', unit)}
                      className={`rounded-md px-3 text-sm font-semibold transition-colors ${values.enteredUnit === unit ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                    >
                      {unit === 'M3' ? 'm³' : 'L'}
                    </button>
                  ))}
                </div>
              </div>
              {errors.enteredVolume && <p className="text-xs font-normal text-destructive">{errors.enteredVolume}</p>}
              {preview && (
                <p className="inline-flex rounded-lg bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 dark:bg-sky-950/70 dark:text-sky-100" aria-live="polite">
                  = {new Intl.NumberFormat(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(preview.volumeM3)} m³
                  <span className="ml-1 font-normal text-sky-700 dark:text-sky-300">
                    ({new Intl.NumberFormat().format(preview.volumeL)} L)
                  </span>
                </p>
              )}
              {previewError && <p className="text-xs font-normal text-amber-700 dark:text-amber-300" role="status">{previewError}</p>}
            </div>

            <label className={fieldClass('supplier')}>
              Supplier
              <Input
                value={values.supplier}
                maxLength={120}
                autoComplete="organization"
                placeholder="Supplier or tanker company"
                onChange={(event) => update('supplier', event.target.value)}
                className="mt-1.5 h-10"
              />
              {errors.supplier && <span className="block text-xs font-normal text-destructive">{errors.supplier}</span>}
            </label>

            <label className={fieldClass('referenceNo')}>
              Reference no.
              <Input
                value={values.referenceNo}
                maxLength={80}
                placeholder="Challan, invoice, or ticket number"
                onChange={(event) => update('referenceNo', event.target.value)}
                className="mt-1.5 h-10"
              />
              {errors.referenceNo && <span className="block text-xs font-normal text-destructive">{errors.referenceNo}</span>}
            </label>

            <label className={fieldClass('notes')}>
              Notes <span className="font-normal text-slate-400">(optional)</span>
              <textarea
                value={values.notes}
                maxLength={1000}
                rows={3}
                placeholder="Delivery details or field notes"
                onChange={(event) => update('notes', event.target.value)}
                className="mt-1.5 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              {errors.notes && <span className="block text-xs font-normal text-destructive">{errors.notes}</span>}
            </label>
          </div>

          <div className="flex gap-2 border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={isPending}>
              {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
              {isPending ? 'Saving…' : record ? 'Save changes' : 'Save delivery'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
