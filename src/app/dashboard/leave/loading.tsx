export default function LeaveLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-6 w-32 animate-pulse rounded bg-muted/50" />
        <div className="h-9 w-36 animate-pulse rounded bg-muted/50" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />
        ))}
      </div>
    </div>
  );
}
