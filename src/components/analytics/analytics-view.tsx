'use client';

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Calendar,
  Layers,
  ArrowUpDown,
  Download,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  Building2,
  Gauge,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
} from 'recharts';
import { Button } from '@/components/ui/button';
import {
  AnalyticsData,
  DayOfWeekStat,
  MethodBreakdownItem,
  ProjectCompareItem,
} from '@/app/actions/analytics-actions';
import { toast } from 'sonner';

interface AnalyticsViewProps {
  data: AnalyticsData;
  projects: Array<{ id: string; name: string; location: string }>;
  currentProjectId: string;
}

function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][]
) {
  try {
    const escapeCell = (val: string | number | null | undefined) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };
    const content = [
      headers.map(escapeCell).join(','),
      ...rows.map((row) => row.map(escapeCell).join(',')),
    ].join('\r\n');

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filename}.csv`);
  } catch {
    toast.error('Failed to generate CSV export');
  }
}

export function AnalyticsView({
  data,
  projects,
  currentProjectId,
}: AnalyticsViewProps) {
  const router = useRouter();

  // Active Tab: 'activity' | 'method' | 'time' | 'compare'
  const [activeTab, setActiveTab] = useState<'activity' | 'method' | 'time' | 'compare'>('activity');

  // Grouping for Activity Area Chart: 'day' | 'week' | 'month'
  const [activityGrouping, setActivityGrouping] = useState<'day' | 'week' | 'month'>('day');

  // Project switcher change
  const handleProjectChange = (newId: string) => {
    router.push(`/projects/${newId}/analytics`);
  };

  // Activity chart dataset based on grouping
  const activityData =
    activityGrouping === 'day'
      ? data.activityDaily
      : activityGrouping === 'week'
      ? data.activityWeekly
      : data.activityMonthly;

  // CSV Exporters
  const exportActivityTimeseriesCsv = () => {
    const actHeaders = data.activities.map((a) => `${a.name} (m3)`);
    const headers = ['Period', 'Total Volume (m3)', ...actHeaders];
    const rows = activityData.map((pt) => [
      pt.period,
      pt.total,
      ...data.activities.map((a) => (pt[a.name] as number) || 0),
    ]);
    downloadCsv(`${data.projectName}_activity_timeseries_${activityGrouping}`, headers, rows);
  };

  const exportActivityRankingCsv = () => {
    const headers = [
      'Activity Name',
      'Total Volume (m3)',
      'Share (%)',
      'WoW Change (%)',
      'Avg per Day (m3/day)',
      'Peak Day Date',
      'Peak Day Volume (m3)',
      'Records Count',
    ];
    const rows = data.activityRanking.map((r) => [
      r.name,
      r.totalVolume,
      r.sharePercent,
      r.wowChangePercent !== null ? `${r.wowChangePercent}%` : 'N/A',
      r.avgPerDay,
      r.peakDay.date,
      r.peakDay.volume,
      r.recordCount,
    ]);
    downloadCsv(`${data.projectName}_activity_ranking`, headers, rows);
  };

  const exportMethodCsv = () => {
    const headers = [
      'Method',
      'Volume (m3)',
      'Share (%)',
      'Records Count',
      'Assumed Velocity Count',
      'Assumed Velocity (%)',
    ];
    const rows = data.methodBreakdown.map((m) => [
      m.label,
      m.volumeM3,
      m.sharePercent,
      m.recordsCount,
      m.usedAssumedCount,
      `${m.assumedPercent}%`,
    ]);
    downloadCsv(`${data.projectName}_method_breakdown`, headers, rows);
  };

  const exportTimeCsv = () => {
    const headers = ['Date', 'Recorded Volume (m3)', 'Records Count'];
    const rows = data.heatmapCalendar.map((d) => [d.date, d.volume, d.recordCount]);
    downloadCsv(`${data.projectName}_daily_calendar`, headers, rows);
  };

  const exportCompareCsv = () => {
    const headers = [
      'Project Name',
      'Location',
      'Status',
      'Supplied (m3)',
      'Consumed (m3)',
      'Unaccounted (m3)',
      'Unaccounted (%)',
      'Active Days',
      'Normalized Consumed (m3/active day)',
      'Assumed Velocity Pipe (%)',
      'Open Alerts',
    ];
    const rows = data.projectComparison.map((p) => [
      p.projectName,
      p.location,
      p.status,
      p.totalSuppliedM3,
      p.totalConsumedM3,
      p.unaccountedM3,
      `${p.unaccountedPercent}%`,
      p.activeDays,
      p.normalizedPerActiveDay,
      `${p.assumedVelocityPercent}%`,
      p.openAlertsCount,
    ]);
    downloadCsv('projects_comparison_normalized', headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Header and Project Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Water Analytics & Intelligence
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
              {data.projectName}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Multidimensional consumption analytics, activity variance ranking, telemetry method reliance, and cross-project benchmarks.
          </p>
        </div>

        {/* Project Selector for Quick Switching */}
        {projects.length > 1 && (
          <div className="flex items-center gap-2 self-start md:self-auto">
            <label className="text-xs font-medium text-slate-500">Project:</label>
            <select
              value={currentProjectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Primary Navigation Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex items-center gap-2 -mb-px">
          {([
            { id: 'activity', label: 'Activity Breakdown', icon: Layers },
            { id: 'method', label: 'Measurement Method', icon: Gauge },
            { id: 'time', label: 'Temporal & Calendar', icon: Calendar },
            { id: 'compare', label: 'Cross-Project Benchmark', icon: ArrowUpDown },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-all cursor-pointer ${
                  isActive
                    ? 'border-sky-600 text-sky-600 dark:text-sky-400 dark:border-sky-400 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.id === 'compare' && !data.canViewCompare && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                    Restricted
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* TAB 1: ACTIVITY */}
      {activeTab === 'activity' && (
        <div className="space-y-6">
          {/* Stacked Area Chart Card */}
          <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  Consumption by Activity Over Time
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Stacked volume (m³) grouped by time period across civil works.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Day / Week / Month grouping selector */}
                <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs">
                  {(['day', 'week', 'month'] as const).map((grp) => (
                    <button
                      key={grp}
                      onClick={() => setActivityGrouping(grp)}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                        activityGrouping === grp
                          ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      {grp.charAt(0).toUpperCase() + grp.slice(1)}
                    </button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportActivityTimeseriesCsv}
                  className="text-xs h-8 gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </Button>
              </div>
            </div>

            {/* Recharts Area Chart */}
            <div className="h-80 w-full pt-4">
              {activityData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No consumption recorded for this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activityData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis
                      dataKey="period"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      unit="m³"
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const total = payload.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
                        return (
                          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl text-xs space-y-1.5">
                            <div className="font-bold text-slate-800 dark:text-slate-100">{label}</div>
                            <div className="text-[11px] font-semibold text-slate-500 border-b pb-1">
                              Total: {total.toFixed(2)} m³
                            </div>
                            <div className="space-y-1">
                              {payload.map((entry) => (
                                <div key={entry.name} className="flex items-center justify-between gap-4">
                                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full"
                                      style={{ backgroundColor: entry.color }}
                                    />
                                    {entry.name}:
                                  </span>
                                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                                    {Number(entry.value).toFixed(2)} m³
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="circle"
                      wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                    />
                    {data.activities.map((act) => (
                      <Area
                        key={act.id}
                        type="monotone"
                        dataKey={act.name}
                        stackId="1"
                        stroke={act.color}
                        fill={act.color}
                        fillOpacity={0.7}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Activity Ranking Table */}
          <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  Activity Ranking & Variance Analysis
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ranking by total volume, percentage share, week-over-week trends, daily averages, and peak demand day.
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={exportActivityRankingCsv}
                className="text-xs h-8 gap-1.5 cursor-pointer self-start sm:self-auto"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Ranking (CSV)</span>
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-3">#</th>
                    <th className="py-3 px-3">Activity</th>
                    <th className="py-3 px-3 text-right">Total Volume</th>
                    <th className="py-3 px-3 text-right">Share %</th>
                    <th className="py-3 px-3 text-right">WoW Trend</th>
                    <th className="py-3 px-3 text-right">Avg / Day</th>
                    <th className="py-3 px-3 text-right">Peak Day</th>
                    <th className="py-3 px-3 text-right">Records</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.activityRanking.map((item, idx) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-3 px-3 font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {item.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {item.totalVolume.toLocaleString()} m³
                      </td>
                      <td className="py-3 px-3 text-right font-medium">
                        <span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                          {item.sharePercent}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {item.wowChangePercent === null ? (
                          <span className="text-slate-400">—</span>
                        ) : item.wowChangePercent > 5 ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                            <TrendingUp className="w-3 h-3" />
                            +{item.wowChangePercent}%
                          </span>
                        ) : item.wowChangePercent < -5 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <TrendingDown className="w-3 h-3" />
                            {item.wowChangePercent}%
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            <Minus className="w-3 h-3" />
                            {item.wowChangePercent}%
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                        {item.avgPerDay.toFixed(2)} m³/day
                      </td>
                      <td className="py-3 px-3 text-right">
                        {item.peakDay.date !== 'N/A' ? (
                          <div>
                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                              {item.peakDay.volume.toFixed(1)} m³
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              {item.peakDay.date}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-500">
                        {item.recordCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: METHOD */}
      {activeTab === 'method' && (
        <div className="space-y-6">
          {/* Method Reliance Alert Banner */}
          {data.assumedVelocityHeavy && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-bold text-amber-800 dark:text-amber-300">
                  High Reliance on Assumed Pipe Velocity ({data.methodBreakdown[1].assumedPercent}%)
                </span>
                <p className="text-amber-700 dark:text-amber-400 leading-relaxed">
                  More than 30% of pipe consumption records in this period rely on the project&apos;s assumed default velocity rather than measured velocity. Consider deploying flow meters or stopwatch bucket calibrations on high-volume lines.
                </p>
              </div>
            </div>
          )}

          {/* Cards for each method */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.methodBreakdown.map((m) => (
              <div
                key={m.method}
                className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {m.method.replace('_', ' ')}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300">
                    {m.sharePercent}%
                  </span>
                </div>

                <div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                    {m.volumeM3.toLocaleString()} m³
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{m.label}</div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs space-y-1.5 text-slate-600 dark:text-slate-400">
                  <div className="flex items-center justify-between">
                    <span>Logged Records:</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {m.recordsCount}
                    </span>
                  </div>
                  {m.method === 'PIPE' && (
                    <div className="flex items-center justify-between">
                      <span>Used Assumed Velocity:</span>
                      <span
                        className={`font-mono font-semibold ${
                          m.assumedPercent > 30 ? 'text-amber-600 dark:text-amber-400' : ''
                        }`}
                      >
                        {m.usedAssumedCount} ({m.assumedPercent}%)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Method Bar Chart */}
          <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  Measurement Methodology Breakdown
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Comparison between measured telemetry (Flow Meters) vs calculated (Pipes) and direct entries.
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={exportMethodCsv}
                className="text-xs h-8 gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Method Data (CSV)</span>
              </Button>
            </div>

            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.methodBreakdown} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    unit="m³"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const item = payload[0].payload as MethodBreakdownItem;
                      return (
                        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl text-xs space-y-1">
                          <div className="font-bold text-slate-900 dark:text-white">{item.label}</div>
                          <div>Volume: <span className="font-mono font-semibold">{item.volumeM3} m³</span></div>
                          <div>Share: <span className="font-mono font-semibold">{item.sharePercent}%</span></div>
                          <div>Records: <span className="font-mono font-semibold">{item.recordsCount}</span></div>
                          {item.method === 'PIPE' && (
                            <div className="text-amber-600 dark:text-amber-400">
                              Assumed Velocity: {item.assumedPercent}%
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="volumeM3" radius={[8, 8, 0, 0]}>
                    <Cell fill="#0ea5e9" />
                    <Cell fill="#3b82f6" />
                    <Cell fill="#6366f1" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TIME (HEATMAP & DAY-OF-WEEK) */}
      {activeTab === 'time' && (
        <div className="space-y-6">
          {/* Heatmap Calendar of Daily Consumption */}
          <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  Heatmap Calendar of Daily Water Consumption
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Visual intensity grid of daily recorded water volumes across the timeline.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Intensity Legend */}
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span>Less</span>
                  <span className="w-3 h-3 rounded-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700" />
                  <span className="w-3 h-3 rounded-sm bg-sky-200 dark:bg-sky-900" />
                  <span className="w-3 h-3 rounded-sm bg-sky-400 dark:bg-sky-700" />
                  <span className="w-3 h-3 rounded-sm bg-sky-600 dark:bg-sky-500" />
                  <span className="w-3 h-3 rounded-sm bg-indigo-700 dark:bg-indigo-400" />
                  <span>More</span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportTimeCsv}
                  className="text-xs h-8 gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </Button>
              </div>
            </div>

            {/* Calendar Heatmap Grid */}
            <div className="pt-2">
              {data.heatmapCalendar.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  No daily consumption telemetry found.
                </div>
              ) : (
                <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-14 lg:grid-cols-20 gap-2">
                  {data.heatmapCalendar.map((day) => {
                    const getBg = () => {
                      switch (day.level) {
                        case 4:
                          return 'bg-indigo-700 text-white dark:bg-indigo-500 hover:ring-2 hover:ring-indigo-400';
                        case 3:
                          return 'bg-sky-600 text-white dark:bg-sky-600 hover:ring-2 hover:ring-sky-400';
                        case 2:
                          return 'bg-sky-400 text-white dark:bg-sky-700 hover:ring-2 hover:ring-sky-300';
                        case 1:
                          return 'bg-sky-100 text-sky-900 dark:bg-sky-950/80 dark:text-sky-300 hover:ring-2 hover:ring-sky-300';
                        case 0:
                        default:
                          return 'bg-slate-100 text-slate-400 dark:bg-slate-800 hover:ring-1 hover:ring-slate-300';
                      }
                    };

                    return (
                      <div
                        key={day.date}
                        title={`${day.date}: ${day.volume} m³ (${day.recordCount} records)`}
                        className={`aspect-square rounded-xl p-1.5 flex flex-col justify-between transition-all cursor-pointer shadow-2xs ${getBg()}`}
                      >
                        <span className="text-[10px] font-mono leading-none font-bold">
                          {day.date.slice(8, 10)}
                        </span>
                        <span className="text-[9px] font-mono leading-none truncate text-right">
                          {day.volume > 0 ? `${Math.round(day.volume)}m³` : '0'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Day of Week Pattern Analysis */}
          <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                Consumption Distribution by Day of Week
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Average consumption (m³/day) across weekdays vs weekends.
              </p>
            </div>

            <div className="h-64 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dayOfWeekStats} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis
                    dataKey="dayName"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    unit="m³"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const stat = payload[0].payload as DayOfWeekStat;
                      return (
                        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl text-xs space-y-1">
                          <div className="font-bold text-slate-900 dark:text-white">{stat.dayName}</div>
                          <div>Average Volume: <span className="font-mono font-semibold">{stat.avgVolume} m³/day</span></div>
                          <div>Total Volume: <span className="font-mono font-semibold">{stat.totalVolume} m³</span></div>
                          <div>Active Dates: <span className="font-mono font-semibold">{stat.daysCount} days</span></div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="avgVolume" fill="#0284c7" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: COMPARE (PROJECT COMPARISON) */}
      {activeTab === 'compare' && (
        <div className="space-y-6">
          {!data.canViewCompare ? (
            <div className="p-8 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <ShieldCheck className="w-10 h-10 text-slate-400 mx-auto" />
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">
                Restricted Benchmark View
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Cross-project normalized comparisons are accessible exclusively to Project Managers and Auditors for governance and audit oversight.
              </p>
            </div>
          ) : (
            <>
              {/* Normalized Comparison Bar Chart */}
              <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <ArrowUpDown className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                      Cross-Project Comparison (Normalized Per Active Day)
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Consumption normalized per active working day (m³/active day) across all accessible projects.
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportCompareCsv}
                    className="text-xs h-8 gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Comparison (CSV)</span>
                  </Button>
                </div>

                <div className="h-80 w-full pt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.projectComparison}
                      margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis
                        dataKey="projectName"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        unit="m³"
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const p = payload[0].payload as ProjectCompareItem;
                          return (
                            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl text-xs space-y-1.5">
                              <div className="font-bold text-slate-900 dark:text-white">{p.projectName}</div>
                              <div className="text-[11px] text-slate-400">{p.location}</div>
                              <div className="border-t pt-1 space-y-1">
                                <div>
                                  Normalized: <span className="font-mono font-bold text-sky-600 dark:text-sky-400">{p.normalizedPerActiveDay} m³/day</span>
                                </div>
                                <div>Active Days: <span className="font-mono">{p.activeDays}</span></div>
                                <div>Total Consumed: <span className="font-mono">{p.totalConsumedM3} m³</span></div>
                                <div>Total Supplied: <span className="font-mono">{p.totalSuppliedM3} m³</span></div>
                                <div>Unaccounted: <span className="font-mono">{p.unaccountedPercent}%</span></div>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="normalizedPerActiveDay" fill="#0284c7" radius={[8, 8, 0, 0]}>
                        {data.projectComparison.map((entry) => (
                          <Cell
                            key={entry.projectId}
                            fill={entry.projectId === currentProjectId ? '#0284c7' : '#94a3b8'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Comparison Table */}
              <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    Normalized Portfolio Benchmark Table
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Standardized metrics per active day for fair cross-project evaluation.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                        <th className="py-3 px-3">Project</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Supplied</th>
                        <th className="py-3 px-3 text-right">Consumed</th>
                        <th className="py-3 px-3 text-right">Active Days</th>
                        <th className="py-3 px-3 text-right">Norm. Consumed</th>
                        <th className="py-3 px-3 text-right">Unaccounted %</th>
                        <th className="py-3 px-3 text-right">Assumed Vel. %</th>
                        <th className="py-3 px-3 text-right">Alerts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.projectComparison.map((p) => {
                        const isCurrent = p.projectId === currentProjectId;
                        return (
                          <tr
                            key={p.projectId}
                            className={`transition-colors ${
                              isCurrent
                                ? 'bg-sky-50/70 dark:bg-sky-950/40 font-semibold'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                          >
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                <div>
                                  <div className="text-slate-900 dark:text-white flex items-center gap-1.5">
                                    <span>{p.projectName}</span>
                                    {isCurrent && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-sky-200 dark:bg-sky-800 text-sky-800 dark:text-sky-200">
                                        Current
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-400">{p.location}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {p.status}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono">{p.totalSuppliedM3} m³</td>
                            <td className="py-3 px-3 text-right font-mono">{p.totalConsumedM3} m³</td>
                            <td className="py-3 px-3 text-right font-mono">{p.activeDays}</td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-sky-600 dark:text-sky-400">
                              {p.normalizedPerActiveDay.toFixed(2)} m³/day
                            </td>
                            <td className="py-3 px-3 text-right font-mono">
                              <span
                                className={`px-2 py-0.5 rounded-md ${
                                  p.unaccountedPercent > 15
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {p.unaccountedPercent}%
                              </span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono">
                              {p.assumedVelocityPercent > 30 ? (
                                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                  {p.assumedVelocityPercent}%
                                </span>
                              ) : (
                                <span>{p.assumedVelocityPercent}%</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right">
                              {p.openAlertsCount > 0 ? (
                                <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                                  {p.openAlertsCount}
                                </span>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
