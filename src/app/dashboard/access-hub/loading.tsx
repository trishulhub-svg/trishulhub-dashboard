import { Skeleton } from "@/components/ui/skeleton";

export default function AccessHubLoading() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto px-1 sm:px-0">
      <span className="sr-only">Loading Access Hub...</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-10 w-80" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
