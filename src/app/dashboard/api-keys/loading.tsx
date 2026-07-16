export default function PageLoading() {
  return (
    <div className="space-y-6 th-page-enter">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-40 bg-muted/50 animate-pulse rounded-lg" />
          <div className="h-4 w-64 bg-muted/50 animate-pulse rounded" />
        </div>
        <div className="h-9 w-28 bg-muted/50 animate-pulse rounded-lg" />
      </div>
      <div className="h-14 rounded-xl border border-border bg-muted/30 animate-pulse" />
      <div className="h-64 rounded-xl border border-border bg-muted/30 animate-pulse" />
    </div>
  );
}
