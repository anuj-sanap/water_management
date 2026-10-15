'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, LoaderCircle } from 'lucide-react';
import type { ConsumptionRow } from './consumption-management';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface EnginePreview {
  valid: boolean;
  values: Record<string, unknown> | null;
  units: Record<string, string>;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
}

interface DetailResult {
  recordId: string;
  preview?: EnginePreview;
  error?: string;
}

const STEP_LABELS: Record<string, string> = {
  diameterM: 'Pipe diameter',
  velocityMPerS: 'Velocity',
  velocityInPerS: 'Velocity entered',
  velocitySource: 'Velocity source',
  areaM2: 'Cross-sectional area',
  flowRateM3PerS: 'Flow rate',
  flowRateLitresPerS: 'Flow rate',
  timeSeconds: 'Run time',
  volumeM3: 'Calculated volume',
  volumeLitres: 'Calculated volume',
};

const INPUT_LABELS: Record<string, string> = {
  diameterInches: 'Pipe diameter',
  velocityInPerSec: 'Velocity entered',
  timeSeconds: 'Run time',
  flowRate: 'Flow rate',
  flowRateUnit: 'Flow rate unit',
  time: 'Time',
  timeUnit: 'Time unit',
  volumeLitres: 'Entered volume',
};

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function numberText(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(value);
}

export function ConsumptionDetailSheet({
  projectId,
  record,
  onClose,
}: {
  projectId: string;
  record: ConsumptionRow | null;
  onClose: () => void;
}) {
  const [detailResult, setDetailResult] = useState<DetailResult | null>(null);
  const recordId = record?.id;
  const recordMethod = record?.method;
  const inputsJson = record?.inputsJson;
  const inputs = useMemo(() => inputsJson ? parseObject(inputsJson) : {}, [inputsJson]);
  const matchingResult = recordId && detailResult?.recordId === recordId ? detailResult : null;
  const preview = matchingResult?.preview ?? null;
  const error = matchingResult?.error ?? '';
  const loading = Boolean(recordId && !matchingResult);

  useEffect(() => {
    if (!recordId || !recordMethod) return;
    const controller = new AbortController();
    const method = recordMethod === 'FLOW_METER' ? 'flowMeter' : recordMethod === 'PIPE' ? 'pipe' : 'direct';

    void fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ projectId, method, inputs, intent: 'view' }),
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) {
          const message = body && typeof body === 'object' && 'error' in body ? String(body.error) : 'Could not load the calculation details.';
          throw new Error(message);
        }
        setDetailResult({ recordId, preview: body as EnginePreview });
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name !== 'AbortError') {
          setDetailResult({ recordId, error: cause.message });
        }
      });

    return () => controller.abort();
  }, [projectId, recordId, recordMethod, inputs]);

  const warnings = (() => {
    if (!record?.warningsJson) return [];
    try {
      const parsed: unknown = JSON.parse(record.warningsJson);
      return Array.isArray(parsed) ? parsed as Array<{ message?: string }> : [];
    } catch {
      return [];
    }
  })();

  const orderedSteps = preview?.values
    ? Object.entries(preview.values).sort(([left], [right]) => {
        const order = Object.keys(STEP_LABELS);
        return order.indexOf(left) - order.indexOf(right);
      })
    : [];

  return (
    <Sheet open={Boolean(record)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="h-[100dvh] w-screen max-w-none gap-0 rounded-none border-0 p-0 sm:w-[min(100vw,38rem)] sm:max-w-2xl sm:rounded-l-2xl sm:border sm:border-border">
        {record && (
          <>
            <SheetHeader className="border-b border-slate-200 px-5 py-5 pr-14 dark:border-slate-800">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                  <Activity className="size-4" />
                </span>
                <div>
                  <SheetTitle className="text-lg font-bold text-slate-900 dark:text-white">Consumption details</SheetTitle>
                  <SheetDescription>{record.activity.name} · {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(record.date))}</SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="text-xs text-slate-500">Recorded volume</p>
                  <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
                    {new Intl.NumberFormat(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(record.volumeM3)} m³
                  </p>
                  <p className="text-sm text-slate-500">
                    {typeof preview?.values?.volumeLitres === 'number'
                      ? `${numberText(preview.values.volumeLitres)} L`
                      : ''}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="text-xs text-slate-500">Method</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {record.method === 'FLOW_METER' ? 'Flow meter' : record.method === 'PIPE' ? 'Pipe' : 'Direct entry'}
                  </p>
                  <p className="text-xs text-slate-500">Added by {record.addedBy}</p>
                </div>
              </div>

              {record.usedAssumedVelocity && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>Assumed project velocity was used ({String(preview?.values?.velocityInPerSec ?? 'project default')} in/s). This is an assumed value, not a measurement.</span>
                </div>
              )}

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Inputs used</h3>
                <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3 dark:divide-slate-800 dark:border-slate-800">
                  {Object.entries(inputs).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-4 py-2.5 text-sm">
                      <dt className="text-slate-500">{INPUT_LABELS[key] ?? key}</dt>
                      <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{String(value)}</dd>
                    </div>
                  ))}
                  {record.locationOrZone && (
                    <div className="flex justify-between gap-4 py-2.5 text-sm">
                      <dt className="text-slate-500">Zone / location</dt>
                      <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{record.locationOrZone}</dd>
                    </div>
                  )}
                  {record.notes && (
                    <div className="flex justify-between gap-4 py-2.5 text-sm">
                      <dt className="text-slate-500">Notes</dt>
                      <dd className="max-w-[65%] text-right font-medium text-slate-800 dark:text-slate-200">{record.notes}</dd>
                    </div>
                  )}
                </dl>
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Engine calculation steps</h3>
                {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />Recomputing calculation details…</div>}
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
                {preview?.errors?.map((item, index) => <p key={index} className="text-sm text-destructive">{item.message}</p>)}
                {orderedSteps.length > 0 && (
                  <ol className="space-y-2">
                    {orderedSteps.map(([key, value], index) => (
                      <li key={key} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-800">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-cyan-50 text-xs font-bold text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">{index + 1}</span>
                        <span className="flex-1 text-sm text-slate-600 dark:text-slate-300">{STEP_LABELS[key] ?? key}</span>
                        <span className="text-right text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                          {typeof value === 'number' ? numberText(value) : String(value)}
                          {preview?.units[key] && <span className="ml-1 font-normal text-slate-500">{preview.units[key]}</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                {warnings.map((warning, index) => (
                  <p key={index} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                    {warning.message ?? 'Calculation warning'}
                  </p>
                ))}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
