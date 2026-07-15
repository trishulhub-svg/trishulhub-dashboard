export default function PageLoading() {
  return (
    <div className="space-y-6 th-page-enter">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-muted/50 animate-pulse rounded-lg" />
          <div className="h-4 w-72 bg-muted/40 animate-pulse rounded" />
        </div>
        <div className="h-9 w-24 bg-muted/50 animate-pulse rounded-lg" />
      </div>
      {/* Compact status strip */}
      <div className="h-12 bg-muted/40 animate-pulse rounded-xl" />
      {/* Timer hero */}
      <div className="h-48 sm:h-56 bg-muted/50 animate-pulse rounded-2xl" />
      {/* Entries */}
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
