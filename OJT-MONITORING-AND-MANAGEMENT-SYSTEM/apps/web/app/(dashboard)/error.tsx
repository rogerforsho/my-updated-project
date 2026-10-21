'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, LayoutDashboard } from '@/src/components/ui/Icons';
import { Button } from '@/src/components/ui/Button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard Error:', error);
  }, [error]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto my-12 page-fade-in">
      <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm text-center flex flex-col items-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4 shadow-2xs">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
          Unable to Load Section
        </h2>

        <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
          An unexpected issue occurred while retrieving this section&apos;s data. You can retry loading the page or return to the overview.
        </p>

        {error.digest && (
          <p className="mt-2 font-mono text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
            Reference ID: {error.digest}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={() => reset()}
            variant="primary"
            size="sm"
            className="flex items-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </Button>

          <Link href="/dashboard">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Back to Overview</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
