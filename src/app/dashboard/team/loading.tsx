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

      {/* Tab buttons skeleton */}
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-28 bg-muted/50 animate-pulse rounded-lg" />
        ))}
      </div>

      {/* Team table skeleton: cards in 2-col grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 animate-pulse">
            {/* Avatar */}
            <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
            {/* Text lines */}
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              <div className="h-3 w-48 bg-muted animate-pulse rounded" />
            </div>
            {/* Badge placeholders */}
            <div className="flex gap-2">
              <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
              <div className="h-5 w-14 bg-muted animate-pulse rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
