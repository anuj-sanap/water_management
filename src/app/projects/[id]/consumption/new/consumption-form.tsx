'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createConsumptionAction } from '@/app/actions/water-actions';
import { ActivityType } from '@prisma/client';
import { Droplet, Gauge, Activity, AlertCircle, Loader2 } from 'lucide-react';

interface ConsumptionFormProps {
  projectId: string;
  activities: ActivityType[];
  assumedVelocity: number;
}

export function ConsumptionForm({
  projectId,
  activities,
  assumedVelocity,
}: ConsumptionFormProps) {
  const router = useRouter();
  const [method, setMethod] = useState<'FLOW_METER' | 'PIPE' | 'DIRECT'>('FLOW_METER');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.set('projectId', projectId);
    formData.set('method', method);

    try {
      await createConsumptionAction(formData);
      router.push(`/projects/${projectId}/consumption`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record consumption.');
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Basic Metadata */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Activity Type
          </label>
          <select
            name="activityTypeId"
            required
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-sky-500"
          >
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Date & Time
          </label>
          <input
            type="datetime-local"
            name="date"
            defaultValue={new Date().toISOString().slice(0, 16)}
            required
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Calculation Method Selection */}
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Calculation Engine Method
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setMethod('FLOW_METER')}
            className={`py-2.5 px-3 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all cursor-pointer ${
              method === 'FLOW_METER'
                ? 'bg-sky-50 dark:bg-sky-950/70 border-sky-500 text-sky-700 dark:text-sky-300 ring-2 ring-sky-500/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Gauge className="w-4 h-4" />
            <span>Flow Meter</span>
          </button>

          <button
            type="button"
            onClick={() => setMethod('PIPE')}
            className={`py-2.5 px-3 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all cursor-pointer ${
              method === 'PIPE'
                ? 'bg-sky-50 dark:bg-sky-950/70 border-sky-500 text-sky-700 dark:text-sky-300 ring-2 ring-sky-500/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Pipe Flow</span>
          </button>

          <button
            type="button"
            onClick={() => setMethod('DIRECT')}
            className={`py-2.5 px-3 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all cursor-pointer ${
              method === 'DIRECT'
                ? 'bg-sky-50 dark:bg-sky-950/70 border-sky-500 text-sky-700 dark:text-sky-300 ring-2 ring-sky-500/20'
                : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-600 dark:text-slate-400'
            }`}
          >
            <Droplet className="w-4 h-4" />
            <span>Direct (Batch)</span>
          </button>
        </div>
      </div>

      {/* Dynamic Method Inputs */}
      {method === 'FLOW_METER' && (
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Flow Meter Parameters (Volume = Flow Rate × Time)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Flow Rate</label>
              <input
                type="number"
                step="0.01"
                name="flowRate"
                placeholder="e.g. 5.5"
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Flow Rate Unit</label>
              <select
                name="flowRateUnit"
                defaultValue="m3/h"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
              >
                <option value="m3/h">m³/h</option>
                <option value="L/s">L/s</option>
                <option value="L/min">L/min</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Duration Time</label>
              <input
                type="number"
                step="0.1"
                name="time"
                placeholder="e.g. 45"
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Time Unit</label>
              <select
                name="timeUnit"
                defaultValue="min"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
              >
                <option value="min">Minutes</option>
                <option value="h">Hours</option>
                <option value="s">Seconds</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {method === 'PIPE' && (
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Pipe Hydraulics (V = πd²/4 × v × t)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Pipe Diameter (inches)</label>
              <input
                type="number"
                step="0.1"
                name="diameterInches"
                placeholder="e.g. 2.0"
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Run Time (seconds)</label>
              <input
                type="number"
                name="timeSeconds"
                placeholder="e.g. 3600"
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>Velocity (in/s) — Optional</span>
              <span className="text-[11px] text-purple-600 dark:text-purple-400 font-mono">
                Assumed Default: {assumedVelocity} in/s
              </span>
            </label>
            <input
              type="number"
              step="0.01"
              name="velocityInPerSec"
              placeholder={`Leave blank to use assumed default (${assumedVelocity} in/s)`}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
            />
            <p className="text-[11px] text-slate-500">
              If velocity is omitted, the engine logs an assumed velocity warning and flags the record.
            </p>
          </div>
        </div>
      )}

      {method === 'DIRECT' && (
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Direct Volume Batch (Litres → m³)
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-500">Batch Volume (Litres)</label>
            <input
              type="number"
              step="1"
              name="volumeLitres"
              placeholder="e.g. 3500"
              required
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm"
            />
          </div>
        </div>
      )}

      {/* Location / Field Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Location / Zone
          </label>
          <input
            name="locationOrZone"
            placeholder="e.g. Tower A - Core Slab L4"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-sky-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Notes
          </label>
          <input
            name="notes"
            placeholder="Operational notes, curing duration, etc."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-sky-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Droplet className="w-4 h-4" />}
        <span>Calculate & Save Consumption</span>
      </button>
    </form>
  );
}
