export default function PageLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-muted/50 animate-pulse rounded-lg" />
          <div className="h-4 w-72 bg-muted/50 animate-pulse rounded" />
        </div>
        <div className="h-10 w-36 bg-muted/50 animate-pulse rounded-lg" />
      </div>
      {/* Stats skeleton */}
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
      {/* Content skeleton */}
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
