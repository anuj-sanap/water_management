'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertTriangle,
  Truck,
  Droplet,
  Layers,
  Activity,
  Plus,
  ShieldAlert,
  Sliders,
  HelpCircle,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
} from 'recharts';
import { Button } from '@/components/ui/button';
import {
  DashboardDataResult,
  getDashboardDataAction,
} from '@/app/actions/dashboard-actions';

interface DashboardViewProps {
  initialData: DashboardDataResult;
  userRole: string;
  onboarding: { projectCreated: boolean; supplyAdded: boolean; consumptionRecorded: boolean };
}

type DateRangePreset = 'today' | '7d' | '30d' | 'month' | 'custom';
type VolumeUnitDisplay = 'm3' | 'L';

export function DashboardView({ initialData, userRole, onboarding }: DashboardViewProps) {
  const [data, setData] = React.useState<DashboardDataResult>(initialData);
  const [unit, setUnit] = React.useState<VolumeUnitDisplay>('m3');
  const [preset, setPreset] = React.useState<DateRangePreset>('30d');
  const [compareEnabled, setCompareEnabled] = React.useState<boolean>(true);
  const [customFrom, setCustomFrom] = React.useState<string>(
    initialData.current.from.slice(0, 10)
  );
  const [customTo, setCustomTo] = React.useState<string>(
    initialData.current.to.slice(0, 10)
  );
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [showDailyChartTable, setShowDailyChartTable] = React.useState(false);

  // Unit conversion helper
  const unitFactor = unit === 'L' ? 1000 : 1;
  const unitLabel = unit === 'L' ? 'L' : 'm³';

  function formatVol(valM3: number): string {
    const converted = valM3 * unitFactor;
    if (unit === 'L') {
      return Math.round(converted).toLocaleString();
    }
    return converted.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }

  // Calculate dates based on preset
  function getRangeDates(p: DateRangePreset): {
    from: string;
    to: string;
    compareFrom?: string;
    compareTo?: string;
  } {
    const now = new Date();
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    if (p === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    } else if (p === '7d') {
      from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      from.setHours(0, 0, 0, 0);
    } else if (p === '30d') {
      from = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      from.setHours(0, 0, 0, 0);
    } else if (p === 'month') {
      from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    } else {
      const cFrom = new Date(customFrom);
      cFrom.setHours(0, 0, 0, 0);
      const cTo = new Date(customTo);
      cTo.setHours(23, 59, 59, 999);
      from = cFrom;
      to.setTime(cTo.getTime());
    }

    if (!compareEnabled) {
      return { from: from.toISOString(), to: to.toISOString() };
    }

    // Previous period of equal length
    const durationMs = to.getTime() - from.getTime();
    const compTo = new Date(from.getTime() - 1);
    const compFrom = new Date(compTo.getTime() - durationMs);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      compareFrom: compFrom.toISOString(),
      compareTo: compTo.toISOString(),
    };
  }

  async function fetchData(newPreset = preset, newCompare = compareEnabled) {
    try {
      setIsLoading(true);
      const { from, to, compareFrom, compareTo } = getRangeDates(newPreset);
      const res = await getDashboardDataAction(
        data.project.id,
        from,
        to,
        newCompare ? compareFrom : undefined,
        newCompare ? compareTo : undefined
      );
      setData(res);
    } catch (err) {
      console.error('Failed to update dashboard data', err);
    } finally {
      setIsLoading(false);
    }
  }

  function handlePresetChange(newPreset: DateRangePreset) {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      fetchData(newPreset, compareEnabled);
    }
  }

  function handleCompareToggle() {
    const nextCompare = !compareEnabled;
    setCompareEnabled(nextCompare);
    fetchData(preset, nextCompare);
  }

  // Delta badge helper
  function renderDelta(diff: number, pct: number, invert = false) {
    if (!compareEnabled || data.deltas === undefined) return null;
    if (Math.abs(diff) < 0.01) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
          <Minus className="w-3 h-3" />
          <span>Unchanged vs prev</span>
        </span>
      );
    }

    const isPositive = diff > 0;
    // For unaccounted water or alerts, positive might be bad (invert)
    const isGood = invert ? !isPositive : isPositive;

    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-bold ${
          isGood
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-rose-600 dark:text-rose-400'
        }`}
      >
        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        <span>
          {isPositive ? '+' : ''}
          {pct.toFixed(1)}% vs prev
        </span>
      </span>
    );
  }

  const dailyData = data.current.daily;
  const thresholdPercent = data.project.unaccountedThresholdPercent;
  const activityData = data.current.byActivity;
  const methodData = data.current.byMethod;
  const consumedM3 = data.current.consumedM3;

  // Chart data mappings
  const comboChartData = React.useMemo(() => {
    return dailyData.map((d) => ({
      date: d.date.slice(5), // 'MM-DD'
      fullDate: d.date,
      supplied: +(d.suppliedM3 * unitFactor).toFixed(1),
      consumed: +(d.consumedM3 * unitFactor).toFixed(1),
      unaccounted: +(Math.max(0, d.unaccountedM3) * unitFactor).toFixed(1),
    }));
  }, [dailyData, unitFactor]);

  const trendChartData = React.useMemo(() => {
    return dailyData.map((d) => ({
      date: d.date.slice(5),
      fullDate: d.date,
      unaccountedPercent: +d.unaccountedPercent.toFixed(1),
      threshold: thresholdPercent,
      isExceeded: d.unaccountedPercent > thresholdPercent,
    }));
  }, [dailyData, thresholdPercent]);

  const activityPieData = React.useMemo(() => {
    return activityData.map((a) => ({
      name: a.activityName,
      value: +(a.volumeM3 * unitFactor).toFixed(1),
      rawM3: a.volumeM3,
      color: a.color,
    }));
  }, [activityData, unitFactor]);

  const methodBarData = React.useMemo(() => {
    const total = consumedM3 || 1;
    return methodData.map((m) => {
      let displayName = m.method;
      let isAssumed = false;
      if (m.method === 'FLOW_METER') displayName = 'Flow Meter (Q×t)';
      if (m.method === 'PIPE') {
        displayName = 'Pipe Hydraulics (A×v×t)';
        isAssumed = true;
      }
      if (m.method === 'DIRECT') displayName = 'Direct Entry (Batch)';

      const pct = (m.volumeM3 / total) * 100;
      return {
        name: displayName,
        method: m.method,
        volume: +(m.volumeM3 * unitFactor).toFixed(1),
        percentage: +pct.toFixed(1),
        count: m.count,
        isAssumed,
      };
    });
  }, [methodData, consumedM3, unitFactor]);

  const hasNoData =
    data.current.suppliedM3 === 0 && data.current.consumedM3 === 0;

  return (
    <div className="space-y-6">
      {userRole !== 'AUDITOR' &&
        (!onboarding.projectCreated || !onboarding.supplyAdded || !onboarding.consumptionRecorded) && (
          <section
            aria-labelledby="onboarding-title"
            className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 dark:border-sky-900 dark:bg-sky-950/30"
          >
            <div className="mb-3">
              <h2 id="onboarding-title" className="text-sm font-bold text-slate-900 dark:text-white">Getting started</h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">Complete these steps to make your project water balance useful.</p>
            </div>
            <ol className="grid gap-2 sm:grid-cols-3">
              {[
                { label: 'Create project', complete: onboarding.projectCreated, href: '/projects/new' },
                { label: 'Add supply', complete: onboarding.supplyAdded, href: `/projects/${data.project.id}/supplies?new=1` },
                { label: 'Record consumption', complete: onboarding.consumptionRecorded, href: `/projects/${data.project.id}/consumption?new=1` },
              ].map((step) => (
                <li key={step.label}>
                  {step.complete ? (
                    <div className="flex min-h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                      <CheckCircle2 aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />
                      <span className="text-slate-500 line-through">{step.label}</span>
                    </div>
                  ) : (
                    <Link
                      href={step.href}
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:border-sky-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                    >
                    <CheckCircle2 aria-hidden="true" className={`size-4 shrink-0 ${step.complete ? 'text-emerald-600' : 'text-slate-300 dark:text-slate-600'}`} />
                      <span>{step.label}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

      {/* Header Bar with Date Range Presets, Compare Toggle, Unit Toggle, and Refresh */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Title & Site Context */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              Project Water Telemetry
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-xs text-slate-500 font-medium">{data.project.location}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
            {data.project.name}
          </h1>
        </div>

        {/* Controls: Date Picker, Compare Toggle, Units, Refresh */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-start lg:justify-end">
          {/* Unit Toggle (m³ / L) */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">
            <button
              type="button"
              onClick={() => setUnit('m3')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                unit === 'm3'
                  ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              m³
            </button>
            <button
              type="button"
              onClick={() => setUnit('L')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                unit === 'L'
                  ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Litres
            </button>
          </div>

          {/* Date Range Presets */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold overflow-x-auto max-w-full">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: 'month', label: 'This Month' },
                { id: 'custom', label: 'Custom' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetChange(p.id)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                  preset === p.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Compare to Previous Period Toggle */}
          <button
            type="button"
            onClick={handleCompareToggle}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
              compareEnabled
                ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800'
                : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                compareEnabled ? 'bg-sky-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            />
            <span>Compare Previous</span>
          </button>

          {/* Manual Refresh Button */}
          <button
            type="button"
            onClick={() => fetchData()}
            disabled={isLoading}
            title="Refresh dashboard telemetry"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-sky-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Custom Date Inputs Drawer (when Custom preset is active) */}
      {preset === 'custom' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600 dark:text-slate-400">From:</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600 dark:text-slate-400">To:</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => fetchData('custom', compareEnabled)}
            disabled={isLoading}
            className="rounded-xl text-xs bg-sky-600 hover:bg-sky-500 text-white"
          >
            Apply Range
          </Button>
        </div>
      )}

      {/* Empty State CTA if no records exist in selected range */}
      {hasNoData && !isLoading && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center max-w-lg mx-auto space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-sky-50 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 flex items-center justify-center mx-auto">
            <Truck className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              No Water Telemetry in Period
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              There are no water supplies or consumption entries recorded for this date range.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href={`/projects/${data.project.id}/supplies/new`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs transition-all shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add your first supply record</span>
            </Link>
          </div>
        </div>
      )}

      {/* 1. ROW OF STATCARDS (Supplied, Recorded, Unaccounted, Active Alerts) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Supplied */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Water Supplied</span>
            <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/80 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>

          <div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {formatVol(data.current.suppliedM3)}{' '}
              <span className="text-xs font-normal text-slate-400">{unitLabel}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {unit === 'm3'
                ? `${Math.round(data.current.suppliedM3 * 1000).toLocaleString()} Litres`
                : `${(data.current.suppliedM3).toFixed(1)} m³`}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            {renderDelta(
              data.deltas?.suppliedM3 ?? 0,
              data.deltas?.suppliedPercent ?? 0
            )}
          </div>
        </div>

        {/* Card 2: Total Recorded Consumption */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Recorded Consumption</span>
            <div className="w-8 h-8 rounded-xl bg-cyan-50 dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
              <Droplet className="w-4 h-4" />
            </div>
          </div>

          <div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {formatVol(data.current.consumedM3)}{' '}
              <span className="text-xs font-normal text-slate-400">{unitLabel}</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Calculated via hydraulic engine
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            {renderDelta(
              data.deltas?.consumedM3 ?? 0,
              data.deltas?.consumedPercent ?? 0
            )}
          </div>
        </div>

        {/* Card 3: Unaccounted Water with Status Badge & Tooltip */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span className="flex items-center gap-1.5">
              <span>Unaccounted Water</span>
              <span
                title="Unaccounted water is the variance between total delivered supply and sum of verified consumption activities. Status reflects engineering tolerance."
                className="cursor-help text-slate-400 hover:text-slate-600"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </span>
            </span>

            {/* Status Badge */}
            {data.current.status === 'OK' && (
              <span
                title="Water balance is within normal project tolerance threshold."
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>OK</span>
              </span>
            )}
            {data.current.status === 'ATTENTION' && (
              <span
                title="Unaccounted water percentage exceeds the project attention threshold."
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
              >
                <AlertTriangle className="w-3 h-3" />
                <span>Attention</span>
              </span>
            )}
            {data.current.status === 'DATA_CHECK' && (
              <span
                title="Consumption exceeds total delivered volume. Verify meter logs or storage buffer draws."
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
              >
                <ShieldAlert className="w-3 h-3" />
                <span>Data Check</span>
              </span>
            )}
          </div>

          <div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-baseline gap-2">
              <span>{formatVol(data.current.unaccountedM3)}</span>
              <span
                className={`text-sm font-bold ${
                  data.current.status === 'ATTENTION'
                    ? 'text-amber-600 dark:text-amber-400'
                    : data.current.status === 'DATA_CHECK'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                ({data.current.unaccountedPercent.toFixed(1)}%)
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Site threshold: {data.project.unaccountedThresholdPercent}%
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            {renderDelta(
              data.deltas?.unaccountedM3 ?? 0,
              data.deltas?.unaccountedPercentDiff ?? 0,
              true
            )}
          </div>
        </div>

        {/* Card 4: Active Alerts */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Active Alerts</span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                data.alerts.length > 0
                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400'
                  : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>

          <div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {data.alerts.length}{' '}
              <span className="text-xs font-normal text-slate-400">flagged days</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {data.alerts.filter((a) => a.severity === 'DATA_CHECK').length} data checks,{' '}
              {data.alerts.filter((a) => a.severity === 'ATTENTION').length} threshold exceedances
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            {compareEnabled && data.deltas && (
              <span className="text-[11px] text-slate-400 font-medium">
                {data.deltas.alertsDiff === 0
                  ? 'Equal to previous period'
                  : `${data.deltas.alertsDiff > 0 ? '+' : ''}${data.deltas.alertsDiff} vs prev`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. LARGE "SUPPLY VS CONSUMPTION" COMBO CHART */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Daily Supply vs. Recorded Consumption</span>
              <span className="text-xs font-normal text-slate-400 font-mono">({unitLabel})</span>
            </h2>
            <p className="text-xs text-slate-500">
              Bars denote incoming delivery volume, line denotes verified consumption, shaded area represents unaccounted water gap.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={showDailyChartTable}
            aria-controls="daily-balance-data-table"
            onClick={() => setShowDailyChartTable((visible) => !visible)}
          >
            {showDailyChartTable ? 'Hide data table' : 'View as table'}
          </Button>
        </div>

        <div className="h-72 sm:h-80 w-full pt-2" role="img" aria-label="Daily supplied water, recorded consumption, and unaccounted water chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={comboChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="unaccGapGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const row = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 p-3 rounded-2xl shadow-xl text-xs space-y-1.5 border border-slate-800 dark:border-slate-200">
                        <div className="font-bold text-slate-200 dark:text-slate-700 pb-1 border-b border-slate-800 dark:border-slate-200">
                          {row.fullDate}
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-sky-400 dark:text-sky-600">Supplied:</span>
                          <span className="font-mono font-bold">{row.supplied} {unitLabel}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-cyan-400 dark:text-cyan-600">Consumed:</span>
                          <span className="font-mono font-bold">{row.consumed} {unitLabel}</span>
                        </div>
                        <div className="flex justify-between gap-4 pt-1 border-t border-slate-800 dark:border-slate-200">
                          <span className="text-slate-400">Unaccounted Gap:</span>
                          <span className="font-mono font-bold text-amber-400">{row.unaccounted} {unitLabel}</span>
                        </div>
                        {showDailyChartTable && (
                          <div id="daily-balance-data-table" className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                            <table className="w-full min-w-[560px] text-left text-sm">
                              <caption className="sr-only">Daily supply and consumption chart data in {unitLabel}</caption>
                              <thead className="bg-slate-50 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                <tr>
                                  <th scope="col" className="px-3 py-2">Date</th>
                                  <th scope="col" className="px-3 py-2 text-right">Supply ({unitLabel})</th>
                                  <th scope="col" className="px-3 py-2 text-right">Recorded consumption ({unitLabel})</th>
                                  <th scope="col" className="px-3 py-2 text-right">Unaccounted ({unitLabel})</th>
                                </tr>
                              </thead>
                              <tbody>
                                {comboChartData.map((row) => (
                                  <tr key={row.fullDate} className="border-t border-slate-100 dark:border-slate-800">
                                    <th scope="row" className="px-3 py-2 font-medium">{row.fullDate}</th>
                                    <td className="px-3 py-2 text-right tabular-nums">{row.supplied}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{row.consumed}</td>
                                    <td className="px-3 py-2 text-right tabular-nums">{row.unaccounted}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: '10px', fontSize: '12px' }}
              />
              <Bar dataKey="supplied" name="Daily Supply" fill="#0284c7" radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Area
                type="monotone"
                dataKey="unaccounted"
                name="Unaccounted Gap"
                fill="url(#unaccGapGrad)"
                stroke="none"
              />
              <Line
                type="monotone"
                dataKey="consumed"
                name="Recorded Consumption"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#06b6d4' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3 & 4. TWO-COLUMN: CONSUMPTION BY ACTIVITY & CONSUMPTION BY METHOD */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 3. Donut Chart: Consumption by Activity */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-sky-600" />
                <span>Consumption by Civil Activity</span>
              </h2>
              <p className="text-xs text-slate-500">Distribution across site operations and batch activities.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-4 pt-2">
            <div className="h-56 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={activityPieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                  >
                    {activityPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const row = payload[0].payload;
                        const total = data.current.consumedM3 * unitFactor || 1;
                        const pct = ((row.value / total) * 100).toFixed(1);
                        return (
                          <div className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 p-2.5 rounded-xl shadow-lg text-xs space-y-1">
                            <div className="font-bold flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                              <span>{row.name}</span>
                            </div>
                            <div className="text-slate-300 dark:text-slate-700 font-mono">
                              {row.value} {unitLabel} ({pct}%)
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Donut Legend */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {activityPieData.map((act) => {
                const total = data.current.consumedM3 * unitFactor || 1;
                const pct = ((act.value / total) * 100).toFixed(1);
                return (
                  <div key={act.name} className="flex items-center justify-between text-xs py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: act.color }} />
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{act.name}</span>
                    </div>
                    <div className="font-mono text-slate-500 shrink-0 text-right">
                      {act.value} {unitLabel} ({pct}%)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4. Small Bar Chart: Consumption by Method */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-600" />
                <span>Consumption by Engine Method</span>
              </h2>
              <p className="text-xs text-slate-500">
                Identifies how much volume relies on pipe hydraulics (assumed velocity) vs direct meters.
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            {methodBarData.map((m) => (
              <div key={m.method} className="space-y-1.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">{m.name}</span>
                    {m.isAssumed && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                        Hydraulic Assumption
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-slate-600 dark:text-slate-300 font-bold">
                    {m.volume} {unitLabel} ({m.percentage}%)
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      m.isAssumed ? 'bg-purple-600' : 'bg-sky-600'
                    }`}
                    style={{ width: `${Math.min(100, m.percentage)}%` }}
                  />
                </div>

                <div className="text-[11px] text-slate-400 flex justify-between">
                  <span>{m.count} records</span>
                  <span>{m.isAssumed ? `Default velocity: ${data.project.assumedVelocityInPerSec} in/s` : 'Direct measurement'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. "UNACCOUNTED WATER TREND" LINE CHART WITH THRESHOLD REFERENCE LINE */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              <span>Unaccounted Water Percentage Trend</span>
            </h2>
            <p className="text-xs text-slate-500">
              Daily percentage variance between incoming water supply and verified consumption with configured project tolerance threshold.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-rose-500" />
            <span className="text-rose-600 dark:text-rose-400">
              Threshold Limit ({data.project.unaccountedThresholdPercent}%)
            </span>
          </div>
        </div>

        <div className="h-64 sm:h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trendChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.6} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis unit="%" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} domain={[0, 'dataMax + 5']} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const row = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 p-2.5 rounded-xl shadow-lg text-xs space-y-1 border border-slate-800 dark:border-slate-200">
                        <div className="font-bold text-slate-300 dark:text-slate-700">{row.fullDate}</div>
                        <div className="font-mono font-bold">
                          Unaccounted: {row.unaccountedPercent}%
                        </div>
                        {row.isExceeded ? (
                          <div className="text-amber-400 text-[10px] font-bold">
                            ⚠️ Exceeded threshold ({row.threshold}%)
                          </div>
                        ) : (
                          <div className="text-emerald-400 text-[10px] font-semibold">
                            ✓ Within threshold ({row.threshold}%)
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine
                y={data.project.unaccountedThresholdPercent}
                stroke="#f43f5e"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{
                  value: `Tolerance (${data.project.unaccountedThresholdPercent}%)`,
                  fill: '#f43f5e',
                  fontSize: 11,
                  position: 'insideTopRight',
                }}
              />
              <Line
                type="monotone"
                dataKey="unaccountedPercent"
                name="Unaccounted %"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={(props: { cx?: number; cy?: number; payload: { date: string; isExceeded: boolean } }) => {
                  const { cx, cy, payload } = props;
                  return (
                    <circle
                      key={`dot-${payload.date}`}
                      cx={cx}
                      cy={cy}
                      r={payload.isExceeded ? 4 : 2.5}
                      fill={payload.isExceeded ? '#f43f5e' : '#f59e0b'}
                      stroke="#fff"
                      strokeWidth={1}
                    />
                  );
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 6 & 7. RECENT RECORDS, RECENT ALERTS, & DATA QUALITY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 6a. Recent Records Table (Latest 8) - Span 2 */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-600" />
                <span>Recent Records (Latest 8)</span>
              </h2>
              <p className="text-xs text-slate-500">Live operational feed of supplies and consumption activities.</p>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <Link
                href={`/projects/${data.project.id}/supplies`}
                className="text-sky-600 hover:text-sky-700 font-semibold"
              >
                Supplies
              </Link>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <Link
                href={`/projects/${data.project.id}/consumption`}
                className="text-cyan-600 hover:text-cyan-700 font-semibold"
              >
                Consumption
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[11px] font-semibold">
                <tr>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Method / Source</th>
                  <th className="py-3 px-3">Activity / Supplier</th>
                  <th className="py-3 px-3 text-right">Volume ({unitLabel})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.recentRecords.map((r) => (
                  <tr key={`${r.type}-${r.id}`} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">{r.date}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {r.type === 'SUPPLY' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                          <Truck className="w-2.5 h-2.5" />
                          <span>Supply</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300">
                          <Droplet className="w-2.5 h-2.5" />
                          <span>Consumption</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {r.methodOrSource}
                      {r.usedAssumedVelocity && (
                        <span className="ml-1.5 text-[9px] px-1 py-0.2 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-semibold">
                          Assumed v
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-900 dark:text-white font-medium truncate max-w-[150px]">
                      {r.activityOrSupplier}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {formatVol(r.volumeM3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 6b & 7. RIGHT COLUMN: RECENT ALERTS & DATA QUALITY */}
        <div className="space-y-6">
          {/* 7. Data Quality Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Data Quality & Reliability
                </h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                Period Health
              </span>
            </div>

            <div className="space-y-3 text-xs">
              {/* Metric A: % Using Assumed Velocity */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1">
                <div className="flex justify-between items-center font-semibold text-slate-700 dark:text-slate-300">
                  <span>Assumed Velocity Usage:</span>
                  <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                    {data.dataQuality.assumedVelocityPercent.toFixed(1)}%
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  {data.dataQuality.assumedVelocityRecords} of {data.dataQuality.totalConsumptionRecords} records used default {data.project.assumedVelocityInPerSec} in/s. This is an assumption, not a measurement.
                </p>
              </div>

              {/* Metric B: Days with No Consumption Recorded */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Days with no consumption:
                </span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {data.dataQuality.daysWithNoConsumption} days
                </span>
              </div>

              {/* Metric C: Days Consumption Exceeded Supply */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  Days consumption &gt; supply:
                </span>
                <span
                  className={`font-mono font-bold ${
                    data.dataQuality.daysConsumptionExceededSupply > 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {data.dataQuality.daysConsumptionExceededSupply} days
                </span>
              </div>
            </div>
          </div>

          {/* 6b. Recent Alerts List */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Recent Alerts ({data.alerts.length})
                </h3>
              </div>
            </div>

            {data.alerts.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 space-y-1">
                <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto" />
                <p className="font-medium text-slate-700 dark:text-slate-300">All Parameters Normal</p>
                <p>No threshold anomalies or data checks in this period.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 text-xs">
                {data.alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-2xl border space-y-1 ${
                      alert.severity === 'DATA_CHECK'
                        ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60'
                        : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span
                        className={
                          alert.severity === 'DATA_CHECK'
                            ? 'text-rose-800 dark:text-rose-200'
                            : 'text-amber-800 dark:text-amber-200'
                        }
                      >
                        {alert.title}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">{alert.date}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {alert.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
