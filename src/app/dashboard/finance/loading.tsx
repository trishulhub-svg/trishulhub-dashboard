export default function FinanceLoading() {
  return (
    <div className="p-6 space-y-6">
      {/* Stat cards - 4 columns */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
      {/* Filter bar */}
      <div className="h-10 bg-muted animate-pulse rounded-lg" />
      {/* Tab content skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
      <span className="sr-only">Loading finance dashboard...</span>
    </div>
  );
}
