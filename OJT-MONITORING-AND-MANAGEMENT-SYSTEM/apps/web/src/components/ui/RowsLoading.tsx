import { Skeleton } from '@/src/components/ui/Skeleton';

// Skeleton rows for a list/table area while its data loads.
export function RowsLoading({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}
