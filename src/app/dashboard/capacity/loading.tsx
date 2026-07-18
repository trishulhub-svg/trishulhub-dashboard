import { Skeleton } from "@/components/ui/skeleton";

export default function CapacityLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-10 w-full max-w-lg" />
      <Skeleton className="h-80 rounded-lg" />
    </div>
  );
}
