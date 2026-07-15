export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Stat cards - 4 in a row matching the dashboard grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 rounded-xl border border-border/60 bg-primary/[0.04] animate-pulse"
          />
        ))}
      </div>
      {/* Full-width projects card */}
      <div className="grid gap-4">
        <div className="h-64 rounded-xl border border-border/60 bg-primary/[0.04] animate-pulse" />
      </div>
      {/* Bottom cards - 2 columns */}
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-64 rounded-xl border border-border/60 bg-primary/[0.04] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
