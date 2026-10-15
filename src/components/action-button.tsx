'use client';

import React from 'react';
import { Role } from '@prisma/client';
import { AUDITOR_DISABLED_TOOLTIP } from '@/lib/rbac';
import Link from 'next/link';

interface ActionButtonProps {
  userRole: Role;
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  disabledReason?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ActionButton({
  userRole,
  href,
  onClick,
  children,
  className = '',
  variant = 'primary',
  disabled = false,
  disabledReason,
  size = 'md',
}: ActionButtonProps) {
  const isAuditor = userRole === 'AUDITOR';
  const effectiveDisabled = disabled || isAuditor;
  const tooltipText = isAuditor ? AUDITOR_DISABLED_TOOLTIP : disabledReason;

  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-xl transition-all cursor-pointer select-none';

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2.5',
  }[size];

  const variantStyles = {
    primary:
      'bg-sky-600 hover:bg-sky-500 text-white shadow-xs hover:shadow-md disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500',
    secondary:
      'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700',
    danger:
      'bg-rose-600 hover:bg-rose-500 text-white shadow-xs disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500',
    ghost:
      'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300',
  }[variant];

  if (effectiveDisabled) {
    return (
      <div className="relative group inline-block">
        <button
          type="button"
          disabled
          className={`${baseStyles} ${sizeStyles} ${variantStyles} opacity-50 cursor-not-allowed ${className}`}
        >
          {children}
        </button>
        {tooltipText && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex items-center px-2.5 py-1 rounded-md bg-slate-900 text-white text-xs font-medium whitespace-nowrap shadow-lg z-50 pointer-events-none">
            {tooltipText}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900" />
          </div>
        )}
      </div>
    );
  }

  if (href) {
    return (
      <Link href={href} className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}>
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
    >
      {children}
    </button>
  );
}
