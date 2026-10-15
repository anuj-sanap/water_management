'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  Droplets,
  Gauge,
  LoaderCircle,
  Network,
  Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConsumptionMethod } from '@prisma/client';
import { createConsumptionRecordAction, updateConsumptionRecordAction } from '@/app/actions/water-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { ActivityOption, ConsumptionRow } from './consumption-management';

export interface ConsumptionTemplate {
  activityTypeId: string;
  method: ConsumptionMethod;
  inputsJson: string;
  locationOrZone: string | null;
  notes: string | null;
}

interface ConsumptionFormValues {
  date: string;
  activityTypeId: string;
  locationOrZone: string;
  method: ConsumptionMethod;
  flowRate: string;
  flowRateUnit: string;
  flowTime: string;
  flowTimeUnit: string;
  diameterInches: string;
  velocityInPerSec: string;
  useDefaultVelocity: boolean;
  pipeTime: string;
  pipeTimeUnit: string;
  volumeLitres: string;
  notes: string;
}

interface PreviewResult {
  valid: boolean;
  values: Record<string, unknown> | null;
  units: Record<string, string>;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
}

function todayLocal() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function parseInputs(json: string | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function asString(value: unknown, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}

function initialFormValues(
  record: ConsumptionRow | null,
  template: ConsumptionTemplate | null,
  activities: ActivityOption[]
): ConsumptionFormValues {
  const source = record ?? template;
  const inputs = parseInputs(source?.inputsJson);
  return {
    date: record?.date.slice(0, 10) ?? todayLocal(),
    activityTypeId: source?.activityTypeId ?? activities[0]?.id ?? '',
    locationOrZone: record?.locationOrZone ?? template?.locationOrZone ?? '',
    method: source?.method ?? 'DIRECT',
    flowRate: asString(inputs.flowRate),
    flowRateUnit: asString(inputs.flowRateUnit, 'm3/h'),
    flowTime: asString(inputs.time),
    flowTimeUnit: asString(inputs.timeUnit, 'min'),
    diameterInches: asString(inputs.diameterInches),
    velocityInPerSec: asString(inputs.velocityInPerSec),
    useDefaultVelocity: inputs.velocityInPerSec === undefined,
    pipeTime: asString(inputs.time ?? inputs.timeSeconds),
    pipeTimeUnit: asString(inputs.timeUnit, 's'),
    volumeLitres: asString(inputs.volumeLitres),
    notes: record?.notes ?? template?.notes ?? '',
  };
}

function numberOrMissing(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value);
}

function makeMethodInputs(values: ConsumptionFormValues): Record<string, unknown> {
  if (values.method === 'FLOW_METER') {
    return {
      flowRate: numberOrMissing(values.flowRate),
      flowRateUnit: values.flowRateUnit,
      time: numberOrMissing(values.flowTime),
      timeUnit: values.flowTimeUnit,
    };
  }
  if (values.method === 'PIPE') {
    return {
      diameterInches: numberOrMissing(values.diameterInches),
      ...(!values.useDefaultVelocity ? { velocityInPerSec: numberOrMissing(values.velocityInPerSec) } : {}),
      time: numberOrMissing(values.pipeTime),
      timeUnit: values.pipeTimeUnit,
    };
  }
  return { volumeLitres: numberOrMissing(values.volumeLitres) };
}

const methods: Array<{
  value: ConsumptionMethod;
  label: string;
  help: string;
  icon: typeof Gauge;
}> = [
  { value: 'FLOW_METER', label: 'Flow meter', help: 'I have a meter reading', icon: Gauge },
  { value: 'PIPE', label: 'Pipe', help: 'I know size and run time', icon: Network },
  { value: 'DIRECT', label: 'Direct entry', help: 'I know the volume', icon: Droplets },
];

