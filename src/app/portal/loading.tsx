export default function PortalLoading() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-muted/50 animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-muted/50 animate-pulse" />
    </div>
  );
}
