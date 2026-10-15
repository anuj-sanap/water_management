'use client';

import { useMemo, useState } from 'react';
import { FileDown, FileText, LoaderCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { Role } from '@prisma/client';
import type { ReportParams, ReportSnapshot, ReportType } from '@/lib/reporting';

interface ProjectOption {
  id: string;
  name: string;
  location: string;
}

export interface ReportHistoryItem {
  id: string;
  type: string;
  format: string;
  createdAt: string;
  createdBy: string;
  projectNames: string[];
}

const TYPE_OPTIONS: Array<{ value: ReportType; label: string; description: string }> = [
  { value: 'DAILY_CONSUMPTION', label: 'Daily consumption', description: 'Consumption totals by date, activity, and method.' },
  { value: 'WATER_BALANCE', label: 'Weekly / monthly water balance', description: 'Supply, recorded consumption, variance, and alert summary.' },
  { value: 'ACTIVITY_CONSUMPTION', label: 'Activity-wise consumption', description: 'Compare usage by activity and method over time.' },
  { value: 'AUDIT', label: 'Audit report', description: 'Record inputs, assumed velocity, entry details, and edit history.' },
];

const DISCLAIMER =
  'Unaccounted water is the difference between supplied and recorded water and is not necessarily wastage.';

function isRestrictedEngineerType(type: ReportType): boolean {
  return type === 'WATER_BALANCE' || type === 'AUDIT';
}

function reportLabel(type: string): string {
  return TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

function formatCell(value: string | number) {
  return typeof value === 'number'
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value)
    : value;
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
  return fallback;
}

export function ReportsManagement({
  projects,
  initialProjectId,
  user,
  initialHistory,
}: {
  projects: ProjectOption[];
  initialProjectId: string;
  user: { id: string; name: string; role: Role };
  initialHistory: ReportHistoryItem[];
}) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [type, setType] = useState<ReportType>('DAILY_CONSUMPTION');
  const [selectedIds, setSelectedIds] = useState<string[]>(initialProjectId ? [initialProjectId] : []);
  const [from, setFrom] = useState(() => `${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [grouping, setGrouping] = useState<ReportParams['grouping']>('week');
  const [unit, setUnit] = useState<ReportParams['unit']>('m3');
  const [includeCharts, setIncludeCharts] = useState(true);
  const [previewState, setPreviewState] = useState<{ key: string; loading: boolean; data?: ReportSnapshot } | null>(null);
  const [generating, setGenerating] = useState<'pdf' | 'csv' | 'xlsx' | null>(null);
  const [history, setHistory] = useState(initialHistory);

  const params = useMemo<ReportParams>(() => ({
    type,
    projectIds: selectedIds,
    from,
    to,
    grouping,
    unit,
    includeCharts,
  }), [type, selectedIds, from, to, grouping, unit, includeCharts]);
  const paramsKey = JSON.stringify(params);
  const visiblePreview = previewState?.key === paramsKey ? previewState.data : undefined;
  const previewLoading = previewState?.key === paramsKey && previewState.loading;
  const engineerRestricted = user.role === 'SITE_ENGINEER';
  const dateError = from > to ? 'Start date must be on or before the end date.' : '';

  function toggleProject(projectId: string) {
    setSelectedIds((current) => current.includes(projectId)
      ? current.filter((id) => id !== projectId)
      : [...current, projectId]);
  }

  async function requestPreview() {
    if (!selectedIds.length) {
      toast.error('Select at least one project.');
      return;
    }
    if (dateError) {
      toast.error(dateError);
      return;
    }
    const key = paramsKey;
    setPreviewState({ key, loading: true });
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', params }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body, 'Report preview failed.'));
      setPreviewState({ key, loading: false, data: body as ReportSnapshot });
    } catch (error) {
      setPreviewState({ key, loading: false });
      toast.error(error instanceof Error ? error.message : 'Report preview failed.');
    }
  }

  async function generate(format: 'pdf' | 'csv' | 'xlsx') {
    if (!selectedIds.length) {
      toast.error('Select at least one project.');
      return;
    }
    if (dateError) {
      toast.error(dateError);
      return;
    }
    setGenerating(format);
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', format, params }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body, 'Report generation failed.'));
      const generated = body as {
        id: string;
        type: string;
        format: string;
        createdAt: string;
        createdBy: string;
        downloadUrl: string;
      };
      setHistory((current) => [{
        id: generated.id,
        type: generated.type,
        format: generated.format,
        createdAt: generated.createdAt,
        createdBy: generated.createdBy,
        projectNames: selectedIds.map((id) => projects.find((project) => project.id === id)?.name ?? ''),
      }, ...current]);
      await downloadFile(generated.downloadUrl, `${type.toLowerCase()}-${from}-to-${to}.${format}`);
      toast.success('Report saved to history and download started.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Report generation failed.');
    } finally {
      setGenerating(null);
    }
  }

  async function downloadFile(url: string, filename: string) {
    const response = await fetch(url);
    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      throw new Error(errorMessage(body, 'The report download failed.'));
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  async function downloadHistory(item: ReportHistoryItem) {
    try {
      await downloadFile(`/api/reports/${item.id}`, `${item.type.toLowerCase()}.${item.format}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The report download failed.');
    }
  }

  const maxChart = Math.max(1, ...(visiblePreview?.chartData ?? []).map((item) => Math.max(item.suppliedM3, item.consumedM3)));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-sky-700 dark:text-sky-400">
          <FileText className="size-4" /> Reporting
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">Reports</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Build a report, inspect the final layout, then export or re-download a saved report.</p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="h-fit space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div>
            <label htmlFor="report-type" className="mb-2 block text-sm font-bold text-slate-800 dark:text-slate-100">Report type</label>
            <select id="report-type" value={type} onChange={(event) => setType(event.target.value as ReportType)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950">
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} disabled={engineerRestricted && isRestrictedEngineerType(option.value)}>
                  {option.label}{engineerRestricted && isRestrictedEngineerType(option.value) ? ' — managers and auditors' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">{TYPE_OPTIONS.find((option) => option.value === type)?.description}</p>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-bold text-slate-800 dark:text-slate-100">Project(s)</legend>
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              {projects.length === 0 && <p className="text-xs text-slate-500">No accessible projects.</p>}
              {projects.map((project) => (
                <label key={project.id} className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <input type="checkbox" checked={selectedIds.includes(project.id)} onChange={() => toggleProject(project.id)} className="mt-0.5 accent-sky-600" />
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-800 dark:text-slate-100">{project.name}</span>
                    <span className="block truncate text-xs text-slate-500">{project.location}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="report-from" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">From</label>
              <input id="report-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </div>
            <div>
              <label htmlFor="report-to" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">To</label>
              <input id="report-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950" />
            </div>
          </div>
          {dateError && <p role="alert" className="text-xs font-medium text-rose-600">{dateError}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="report-grouping" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Grouping</label>
              <select id="report-grouping" value={grouping} onChange={(event) => setGrouping(event.target.value as ReportParams['grouping'])} className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                <option value="day">Daily</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
              </select>
            </div>
            <div>
              <label htmlFor="report-unit" className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Volume unit</label>
              <select id="report-unit" value={unit} onChange={(event) => setUnit(event.target.value as ReportParams['unit'])} className="w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                <option value="m3">m³</option>
                <option value="L">Litres</option>
              </select>
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">
            <span>
              <span className="block font-semibold text-slate-800 dark:text-slate-100">Include charts</span>
              <span className="block text-xs text-slate-500">Add charts to preview and PDF.</span>
            </span>
            <input type="checkbox" checked={includeCharts} onChange={(event) => setIncludeCharts(event.target.checked)} className="size-4 accent-sky-600" />
          </label>

          <button type="button" onClick={requestPreview} disabled={!selectedIds.length || Boolean(dateError) || previewLoading} className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-600 px-4 py-2.5 text-sm font-bold text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-300 dark:hover:bg-sky-950">
            {previewLoading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Refresh preview
          </button>
          <div className="grid grid-cols-3 gap-2">
            {(['pdf', 'csv', 'xlsx'] as const).map((format) => (
              <button key={format} type="button" onClick={() => void generate(format)} disabled={!selectedIds.length || Boolean(dateError) || generating !== null} className="flex min-h-11 items-center justify-center gap-1 rounded-xl bg-sky-700 px-2 text-xs font-bold uppercase text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50">
                {generating === format ? <LoaderCircle className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
                {format}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-slate-500">Every generated export is saved to report history. PDF includes the standard unaccounted-water disclaimer and assumptions.</p>
        </div>

        <div className="min-w-0">
          {visiblePreview ? (
            <article className="mx-auto min-h-[42rem] max-w-5xl space-y-5 border border-slate-200 bg-white p-5 shadow-lg sm:p-8 dark:border-slate-700 dark:bg-white">
              <div className="border-b-2 border-sky-600 pb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-700">HydroTrack · Water Management</p>
                <h2 className="mt-2 text-xl font-black text-slate-950">{visiblePreview.title}</h2>
                <div className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                  <p><strong>Project(s):</strong> {visiblePreview.projectNames.join(', ')}</p>
                  <p><strong>Date range:</strong> {visiblePreview.from} to {visiblePreview.to}</p>
                  <p><strong>Generated by:</strong> {visiblePreview.generatedBy}</p>
                  <p><strong>Generated:</strong> {new Date(visiblePreview.generatedAt).toLocaleString()}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {visiblePreview.kpis.map((kpi) => (
                  <div key={kpi.label} className="rounded-xl bg-slate-100 p-3">
                    <p className="text-[10px] font-semibold text-slate-500">{kpi.label}</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{kpi.value}</p>
                  </div>
                ))}
              </div>

              {includeCharts && visiblePreview.chartData.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-sm font-bold text-slate-900">Volume by period</h3>
                  {visiblePreview.chartData.map((item) => (
                    <div key={item.label} className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2">
                      <span className="truncate text-[10px] text-slate-600" title={item.label}>{item.label}</span>
                      <div className="space-y-1">
                        <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-sky-600" style={{ width: `${Math.max(item.suppliedM3 ? 1 : 0, item.suppliedM3 / maxChart * 100)}%` }} /></div>
                        <div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-teal-500" style={{ width: `${Math.max(item.consumedM3 ? 1 : 0, item.consumedM3 / maxChart * 100)}%` }} /></div>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-4 pt-1 text-[10px] text-slate-500"><span>■ Supply</span><span>■ Recorded consumption</span></div>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-bold text-slate-900">Report data</h3>
                <div className="max-h-[32rem] overflow-auto rounded-lg border border-slate-200">
                  <table className="min-w-full border-collapse text-left text-[10px] text-slate-800">
                    <thead className="sticky top-0 bg-sky-900 text-white">
                      <tr>{visiblePreview.columns.map((column) => <th key={column.key} className="whitespace-nowrap px-2 py-2 font-semibold">{column.label}</th>)}</tr>
                    </thead>
                    <tbody>
                      {visiblePreview.rows.map((row, index) => (
                        <tr key={`${String(row.recordId ?? row.date ?? row.period ?? index)}-${index}`} className={index % 2 ? 'bg-slate-50' : 'bg-white'}>
                          {visiblePreview.columns.map((column) => (
                            <td key={column.key} className="max-w-64 border-b border-slate-100 px-2 py-2 align-top">{formatCell(row[column.key] ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                      {visiblePreview.rows.length === 0 && <tr><td colSpan={visiblePreview.columns.length} className="px-3 py-8 text-center text-slate-500">No records match this date range.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-bold text-slate-900">Assumptions</h3>
                {visiblePreview.assumptions.length
                  ? <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">{visiblePreview.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
                  : <p className="text-xs text-slate-600">No assumed velocity was used in this report.</p>}
              </section>
              <footer className="border-t border-slate-300 pt-3 text-[10px] text-slate-600">{DISCLAIMER}</footer>
            </article>
          ) : (
            <div className="flex min-h-[28rem] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              {previewLoading ? <LoaderCircle className="mb-3 size-8 animate-spin text-sky-600" /> : <FileText className="mb-3 size-8 text-slate-400" />}
              <h2 className="font-bold text-slate-800 dark:text-slate-100">{previewLoading ? 'Building preview…' : 'Preview your report'}</h2>
              <p className="mt-1 max-w-sm text-sm text-slate-500">Choose the report settings, then refresh the preview to see the document layout and calculated totals.</p>
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Report history</h2>
            <p className="text-xs text-slate-500">Saved exports retain their original data snapshot for re-download.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{history.length} reports</span>
        </div>
        {history.length ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {history.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white">{reportLabel(item.type)} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">{item.format}</span></p>
                  <p className="mt-1 truncate text-xs text-slate-500">{item.projectNames.join(', ')}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{new Date(item.createdAt).toLocaleString()} · {item.createdBy}</p>
                </div>
                <button type="button" onClick={() => downloadHistory(item)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                  <FileDown className="size-4" /> Re-download {item.format.toUpperCase()}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Generated reports will appear here with a re-download option.</p>
        )}
      </section>
    </div>
  );
}
