'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertStatus, AlertSeverity, AlertType, Role } from '@prisma/client';
import {
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle2,
  Clock,
  Search,
  Check,
  X,
  Building2,
  Calendar,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  acknowledgeAlertAction,
  resolveAlertAction,
} from '@/app/actions/alert-actions';
import { AUDITOR_DISABLED_TOOLTIP } from '@/lib/rbac';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface AlertItem {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  projectId: string;
  date: Date | string;
  message: string;
  status: AlertStatus;
  resolutionNote: string | null;
  createdAt: Date | string;
  project: {
    id: string;
    name: string;
    location: string;
  };
  resolvedBy: {
    id: string;
    name: string;
    role: Role;
  } | null;
}

interface AlertsViewProps {
  initialAlerts: AlertItem[];
  projects: Array<{ id: string; name: string; location: string }>;
  currentProjectId?: string;
  userRole: Role;
}

export function AlertsView({
  initialAlerts,
  projects,
  currentProjectId,
  userRole,
}: AlertsViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isAuditor = userRole === 'AUDITOR';

  // Filters
  const [selectedProject, setSelectedProject] = useState<string>(currentProjectId || 'ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Resolution Modal State
  const [resolvingAlert, setResolvingAlert] = useState<AlertItem | null>(null);
  const [resolutionNote, setResolutionNote] = useState<string>('');

  // Filter computation
  const filteredAlerts = initialAlerts.filter((alert) => {
    if (selectedProject !== 'ALL' && alert.projectId !== selectedProject) return false;
    if (selectedStatus !== 'ALL' && alert.status !== selectedStatus) return false;
    if (selectedSeverity !== 'ALL' && alert.severity !== selectedSeverity) return false;
    if (selectedType !== 'ALL' && alert.type !== selectedType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchMsg = alert.message.toLowerCase().includes(q);
      const matchProj = alert.project.name.toLowerCase().includes(q);
      const matchType = alert.type.toLowerCase().includes(q);
      if (!matchMsg && !matchProj && !matchType) return false;
    }
    return true;
  });

  // Stat counts
  const totalCount = initialAlerts.length;
  const openCount = initialAlerts.filter((a) => a.status === AlertStatus.OPEN).length;
  const acknowledgedCount = initialAlerts.filter((a) => a.status === AlertStatus.ACKNOWLEDGED).length;
  const resolvedCount = initialAlerts.filter((a) => a.status === AlertStatus.RESOLVED).length;
  const criticalCount = initialAlerts.filter(
    (a) => a.severity === AlertSeverity.CRITICAL && a.status !== AlertStatus.RESOLVED
  ).length;

  const handleAcknowledge = async (alertId: string) => {
    if (isAuditor) return;
    startTransition(async () => {
      try {
        await acknowledgeAlertAction(alertId);
        toast.success('Alert status set to Acknowledged');
        router.refresh();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to acknowledge alert');
      }
    });
  };

  const handleOpenResolveModal = (alert: AlertItem) => {
    if (isAuditor) return;
    setResolvingAlert(alert);
    setResolutionNote('');
  };

  const handleConfirmResolve = async () => {
    if (!resolvingAlert || isAuditor) return;
    startTransition(async () => {
      try {
        await resolveAlertAction(resolvingAlert.id, resolutionNote);
        toast.success('Alert successfully marked as Resolved');
        setResolvingAlert(null);
        router.refresh();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to resolve alert');
      }
    });
  };

  const getSeverityBadge = (severity: AlertSeverity) => {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
            <AlertOctagon className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            CRITICAL
          </span>
        );
      case AlertSeverity.HIGH:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            HIGH
          </span>
        );
      case AlertSeverity.MEDIUM:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            MEDIUM
          </span>
        );
      case AlertSeverity.LOW:
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-900">
            <Info className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            LOW
          </span>
        );
    }
  };

  const getStatusBadge = (status: AlertStatus) => {
    switch (status) {
      case AlertStatus.OPEN:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            Open
          </span>
        );
      case AlertStatus.ACKNOWLEDGED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3 h-3 text-amber-600" />
            Acknowledged
          </span>
        );
      case AlertStatus.RESOLVED:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Resolved
          </span>
        );
    }
  };

  const formatTypeLabel = (type: AlertType) => {
    switch (type) {
      case AlertType.SPIKE:
        return 'Consumption Spike';
      case AlertType.DROP:
        return 'Consumption Drop';
      case AlertType.NO_RECORDS:
        return 'Missing Records';
      case AlertType.EXCEEDS_SUPPLY:
        return 'Exceeds Supply Check';
      case AlertType.HIGH_UNACCOUNTED:
        return 'High Unaccounted Water';
      case AlertType.ASSUMED_VELOCITY_HEAVY:
        return 'Velocity Assumptions (>30%)';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Stat Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-sky-600 dark:text-sky-400" />
            System Alerts & Anomaly Feed
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Automated anomaly detection monitoring consumption variations, supply checks, and telemetry data quality.
          </p>
        </div>

        <button
          onClick={() => {
            startTransition(() => {
              router.refresh();
            });
          }}
          disabled={isPending}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs transition-all cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} />
          <span>Recompute & Refresh</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Anomalies</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{totalCount}</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900/60 shadow-xs">
          <div className="text-xs font-medium text-rose-600 dark:text-rose-400 flex items-center justify-between">
            <span>Action Required (Open)</span>
            {openCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            )}
          </div>
          <div className="mt-1 text-2xl font-bold text-rose-600 dark:text-rose-400">{openCount}</div>
          <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">{criticalCount} critical</p>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 shadow-xs">
          <div className="text-xs font-medium text-amber-600 dark:text-amber-400">In Review (Acknowledged)</div>
          <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{acknowledgedCount}</div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 shadow-xs">
          <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Resolved</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{resolvedCount}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by anomaly description, project, or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 rounded-xl bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-sm"
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

          {/* Project selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500 shrink-0">Project:</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
            >
              <option value="ALL">All Accessible Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Secondary Filter Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span className="text-slate-400 font-medium">Status:</span>
          {['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'].map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                selectedStatus === status
                  ? 'bg-sky-500 text-white shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
            </button>
          ))}

          <span className="text-slate-400 font-medium ml-2">Severity:</span>
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
            <button
              key={sev}
              onClick={() => setSelectedSeverity(sev)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
                selectedSeverity === sev
                  ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 shadow-2xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {sev === 'ALL' ? 'All' : sev.charAt(0) + sev.slice(1).toLowerCase()}
            </button>
          ))}

          <span className="text-slate-400 font-medium ml-2">Type:</span>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300"
          >
            <option value="ALL">All Anomaly Types</option>
            <option value={AlertType.SPIKE}>Spike</option>
            <option value={AlertType.DROP}>Drop</option>
            <option value={AlertType.NO_RECORDS}>Missing Records</option>
            <option value={AlertType.EXCEEDS_SUPPLY}>Exceeds Supply</option>
            <option value={AlertType.HIGH_UNACCOUNTED}>High Unaccounted</option>
            <option value={AlertType.ASSUMED_VELOCITY_HEAVY}>Velocity Heavy (&gt;30%)</option>
          </select>
        </div>
      </div>

      {/* Alerts Feed List */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              No anomalies match your filters
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
              Water balance, supply records, and velocity reliance telemetry are operating within normal project thresholds.
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const dateStr = typeof alert.date === 'string'
              ? alert.date.slice(0, 10)
              : new Date(alert.date).toISOString().slice(0, 10);

            return (
              <div
                key={alert.id}
                className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border transition-all ${
                  alert.status === AlertStatus.OPEN
                    ? 'border-rose-200 dark:border-rose-900/60 shadow-xs hover:border-rose-300'
                    : alert.status === AlertStatus.ACKNOWLEDGED
                    ? 'border-amber-200 dark:border-amber-900/60'
                    : 'border-slate-200 dark:border-slate-800 opacity-80'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Left: Metadata & Message */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {getSeverityBadge(alert.severity)}
                      {getStatusBadge(alert.status)}
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {formatTypeLabel(alert.type)}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                      {alert.message}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5" />
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{alert.project.name}</span>
                        <span>({alert.project.location})</span>
                      </span>

                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Date: <span className="font-mono">{dateStr}</span></span>
                      </span>

                      {alert.resolvedBy && (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          Resolved by {alert.resolvedBy.name}
                        </span>
                      )}
                    </div>

                    {alert.resolutionNote && (
                      <div className="mt-2 text-xs bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">Resolution Note: </span>
                        {alert.resolutionNote}
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center sm:flex-col gap-2 shrink-0 sm:items-end justify-end">
                    {isAuditor ? (
                      <div
                        title={AUDITOR_DISABLED_TOOLTIP}
                        className="text-xs text-slate-400 italic px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
                      >
                        Read-only for auditors
                      </div>
                    ) : (
                      <>
                        {alert.status === AlertStatus.OPEN && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleAcknowledge(alert.id)}
                            className="text-xs h-8 text-amber-700 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950/40"
                          >
                            <Clock className="w-3 h-3 mr-1" />
                            Acknowledge
                          </Button>
                        )}

                        {alert.status !== AlertStatus.RESOLVED && (
                          <Button
                            size="sm"
                            disabled={isPending}
                            onClick={() => handleOpenResolveModal(alert)}
                            className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <Check className="w-3 h-3 mr-1" />
                            Resolve
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Resolution Dialog Modal */}
      <Dialog open={!!resolvingAlert} onOpenChange={(open) => !open && setResolvingAlert(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Resolve Anomaly Alert
            </DialogTitle>
            <DialogDescription>
              Mark this anomaly as investigated and resolved. An optional resolution note documents site checks or meter validations.
            </DialogDescription>
          </DialogHeader>

          {resolvingAlert && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  {formatTypeLabel(resolvingAlert.type)} ({resolvingAlert.project.name})
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  {resolvingAlert.message}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Resolution Note (optional)
                </label>
                <Input
                  placeholder="e.g., Meter reading verified on site; no leaks found. Calibrated sensor."
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setResolvingAlert(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleConfirmResolve}
              disabled={isPending}
            >
              {isPending ? 'Resolving...' : 'Confirm Resolution'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
