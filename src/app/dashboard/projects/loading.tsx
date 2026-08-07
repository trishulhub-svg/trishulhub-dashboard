import { Skeleton } from "@/components/ui/skeleton";

// L-PRJ-1 FIX: Replaced animate-pulse divs with shadcn/ui Skeleton component
// Updated skeleton to match list view layout (stats row, filter bar, list rows)
export default function PageLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      {/* Stats row skeleton */}
      <div className="flex flex-wrap gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-full" />
        ))}
      </div>
      {/* Filter bar skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-64" />
        <div className="flex gap-1.5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-lg" />
          ))}
        </div>
      </div>
      {/* List row placeholders */}
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
