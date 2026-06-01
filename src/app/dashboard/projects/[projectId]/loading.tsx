import { Skeleton } from "@/components/ui/skeleton";

// Premium loading skeleton — staggered card-enter + shimmer overlays
// Mirrors the actual page layout for zero-jank transition

const staggerDelay = (i: number) => ({ animationDelay: `${i * 80}ms`, animationFillMode: "both" as const });

export default function ProjectDetailLoading() {
  return (
    <div className="space-y-5" style={{ animation: "fade-in 0.4s ease-out both" }}>
      {/* ── Header row ── */}
      <div className="flex items-center gap-3" style={{ animation: "card-enter 0.5s ease-out both", animationDelay: "50ms" }}>
        <Skeleton className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5" />
        <div className="space-y-1.5 flex-1">
          <Skeleton className="h-6 w-56 rounded-md" />
          <Skeleton className="h-3.5 w-80 rounded-md" />
        </div>
      </div>

      {/* ── Stat pills row ── */}
      <div className="flex flex-wrap gap-2" style={staggerDelay(1)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-full" />
        ))}
      </div>

      {/* ── Section label ── */}
      <Skeleton className="h-5 w-40 rounded-md" style={staggerDelay(2)} />

      {/* ── Task column skeletons with shimmer ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-xl"
            style={staggerDelay(3 + i)}
          >
            {/* Glassmorphism card skeleton */}
            <div className="rounded-xl border border-gray-200/80 dark:border-gray-700/50 bg-gradient-to-b from-white/80 to-white/50 dark:from-gray-900/60 dark:to-gray-900/30 p-4 space-y-3">
              {/* Column header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2.5 w-2.5 rounded-full" />
                  <Skeleton className="h-4 w-24 rounded-md" />
                </div>
                <Skeleton className="h-5 w-6 rounded-full" />
              </div>
              {/* Column border */}
              <div className="border-t border-gray-200/50 dark:border-gray-700/40" />
              {/* Fake task cards */}
              {[0, 1].map((j) => (
                <div key={j} className="relative overflow-hidden rounded-lg p-3 bg-white/60 dark:bg-white/[0.04]">
                  <div className="space-y-2">
                    <Skeleton className="h-3.5 w-full rounded" />
                    <Skeleton className="h-3 w-3/4 rounded" />
                    <div className="flex gap-1.5 pt-1">
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-5 w-12 rounded-full" />
                    </div>
                  </div>
                  {/* Shimmer overlay */}
                  <div
                    className="absolute inset-0 -translate-x-full"
                    style={{
                      animation: "shimmer 2s ease-in-out infinite",
                      animationDelay: `${(i * 150) + (j * 100)}ms`,
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)",
                    }}
                  />
                </div>
              ))}
              {/* Add task placeholder */}
              <Skeleton className="h-8 w-full rounded-lg opacity-40" />
            </div>
            {/* Card-level shimmer */}
            <div
              className="absolute inset-0 pointer-events-none -translate-x-full"
              style={{
                animation: "shimmer 2.5s ease-in-out infinite",
                animationDelay: `${i * 200}ms`,
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)",
              }}
            />
          </div>
        ))}
      </div>

      {/* ── Loading progress indicator ── */}
      <div
        className="flex items-center justify-center gap-2 py-4"
        style={{ animation: "fade-in 0.6s ease-out both", animationDelay: "600ms" }}
      >
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-primary"
              style={{
                animation: "loading-dot-pulse 1.2s ease-in-out infinite",
                animationDelay: `${i * 180}ms`,
              }}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground/60 font-medium">Loading project details…</span>
      </div>
    </div>
  );
}
