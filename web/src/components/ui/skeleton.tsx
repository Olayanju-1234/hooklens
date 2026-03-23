"use client";

export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-bg-tertiary rounded ${className ?? ""}`} />;
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="border border-border-primary rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 px-4 py-2.5 bg-bg-secondary border-b border-border-primary">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1 max-w-[120px]" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex gap-4 px-4 py-3 border-b border-border-primary last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-3 flex-1 max-w-[140px]" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="px-4 sm:px-5 py-4 rounded-xl bg-bg-secondary border border-border-primary space-y-3">
      <div className="flex items-center gap-2.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
      <Skeleton className="h-3 w-48" />
    </div>
  );
}

export function StatSkeleton() {
  return (
    <div className="px-4 py-4 rounded-xl bg-bg-secondary border border-border-primary">
      <Skeleton className="h-2.5 w-20 mb-3" />
      <Skeleton className="h-7 w-16" />
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-bg-secondary border border-border-primary"
        >
          <Skeleton className="h-5 w-12 rounded-md" />
          <Skeleton className="h-4 w-32" />
          <div className="flex-1" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}