export function ConsumptionFormSheet({
  projectId,
  assumedVelocityInPerSec,
  activities,
  record,
  template,
  onClose,
  onSaved,
}: {
  projectId: string;
  assumedVelocityInPerSec: number;
  activities: ActivityOption[];
  record: ConsumptionRow | null;
  template: ConsumptionTemplate | null;
  onClose: () => void;
  onSaved: (addAnother: boolean) => void;
}) {
  const [values, setValues] = useState(() => initialFormValues(record, template, activities));
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const selectedActivity = activities.find((activity) => activity.id === values.activityTypeId);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const method = values.method === 'FLOW_METER' ? 'flowMeter' : values.method === 'PIPE' ? 'pipe' : 'direct';
        const response = await fetch('/api/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            projectId,
            method,
            inputs: makeMethodInputs(values),
            intent: 'entry',
          }),
        });
        const body: unknown = await response.json();
        if (!response.ok) {
          const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : 'Preview failed.';
          throw new Error(message);
        }
        if (active) {
          setPreview(body as PreviewResult);
          setPreviewError('');
        }
      } catch (error) {
        if (active && error instanceof Error && error.name !== 'AbortError') {
          setPreview(null);
          setPreviewError(error.message);
        }
      }
    }, 250);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [projectId, values]);

  const update = <K extends keyof ConsumptionFormValues>(field: K, value: ConsumptionFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const errorFor = (field: string) => formErrors[field] ?? preview?.errors.find((error) => error.field === field)?.message;

  const submit = (mode: 'save' | 'another') => {
    setFormErrors({});
    startTransition(async () => {
      try {
        const payload = {
          projectId,
          date: values.date,
          activityTypeId: values.activityTypeId,
          locationOrZone: values.locationOrZone,
          notes: values.notes,
          method: values.method,
          inputs: makeMethodInputs(values),
        };
        const result = record
          ? await updateConsumptionRecordAction(record.id, payload)
          : await createConsumptionRecordAction(payload);
        if (!result.success) {
          setFormErrors(result.errors);
          toast.error('Check the highlighted fields.');
          return;
        }
        toast.success(record ? 'Consumption updated.' : 'Consumption saved.');
        if (mode === 'another' && !record) {
          setValues((current) => ({
            ...current,
            date: todayLocal(),
            locationOrZone: '',
            flowRate: '',
            flowTime: '',
            diameterInches: '',
            velocityInPerSec: '',
            useDefaultVelocity: true,
            pipeTime: '',
            volumeLitres: '',
            notes: '',
          }));
          setPreview(null);
          setPreviewError('');
          onSaved(true);
        } else {
          onSaved(false);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not save consumption.');
      }
    });
  };

  const errorClass = (field: string) => errorFor(field) ? 'border-destructive focus-visible:ring-destructive/20' : '';

  return (
    <Sheet open onOpenChange={(open) => { if (!open && !isPending) onClose(); }}>
      <SheetContent side="right" className="h-[100dvh] w-screen max-w-none gap-0 rounded-none border-0 p-0 sm:w-[min(100vw,58rem)] sm:max-w-5xl sm:rounded-l-2xl sm:border sm:border-border">
        <SheetHeader className="border-b border-slate-200 px-5 py-4 pr-14 dark:border-slate-800">
          <SheetTitle className="text-lg font-bold text-slate-900 dark:text-white">
            {record ? 'Edit consumption' : template ? 'Quick add consumption' : 'Add consumption'}
          </SheetTitle>
          <SheetDescription>Choose how you measured the water. The calculation is validated by the water engine.</SheetDescription>
        </SheetHeader>

        <form onSubmit={(event) => { event.preventDefault(); submit('save'); }} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="space-y-5">
              <section className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">1. Delivery details</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                    Date
                    <Input type="date" value={values.date} max={todayLocal()} onChange={(event) => update('date', event.target.value)} className={`mt-1 h-10 ${errorClass('date')}`} aria-invalid={Boolean(errorFor('date'))} />
                    {errorFor('date') && <span className="block text-xs font-normal text-destructive">{errorFor('date')}</span>}
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                    Activity
                    <select
                      value={values.activityTypeId}
                      onChange={(event) => update('activityTypeId', event.target.value)}
                      className={`mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${errorClass('activityTypeId')}`}
                      aria-invalid={Boolean(errorFor('activityTypeId'))}
                    >
                      <option value="">Select activity…</option>
                      {activities.map((activity) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}
                    </select>
                    {selectedActivity && (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: selectedActivity.color, color: '#fff' }}>
                        <span className="size-2 rounded-full bg-white/80" />{selectedActivity.name}
                      </span>
                    )}
                    {errorFor('activityTypeId') && <span className="block text-xs font-normal text-destructive">{errorFor('activityTypeId')}</span>}
                  </label>
                </div>
                <label className="block space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                  Zone / location <span className="font-normal text-slate-400">(optional)</span>
                  <Input value={values.locationOrZone} maxLength={120} placeholder="e.g. Tower B, Level 4" onChange={(event) => update('locationOrZone', event.target.value)} className="mt-1 h-10" />
                </label>
              </section>

              <section className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">2. How are you measuring?</h2>
                <div className="grid grid-cols-3 gap-2">
                  {methods.map((option) => {
                    const Icon = option.icon;
                    const selected = values.method === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => update('method', option.value)}
                        className={`min-h-24 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:p-3 ${selected ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-950/40' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'}`}
                      >
                        <Icon className={`mb-2 size-5 ${selected ? 'text-sky-700 dark:text-sky-300' : 'text-slate-500'}`} />
                        <span className="block text-xs font-semibold text-slate-900 dark:text-white sm:text-sm">{option.label}</span>
                        <span className="mt-0.5 block text-[10px] leading-tight text-slate-500 sm:text-xs">{option.help}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">3. Measurement</h2>
                {values.method === 'FLOW_METER' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                      Flow rate
                      <div className="mt-1 flex gap-2">
                        <Input type="number" inputMode="decimal" step="any" value={values.flowRate} placeholder="0.0" onChange={(event) => update('flowRate', event.target.value)} className={`h-10 ${errorClass('flowRate')}`} aria-invalid={Boolean(errorFor('flowRate'))} />
                        <select value={values.flowRateUnit} onChange={(event) => update('flowRateUnit', event.target.value)} className={`h-10 w-28 rounded-lg border border-input bg-background px-2 text-sm ${errorClass('flowRateUnit')}`} aria-label="Flow rate unit">
                          {['m3/s', 'L/s', 'L/min', 'm3/h', 'L/h'].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                        </select>
                      </div>
                      {errorFor('flowRate') && <span className="block text-xs font-normal text-destructive">{errorFor('flowRate')}</span>}
                      {errorFor('flowRateUnit') && <span className="block text-xs font-normal text-destructive">{errorFor('flowRateUnit')}</span>}
                    </label>
                    <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                      Time
                      <div className="mt-1 flex gap-2">
                        <Input type="number" inputMode="decimal" step="any" value={values.flowTime} placeholder="0" onChange={(event) => update('flowTime', event.target.value)} className={`h-10 ${errorClass('time')}`} aria-invalid={Boolean(errorFor('time'))} />
                        <select value={values.flowTimeUnit} onChange={(event) => update('flowTimeUnit', event.target.value)} className={`h-10 w-24 rounded-lg border border-input bg-background px-2 text-sm ${errorClass('timeUnit')}`} aria-label="Time unit">
                          {['s', 'min', 'h'].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                        </select>
                      </div>
                      {errorFor('time') && <span className="block text-xs font-normal text-destructive">{errorFor('time')}</span>}
                      {errorFor('timeUnit') && <span className="block text-xs font-normal text-destructive">{errorFor('timeUnit')}</span>}
                    </label>
                  </div>
                )}
                {values.method === 'PIPE' && (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                        Pipe diameter
                        <div className="mt-1 flex gap-2">
                          <Input type="number" inputMode="decimal" min="0" step="any" value={values.diameterInches} placeholder="e.g. 2" onChange={(event) => update('diameterInches', event.target.value)} className={`h-10 ${errorClass('diameterInches')}`} aria-invalid={Boolean(errorFor('diameterInches'))} />
                          <span className="flex h-10 items-center rounded-lg border border-input px-3 text-sm text-slate-500">in</span>
                        </div>
                        {errorFor('diameterInches') && <span className="block text-xs font-normal text-destructive">{errorFor('diameterInches')}</span>}
                      </label>
                      <label className="space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                        Run time
                        <div className="mt-1 flex gap-2">
                          <Input type="number" inputMode="decimal" min="0" step="any" value={values.pipeTime} placeholder="e.g. 5" onChange={(event) => update('pipeTime', event.target.value)} className={`h-10 ${errorClass('time')}`} aria-invalid={Boolean(errorFor('time'))} />
                          <select value={values.pipeTimeUnit} onChange={(event) => update('pipeTimeUnit', event.target.value)} className={`h-10 w-24 rounded-lg border border-input bg-background px-2 text-sm ${errorClass('timeUnit')}`} aria-label="Pipe run time unit">
                            {['s', 'min', 'h'].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                          </select>
                        </div>
                        <span className="block text-xs font-normal text-slate-500">Minutes and hours are converted by the engine.</span>
                        {errorFor('time') && <span className="block text-xs font-normal text-destructive">{errorFor('time')}</span>}
                        {errorFor('timeUnit') && <span className="block text-xs font-normal text-destructive">{errorFor('timeUnit')}</span>}
                      </label>
                    </div>
                    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                      <label className="flex items-start gap-2 text-sm font-medium text-amber-950 dark:text-amber-100">
                        <input type="checkbox" checked={values.useDefaultVelocity} onChange={(event) => update('useDefaultVelocity', event.target.checked)} className="mt-0.5 size-4 accent-amber-600" />
                        <span>Use project default ({assumedVelocityInPerSec} in/s, assumed)</span>
                      </label>
                      {values.useDefaultVelocity ? (
                        <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                          This is an assumed velocity, not a measured value.
                        </p>
                      ) : (
                        <label className="block space-y-1 text-sm font-medium text-amber-950 dark:text-amber-100">
                          Measured velocity
                          <div className="flex gap-2">
                            <Input type="number" inputMode="decimal" min="0" step="any" value={values.velocityInPerSec} placeholder="e.g. 47.24" onChange={(event) => update('velocityInPerSec', event.target.value)} className={`h-10 bg-white dark:bg-slate-900 ${errorClass('velocityInPerSec')}`} aria-invalid={Boolean(errorFor('velocityInPerSec'))} />
                            <span className="flex h-10 items-center rounded-lg border border-amber-300 px-3 text-sm">in/s</span>
                          </div>
                          {errorFor('velocityInPerSec') && <span className="block text-xs font-normal text-destructive">{errorFor('velocityInPerSec')}</span>}
                        </label>
                      )}
                    </div>
                  </div>
                )}
                {values.method === 'DIRECT' && (
                  <label className="block space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                    Volume
                    <div className="mt-1 flex gap-2">
                      <Input type="number" inputMode="decimal" min="0" step="any" value={values.volumeLitres} placeholder="e.g. 500" onChange={(event) => update('volumeLitres', event.target.value)} className={`h-10 ${errorClass('volumeLitres')}`} aria-invalid={Boolean(errorFor('volumeLitres'))} />
                      <span className="flex h-10 items-center rounded-lg border border-input px-3 text-sm text-slate-500">L</span>
                    </div>
                    {errorFor('volumeLitres') && <span className="block text-xs font-normal text-destructive">{errorFor('volumeLitres')}</span>}
                  </label>
                )}
              </section>

              <label className="block space-y-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                Notes <span className="font-normal text-slate-400">(optional)</span>
                <textarea value={values.notes} rows={2} maxLength={1000} placeholder="Additional details" onChange={(event) => update('notes', event.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />
                {formErrors.notes && <span className="block text-xs font-normal text-destructive">{formErrors.notes}</span>}
              </label>
            </div>

            <aside className="sticky bottom-0 self-start lg:top-4">
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm dark:border-sky-900 dark:bg-slate-900">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Live result</h2>
                  {preview && !preview.valid && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-200">Needs attention</span>}
                </div>
                {previewError && <p className="text-xs text-destructive" role="alert">{previewError}</p>}
                {preview?.valid && preview.values && (
                  <>
                    <p className="text-2xl font-black tabular-nums text-sky-900 dark:text-sky-100">
                      {new Intl.NumberFormat(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(preview.values.volumeM3))} m³
                    </p>
                    <p className="mb-3 text-sm text-sky-800 dark:text-sky-200">
                      {new Intl.NumberFormat().format(Number(preview.values.volumeLitres))} L
                    </p>
                    <div className="space-y-2 border-t border-sky-200 pt-3 text-xs dark:border-sky-800">
                      {Object.entries(preview.values)
                        .filter(([key]) => !['volumeM3', 'volumeLitres', 'velocitySource'].includes(key))
                        .map(([key, value]) => (
                          <div key={key} className="flex justify-between gap-3">
                            <span className="text-slate-500">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}</span>
                            <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                              {typeof value === 'number' ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 5 }).format(value) : String(value)}
                              {preview.units[key] ? ` ${preview.units[key]}` : ''}
                            </span>
                          </div>
                        ))}
                    </div>
                  </>
                )}
                {preview && !preview.valid && (
                  <ul className="space-y-1 text-xs text-destructive">
                    {preview.errors.map((error, index) => (
                      <li key={`${error.field}-${index}`}><span className="font-semibold">{error.field}:</span> {error.message}</li>
                    ))}
                  </ul>
                )}
                {!preview && !previewError && (
                  <div className="py-2 text-sm text-slate-500">Enter measurement details to calculate volume.</div>
                )}
                {preview?.warnings.map((warning, index) => (
                  <p key={index} className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-100 p-2 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{warning.message}
                  </p>
                ))}
              </div>
              <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500"><ArrowRightLeft className="size-3" />Calculated by the water engine</p>
            </aside>
          </div>
        </div>

        <div className="flex gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-5">
          <Button type="button" variant="outline" className="flex-1" disabled={isPending} onClick={onClose}>Cancel</Button>
          {!record && (
            <Button type="button" variant="outline" className="min-w-0 flex-1 px-1 text-[11px] sm:text-sm" disabled={isPending} onClick={() => submit('another')}>
              <span className="sm:hidden">Save + add</span>
              <span className="hidden sm:inline">Save &amp; add another</span>
            </Button>
          )}
          <Button type="button" className="flex-1" disabled={isPending || activities.length === 0} onClick={() => submit('save')}>
            {isPending ? <LoaderCircle className="animate-spin" /> : <Save />}
            {isPending ? 'Saving…' : record ? 'Save changes' : 'Save'}
          </Button>
        </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
