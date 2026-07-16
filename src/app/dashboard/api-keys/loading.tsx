export default function PageLoading() {
  return (
    <div className="space-y-6 th-page-enter">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-36 bg-muted/50 animate-pulse rounded-lg" />
          <div className="h-4 w-52 bg-muted/50 animate-pulse rounded" />
        </div>
        <div className="h-9 w-28 bg-muted/50 animate-pulse rounded-lg" />
      </div>
      <div className="h-9 rounded-lg border border-border/60 bg-muted/20 animate-pulse" />
      <div className="space-y-3">
        <div className="h-16 rounded-xl border border-border bg-muted/30 animate-pulse" />
        <div className="h-16 rounded-xl border border-border bg-muted/30 animate-pulse" />
        <div className="h-16 rounded-xl border border-border bg-muted/30 animate-pulse" />
      </div>
    </div>
  );
}
