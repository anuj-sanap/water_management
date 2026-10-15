'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { RoleBadge } from '@/components/role-badge';
import { Role } from '@prisma/client';
import {
  History,
  Search,
  X,
  Eye,
  Calendar,
  Check,
  Copy,
  Shield,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetClose,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export interface AuditLogItem {
  id: string;
  createdAt: Date | string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  beforeJson: string | null;
  afterJson: string | null;
  user: {
    name: string;
    email: string;
    role: Role;
  };
}

interface AuditLogViewProps {
  initialLogs: AuditLogItem[];
  userRole: Role;
  page: number;
  pageSize: number;
  totalCount: number;
}

export function AuditLogView({ initialLogs, userRole, page, pageSize, totalCount }: AuditLogViewProps) {
  const router = useRouter();
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState('ALL');
  const [selectedAction, setSelectedAction] = useState('ALL');
  const [selectedEntity, setSelectedEntity] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected Log for Diff Drawer
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [diffMode, setDiffMode] = useState<'visual' | 'raw'>('visual');
  const [copied, setCopied] = useState(false);

  // Extract distinct options for dropdowns
  const uniqueUsers = useMemo(() => {
    const map = new Map<string, string>();
    initialLogs.forEach((l) => map.set(l.userId, l.user.name));
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [initialLogs]);

  const uniqueActions = useMemo(() => {
    return Array.from(new Set(initialLogs.map((l) => l.action))).sort();
  }, [initialLogs]);

  const uniqueEntities = useMemo(() => {
    return Array.from(new Set(initialLogs.map((l) => l.entity))).sort();
  }, [initialLogs]);

  // Filter evaluation
  const filteredLogs = useMemo(() => {
    return initialLogs.filter((log) => {
      if (selectedUser !== 'ALL' && log.userId !== selectedUser) return false;
      if (selectedAction !== 'ALL' && log.action !== selectedAction) return false;
      if (selectedEntity !== 'ALL' && log.entity !== selectedEntity) return false;

      const logDate = new Date(log.createdAt).toISOString().slice(0, 10);
      if (startDate && logDate < startDate) return false;
      if (endDate && logDate > endDate) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const userMatch = log.user.name.toLowerCase().includes(q) || log.user.email.toLowerCase().includes(q);
        const actionMatch = log.action.toLowerCase().includes(q);
        const entityMatch = log.entity.toLowerCase().includes(q) || log.entityId.toLowerCase().includes(q);
        const jsonMatch =
          (log.beforeJson && log.beforeJson.toLowerCase().includes(q)) ||
          (log.afterJson && log.afterJson.toLowerCase().includes(q));

        if (!userMatch && !actionMatch && !entityMatch && !jsonMatch) return false;
      }

      return true;
    });
  }, [initialLogs, selectedUser, selectedAction, selectedEntity, startDate, endDate, searchQuery]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedUser('ALL');
    setSelectedAction('ALL');
    setSelectedEntity('ALL');
    setStartDate('');
    setEndDate('');
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('CREATE') || action.includes('IMPORT')) {
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    }
    if (action.includes('DELETE') || action.includes('DEACTIVATE')) {
      return 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    }
    if (action.includes('UPDATE') || action.includes('ASSIGN')) {
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    }
    if (action.includes('ALERT') || action.includes('RESOLVE')) {
      return 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200 dark:border-sky-800';
    }
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  };

  // Safe parse JSON
  const parseJsonSafe = (raw: string | null) => {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  const beforeObj = selectedLog ? parseJsonSafe(selectedLog.beforeJson) : null;
  const afterObj = selectedLog ? parseJsonSafe(selectedLog.afterJson) : null;

  // Compute key-by-key changes
  const computedDiff = useMemo(() => {
    if (!beforeObj && !afterObj) return [];
    if (typeof beforeObj !== 'object' || typeof afterObj !== 'object') return [];

    const b = beforeObj || {};
    const a = afterObj || {};
    const allKeys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).sort();

    return allKeys.map((key) => {
      const hasBefore = key in b;
      const hasAfter = key in a;
      const valBefore = b[key];
      const valAfter = a[key];

      const strBefore = typeof valBefore === 'object' ? JSON.stringify(valBefore) : String(valBefore);
      const strAfter = typeof valAfter === 'object' ? JSON.stringify(valAfter) : String(valAfter);

      let status: 'added' | 'removed' | 'modified' | 'unchanged' = 'unchanged';
      if (!hasBefore && hasAfter) status = 'added';
      else if (hasBefore && !hasAfter) status = 'removed';
      else if (strBefore !== strAfter) status = 'modified';

      return {
        key,
        status,
        before: hasBefore ? valBefore : undefined,
        after: hasAfter ? valAfter : undefined,
      };
    });
  }, [beforeObj, afterObj]);

  const copyDiffJson = () => {
    if (!selectedLog) return;
    const text = JSON.stringify(
      {
        action: selectedLog.action,
        entity: selectedLog.entity,
        entityId: selectedLog.entityId,
        user: selectedLog.user,
        timestamp: selectedLog.createdAt,
        before: beforeObj,
        after: afterObj,
      },
      null,
      2
    );
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Audit entry copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <History className="w-6 h-6 text-sky-600 dark:text-sky-400" />
            Compliance & Audit Trail
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Immutable, cryptographically backed system activity ledger. Read-only for compliance officers, auditors, and project managers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <RoleBadge role={userRole} />
          {userRole === 'AUDITOR' && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              Auditor Certified
            </span>
          )}
        </div>
      </div>

      {/* Filter Card */}
      <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* Free text search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by user, action, entity, ID, or JSON values..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 rounded-xl bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Date Inputs */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent focus:outline-none text-slate-700 dark:text-slate-300 text-xs"
                title="Filter Start Date"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent focus:outline-none text-slate-700 dark:text-slate-300 text-xs"
                title="Filter End Date"
              />
            </div>

            {(searchQuery || selectedUser !== 'ALL' || selectedAction !== 'ALL' || selectedEntity !== 'ALL' || startDate || endDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="text-xs h-9 text-slate-500 hover:text-rose-600"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Dropdown Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 block mb-1">User:</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="ALL">All Users</option>
              {uniqueUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-500 block mb-1">Action:</label>
            <select
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="ALL">All Actions</option>
              {uniqueActions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-500 block mb-1">Entity:</label>
            <select
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              className="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="ALL">All Entities</option>
              {uniqueEntities.map((ent) => (
                <option key={ent} value={ent}>
                  {ent}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>
            Showing <strong className="text-slate-900 dark:text-white font-mono">{filteredLogs.length}</strong> recorded audit events
          </span>
          <span className="text-[11px] italic">Sorted newest first</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Entity ID</th>
                <th className="py-3 px-4 text-right">Inspection</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No audit records match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const dateObj = new Date(log.createdAt);
                  const formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const formattedDate = dateObj.toLocaleDateString();

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono text-slate-900 dark:text-white font-medium">
                          {formattedDate}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {formattedTime}
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {log.user.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {log.user.email}
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border font-mono ${getActionBadgeColor(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                        {log.entity}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-400">
                        {log.entityId ? `${log.entityId.slice(0, 12)}...` : '—'}
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="text-xs h-8 gap-1 text-sky-600 dark:text-sky-400 group-hover:bg-sky-50 dark:group-hover:bg-sky-950/60"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Diff</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <nav aria-label="Audit history pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-slate-600 dark:text-slate-300">
          {totalCount === 0 ? 'No audit events' : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalCount)} of ${totalCount} events`}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => {
            const params = new URLSearchParams(window.location.search);
            params.set('page', String(page - 1));
            router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false });
          }}>Previous</Button>
          <span className="tabular-nums">Page {page} of {Math.max(1, Math.ceil(totalCount / pageSize))}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(totalCount / pageSize)} onClick={() => {
            const params = new URLSearchParams(window.location.search);
            params.set('page', String(page + 1));
            router.push(`${window.location.pathname}?${params.toString()}`, { scroll: false });
          }}>Next</Button>
        </div>
      </nav>

      {/* Diff Viewer Drawer / Slide-Over Sheet */}
      <Sheet open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <SheetContent side="right" className="sm:max-w-xl w-full p-0 flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
          {selectedLog && (
            <>
              {/* Drawer Header */}
              <div className="p-6 border-b border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border font-mono ${getActionBadgeColor(
                      selectedLog.action
                    )}`}
                  >
                    {selectedLog.action}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyDiffJson}
                      className="text-xs h-8 gap-1.5 cursor-pointer"
                      title="Copy JSON Payload"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </Button>
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Audit Diff Inspector
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Target: <strong className="text-slate-700 dark:text-slate-300">{selectedLog.entity}</strong> (ID: {selectedLog.entityId})
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Actor:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{selectedLog.user.name}</span>
                    <span className="text-[10px] text-slate-400 block font-mono">{selectedLog.user.email}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Timestamp:</span>
                    <span className="font-mono font-medium text-slate-800 dark:text-slate-200">
                      {new Date(selectedLog.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* View Switcher: Formatted Visual Diff vs Raw JSON */}
                <div className="flex items-center justify-between pt-1">
                  <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs">
                    <button
                      onClick={() => setDiffMode('visual')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                        diffMode === 'visual'
                          ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Readable Diff
                    </button>
                    <button
                      onClick={() => setDiffMode('raw')}
                      className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                        diffMode === 'raw'
                          ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Raw JSON
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-400">
                    {computedDiff.length} properties analyzed
                  </span>
                </div>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {diffMode === 'visual' ? (
                  <div className="space-y-3">
                    {computedDiff.length === 0 ? (
                      <div className="text-center py-12 text-xs text-slate-400">
                        No property changes recorded for this event.
                      </div>
                    ) : (
                      computedDiff.map((item) => {
                        const isModified = item.status === 'modified';
                        const isAdded = item.status === 'added';
                        const isRemoved = item.status === 'removed';

                        return (
                          <div
                            key={item.key}
                            className={`p-3 rounded-2xl border text-xs space-y-1.5 transition-colors ${
                              isModified
                                ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
                                : isAdded
                                ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                                : isRemoved
                                ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                                : 'bg-slate-50/40 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-800/60'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                {item.key}
                              </span>
                              <span
                                className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded ${
                                  isModified
                                    ? 'bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200'
                                    : isAdded
                                    ? 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200'
                                    : isRemoved
                                    ? 'bg-rose-200 text-rose-900 dark:bg-rose-900 dark:text-rose-200'
                                    : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                                }`}
                              >
                                {item.status}
                              </span>
                            </div>

                            {isModified ? (
                              <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                                <div className="p-2 rounded-xl bg-rose-100/60 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 overflow-x-auto">
                                  <span className="text-[10px] text-rose-500 block font-sans">Before:</span>
                                  {JSON.stringify(item.before, null, 2)}
                                </div>
                                <div className="p-2 rounded-xl bg-emerald-100/60 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 overflow-x-auto">
                                  <span className="text-[10px] text-emerald-500 block font-sans">After:</span>
                                  {JSON.stringify(item.after, null, 2)}
                                </div>
                              </div>
                            ) : isAdded ? (
                              <div className="p-2 rounded-xl bg-emerald-100/60 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-mono text-[11px] overflow-x-auto">
                                {JSON.stringify(item.after, null, 2)}
                              </div>
                            ) : isRemoved ? (
                              <div className="p-2 rounded-xl bg-rose-100/60 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 font-mono text-[11px] line-through overflow-x-auto">
                                {JSON.stringify(item.before, null, 2)}
                              </div>
                            ) : (
                              <div className="font-mono text-[11px] text-slate-500 overflow-x-auto">
                                {JSON.stringify(item.after, null, 2)}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedLog.beforeJson && (
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                          Before State (JSON)
                        </span>
                        <pre className="p-3 rounded-2xl bg-slate-900 text-rose-300 font-mono text-xs overflow-x-auto">
                          {JSON.stringify(beforeObj, null, 2)}
                        </pre>
                      </div>
                    )}

                    {selectedLog.afterJson && (
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          After State (JSON)
                        </span>
                        <pre className="p-3 rounded-2xl bg-slate-900 text-emerald-300 font-mono text-xs overflow-x-auto">
                          {JSON.stringify(afterObj, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                <SheetClose asChild>
                  <Button variant="outline" size="sm" className="text-xs">
                    Close Drawer
                  </Button>
                </SheetClose>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
