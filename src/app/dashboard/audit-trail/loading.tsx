import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

export default function AuditTrailLoading() {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Sidebar */}
        <div className="lg:w-64 shrink-0 space-y-3">
          <Skeleton className="h-7 w-40" />
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Area */}
        <div className="flex-1 min-w-0 space-y-4">
          <Card>
            <CardContent className="p-4">
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>

          <div className="flex items-center justify-between px-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 border-b last:border-0">
                    <Skeleton className="h-4 w-[140px]" />
                    <Skeleton className="h-4 w-[140px]" />
                    <Skeleton className="h-6 w-[70px]" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-[60px]" />
                    <Skeleton className="h-6 w-[60px]" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
