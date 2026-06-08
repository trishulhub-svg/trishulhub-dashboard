export default function PageLoading() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header skeleton */}
      <div>
        <div className="h-8 w-32 bg-muted/50 animate-pulse rounded-lg mb-2" />
        <div className="h-4 w-64 bg-muted/50 animate-pulse rounded" />
      </div>

      {/* Profile card skeleton */}
      <div className="rounded-xl border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-muted/50 animate-pulse" />
          <div className="h-5 w-24 bg-muted/50 animate-pulse rounded" />
        </div>
        <div className="h-4 w-48 bg-muted/50 animate-pulse rounded" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-10 w-full bg-muted/50 animate-pulse rounded-md" />
          <div className="h-10 w-full bg-muted/50 animate-pulse rounded-md" />
        </div>
        <div className="h-9 w-32 bg-muted/50 animate-pulse rounded-md" />
      </div>

      {/* Password card skeleton */}
      <div className="rounded-xl border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-muted/50 animate-pulse" />
          <div className="h-5 w-36 bg-muted/50 animate-pulse rounded" />
        </div>
        <div className="h-4 w-64 bg-muted/50 animate-pulse rounded" />
        <div className="space-y-3">
          <div className="h-10 w-full bg-muted/50 animate-pulse rounded-md" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-10 w-full bg-muted/50 animate-pulse rounded-md" />
            <div className="h-10 w-full bg-muted/50 animate-pulse rounded-md" />
          </div>
        </div>
      </div>

      {/* Theme card skeleton */}
      <div className="rounded-xl border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-muted/50 animate-pulse" />
          <div className="h-5 w-28 bg-muted/50 animate-pulse rounded" />
        </div>
        <div className="h-4 w-56 bg-muted/50 animate-pulse rounded" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 flex-1 bg-muted/50 animate-pulse rounded-md" />
          ))}
        </div>
      </div>

      {/* Notifications card skeleton */}
      <div className="rounded-xl border p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded bg-muted/50 animate-pulse" />
          <div className="h-5 w-48 bg-muted/50 animate-pulse rounded" />
        </div>
        <div className="h-4 w-52 bg-muted/50 animate-pulse rounded" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="h-4 w-36 bg-muted/50 animate-pulse rounded" />
                <div className="h-3 w-52 bg-muted/50 animate-pulse rounded" />
              </div>
              <div className="h-6 w-10 bg-muted/50 animate-pulse rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
