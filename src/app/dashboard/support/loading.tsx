import { Skeleton } from "@/components/ui/skeleton";

export default function SupportLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-56" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
        <Skeleton className="h-[480px] rounded-lg" />
        <Skeleton className="h-[480px] rounded-lg" />
      </div>
    </div>
  );
}
