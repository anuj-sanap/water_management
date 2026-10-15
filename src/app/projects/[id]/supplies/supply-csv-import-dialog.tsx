'use client';

import { useRef, useState } from 'react';
import { AlertCircle, Download, FileUp, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { importSupplyRecordsAction } from '@/app/actions/water-actions';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { supplyImportRowSchema } from '@/lib/supply-validation';

interface SupplyImportDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface PreviewRow {
  rowNumber: number;
  raw: Record<string, string>;
  errors: string[];
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(cell.replace(/\r$/, ''));
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[ _-]+/g, ' ');
}

function mapCsvRow(headers: string[], cells: string[]): Record<string, string> {
  const values = new Map(headers.map((header, index) => [normalizeHeader(header), cells[index]?.trim() ?? '']));
  const unit = (values.get('unit') ?? '').toLocaleLowerCase();
  return {
    date: values.get('date') ?? '',
    source: (values.get('source') ?? '').toLocaleUpperCase(),
    enteredVolume: values.get('volume') ?? '',
    enteredUnit: unit === 'm3' || unit === 'm³' ? 'M3' : unit === 'l' ? 'L' : unit.toLocaleUpperCase(),
    supplier: values.get('supplier') ?? '',
    referenceNo: values.get('reference no.') ?? values.get('reference no') ?? '',
    notes: values.get('notes') ?? '',
  };
}

export function SupplyImportDialog({
  projectId,
  open,
  onOpenChange,
  onImported,
}: SupplyImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const downloadTemplate = () => {
    const blob = new Blob(['Date,Source,Volume,Unit,Supplier,Reference No,Notes\r\n'], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'water-supplies-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file?: File) => {
    setRows([]);
    setFileError('');
    setFileName('');
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith('.csv')) {
      setFileError('Choose a .csv file.');
      return;
    }
    if (file.size > 512 * 1024) {
      setFileError('CSV must be smaller than 512 KB.');
      return;
    }

    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) throw new Error('Add at least one data row below the header.');
      const headers = parsed[0].map((header) => header.trim());
      const normalizedHeaders = headers.map(normalizeHeader);
      const required = ['date', 'source', 'volume', 'unit'];
      const missing = required.filter((header) => !normalizedHeaders.includes(header));
      if (missing.length > 0) throw new Error(`Missing required columns: ${missing.join(', ')}.`);
      if (parsed.length - 1 > 200) throw new Error('Import no more than 200 data rows at a time.');

      const previewRows = parsed.slice(1).map((cells, index) => {
        const raw = mapCsvRow(headers, cells);
        const validation = supplyImportRowSchema.safeParse(raw);
        return {
          rowNumber: index + 2,
          raw,
          errors: validation.success ? [] : validation.error.issues.map((issue) => issue.message),
        };
      });
      setRows(previewRows);
      setFileName(file.name);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Could not read this CSV file.');
    }
  };

  const importRows = async () => {
    setIsImporting(true);
    try {
      const result = await importSupplyRecordsAction(projectId, rows.map((row) => row.raw));
      if (!result.success) {
        toast.error('The CSV could not be imported.');
        return;
      }
      const errorCount = Object.keys(result.errors).length;
      if (result.imported === 0) {
        toast.error('No valid rows were imported. Review the row errors.');
        setRows((current) =>
          current.map((row, index) => ({
            ...row,
            errors: result.errors[index + 1] ?? row.errors,
          }))
        );
        return;
      }
      toast.success(`${result.imported} supply ${result.imported === 1 ? 'record' : 'records'} imported.`);
      if (errorCount > 0) toast.warning(`${errorCount} invalid ${errorCount === 1 ? 'row was' : 'rows were'} skipped.`);
      onImported();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not import the CSV.');
    } finally {
      setIsImporting(false);
    }
  };

  const validRowCount = rows.filter((row) => row.errors.length === 0).length;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isImporting) {
          onOpenChange(nextOpen);
          if (!nextOpen) {
            setRows([]);
            setFileError('');
            setFileName('');
            if (inputRef.current) inputRef.current.value = '';
          }
        }
      }}
      title="Import supply records"
      description="Preview your CSV and import every valid row. Invalid rows are skipped and listed below."
      confirmLabel={isImporting ? 'Importing…' : `Import ${validRowCount} valid rows`}
      confirmDisabled={validRowCount === 0}
      closeOnConfirm={false}
      isLoading={isImporting}
      onConfirm={importRows}
    >
      <div className="max-h-[65vh] space-y-4 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-white">Choose a CSV file</p>
            <p className="text-xs text-slate-500">{fileName || 'CSV only, up to 200 rows and 512 KB.'}</p>
          </div>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Choose CSV file"
              onChange={(event) => { void handleFile(event.target.files?.[0]); }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <FileUp />Choose file
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={downloadTemplate}>
              <Download />Template
            </Button>
          </div>
        </div>
        {fileError && (
          <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />{fileError}
          </p>
        )}
        <p className="text-xs text-slate-500">
          Required columns: Date (YYYY-MM-DD), Source (TANKER, MUNICIPAL, BOREWELL, STORAGE_TRANSFER, OTHER), Volume, Unit (M3 or L). Supplier, Reference No, and Notes are optional.
        </p>
        {rows.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <span>Preview</span>
              <span>{validRowCount} valid · {rows.length - validRowCount} with errors</span>
            </div>
            <div className="max-h-56 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-white dark:bg-slate-900">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Volume</th>
                    <th className="px-3 py-2">Supplier / reference</th>
                    <th className="px-3 py-2">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.rowNumber} className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800">
                      <td className="px-3 py-2">{row.rowNumber}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.raw.date}</td>
                      <td className="px-3 py-2">{row.raw.source}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.raw.enteredVolume} {row.raw.enteredUnit}</td>
                      <td className="max-w-40 truncate px-3 py-2">{row.raw.supplier || row.raw.referenceNo || '—'}</td>
                      <td className="min-w-48 px-3 py-2">
                        {row.errors.length === 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400">Ready to import</span>
                        ) : (
                          <ul className="list-inside list-disc text-destructive">
                            {row.errors.map((error, index) => <li key={`${row.rowNumber}-${index}`}>{error}</li>)}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {isImporting && <LoaderCircle className="mx-auto size-5 animate-spin text-sky-600" />}
      </div>
    </ConfirmDialog>
  );
}
