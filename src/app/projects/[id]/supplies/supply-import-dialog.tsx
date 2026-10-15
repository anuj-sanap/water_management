'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { importSupplyRecordsAction } from '@/app/actions/water-actions';
import { FileUp, AlertCircle } from 'lucide-react';

interface SupplyImportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function SupplyImportDialog({
  projectId,
  open,
  onOpenChange,
  onImported,
}: SupplyImportDialogProps) {
  const [csvText, setCsvText] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<number, string[]> | null>(null);

  const sampleCsv = `date,source,enteredVolume,enteredUnit,supplier,referenceNo,notes
2026-10-10,TANKER,12.5,M3,Metro Water Tankers,TK-4921,Initial foundation supply
2026-10-11,MUNICIPAL,5000,L,Municipal Board,MB-8812,Pipelined municipal source`;

  function parseCsv(text: string) {
    const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) return [];

    const headers = lines[0].split(',').map((h) => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const rowObj: Record<string, string | number | undefined> = {};

      headers.forEach((h, idx) => {
        const val = values[idx];
        if (h === 'enteredVolume') {
          rowObj[h] = Number.parseFloat(val ?? '');
        } else {
          rowObj[h] = val || undefined;
        }
      });

      rows.push(rowObj);
    }

    return rows;
  }

  async function handleImport() {
    if (!csvText.trim()) {
      toast.error('Please enter or paste CSV supply data.');
      return;
    }

    try {
      setIsLoading(true);
      setErrors(null);
      const rows = parseCsv(csvText);

      if (rows.length === 0) {
        toast.error('No valid rows found in CSV data.');
        return;
      }

      const res = await importSupplyRecordsAction(projectId, rows);

      if (!res.success) {
        setErrors(res.errors as Record<number, string[]>);
        toast.error('Import failed. Please check validation errors below.');
        return;
      }

      const errCount = Object.keys(res.errors || {}).length;
      if (errCount > 0) {
        setErrors(res.errors as Record<number, string[]>);
        toast.warning(`Imported ${res.imported} records with ${errCount} row errors.`);
      } else {
        toast.success(`Successfully imported ${res.imported} water supply records.`);
        setCsvText('');
        onOpenChange(false);
      }

      onImported();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <FileUp className="w-4 h-4" />
            </div>
            <DialogTitle className="text-base font-bold text-slate-900 dark:text-white">
              Bulk Import Water Supplies
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Paste CSV formatted delivery records (up to 200 rows).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Format: date,source,enteredVolume,enteredUnit,supplier,referenceNo,notes</span>
            <button
              type="button"
              onClick={() => setCsvText(sampleCsv)}
              className="text-sky-600 hover:text-sky-700 font-semibold"
            >
              Fill Sample Data
            </button>
          </div>

          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={8}
            placeholder={sampleCsv}
            className="w-full font-mono text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-sky-500"
          />

          {errors && Object.keys(errors).length > 0 && (
            <div className="max-h-36 overflow-y-auto p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                <span>Row Errors Encountered:</span>
              </div>
              {Object.entries(errors).map(([rowNum, msgs]) => (
                <div key={rowNum} className="pl-5 text-[11px]">
                  <strong>Row {rowNum}:</strong> {msgs.join(', ')}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button
            type="button"
            variant="outline"
            disabled={isLoading}
            onClick={() => onOpenChange(false)}
            className="rounded-xl text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isLoading}
            onClick={handleImport}
            className="rounded-xl text-xs bg-sky-600 hover:bg-sky-500 text-white"
          >
            {isLoading ? 'Importing Records...' : 'Import Supplies'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
