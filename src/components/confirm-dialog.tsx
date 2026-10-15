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
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive' | 'warning';
  isLoading?: boolean;
  confirmDisabled?: boolean;
  closeOnConfirm?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
  confirmDisabled = false,
  closeOnConfirm = true,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-2.5">
            {variant === 'destructive' || variant === 'warning' ? (
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  variant === 'destructive'
                    ? 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400'
                    : 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400'
                }`}
              >
                <AlertTriangle className="w-5 h-5" />
              </div>
            ) : null}
            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white">
              {title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
            {description}
          </DialogDescription>
        </DialogHeader>
        {children && <div className="px-1">{children}</div>}
        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={isLoading}
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            disabled={isLoading || confirmDisabled}
            onClick={async () => {
              await onConfirm();
              if (closeOnConfirm) onOpenChange(false);
            }}
            className={
              variant === 'warning'
                ? 'bg-amber-600 hover:bg-amber-700 text-white rounded-xl'
                : 'rounded-xl'
            }
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
