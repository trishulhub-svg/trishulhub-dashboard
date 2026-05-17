import { Skeleton } from "@/components/ui/skeleton";

// L-PRJ-1 FIX: Replaced animate-pulse divs with shadcn/ui Skeleton component
export default function ProjectDetailLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-32 rounded-lg" />
      <div className="flex gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-64 w-[260px] rounded-lg shrink-0" />
        ))}
      </div>
    </div>
  );
}
