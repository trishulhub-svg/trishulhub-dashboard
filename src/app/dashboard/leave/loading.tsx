export default function LeaveLoading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh] p-8">
      <div className="max-w-md w-full rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-6 text-center">
        <div className="h-6 w-48 mx-auto mb-4 animate-pulse rounded bg-yellow-500/30" />
        <div className="h-4 w-72 mx-auto animate-pulse rounded bg-yellow-500/20" />
      </div>
    </div>
  );
}
