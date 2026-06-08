import { Skeleton } from "@/components/ui/skeleton";

export default function CredentialsLoading() {
  return (
    <div className="space-y-4 p-6">
      <span className="sr-only">Loading credentials...</span>
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
