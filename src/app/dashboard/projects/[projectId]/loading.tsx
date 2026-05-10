export default function ProjectDetailLoading() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-48 bg-muted animate-pulse rounded" />
      <div className="h-32 bg-muted animate-pulse rounded-lg" />
      <div className="flex gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-64 w-[260px] bg-muted animate-pulse rounded-lg shrink-0" />
        ))}
      </div>
    </div>
  );
}
