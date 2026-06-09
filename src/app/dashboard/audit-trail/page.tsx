"use client"

import React, { useState, useCallback, useEffect, useMemo } from "react"
import { useSession } from "next-auth/react"
import {
  Briefcase,
  FolderKanban,
  Users,
  GraduationCap,
  Settings,
  Search,
  Filter,
  Download,
  Activity,
  Clock,
  Shield,
  ChevronDown,
  RotateCcw,
  Loader2,
  FileText,
  Calendar,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import { AUDIT_DEPARTMENTS, ACTION_COLORS, STATUS_COLORS, DEPARTMENT_ICONS, DEPARTMENT_COLORS, type AuditDepartment } from "@/lib/audit-log"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import dynamic from "next/dynamic"

// Icons mapping
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Briefcase,
  FolderKanban,
  Users,
  GraduationCap,
  Settings,
}

interface AuditLogEntry {
  id: string
  userId: string
  userName: string
  userRole: string
  userDepartment: string | null
  department: string
  page: string
  action: string
  entityType: string | null
  entityId: string | null
  description: string
  oldValue: string | null
  newValue: string | null
  ipAddress: string | null
  userAgent: string | null
  status: string
  metadata: string | null
  createdAt: string
}

interface DeptCount {
  department: string
  count: number
}

interface StatsData {
  total: number
  todayCount: number
  departmentCounts: DeptCount[]
  actionCounts: { action: string; count: number }[]
  statusCounts: { status: string; count: number }[]
  recentActivity: { id: string; department: string; page: string; action: string; description: string; userName: string; createdAt: string }[]
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return "N/A"
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return "N/A"
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 60) return "just now"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return formatDateTime(dateStr)
}

export default function AuditTrailPage() {
  const { data: session, status: sessionStatus } = useSession()
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [stats, setStats] = useState<StatsData | null>(null)
  const [selectedDept, setSelectedDept] = useState<string>("")
  const [search, setSearch] = useState("")
  const [actionFilter, setActionFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "all">("30d")
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const userRole = session?.user?.role || "DEVELOPER"

  const isExportVisible = ["SUPER_ADMIN", "ADMIN"].includes(userRole)

  // Fetch stats
  useEffect(() => {
    if (sessionStatus === "loading") return
    if (!session) return
    const fetchStats = async () => {
      setStatsLoading(true)
      try {
        const res = await fetch("/api/audit-trail/stats", { credentials: "include" })
        if (res.ok) {
          const data = await res.json()
          setStats(data)
        }
      } catch (err) {
        console.error("Failed to fetch audit stats:", err)
      } finally {
        setStatsLoading(false)
      }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [session, sessionStatus])

  // Fetch logs
  const fetchLogs = useCallback(async (cursor?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedDept) params.set("department", selectedDept)
      if (search) params.set("search", search)
      if (actionFilter) params.set("action", actionFilter)
      if (statusFilter) params.set("status", statusFilter)
      if (cursor) params.set("cursor", cursor)
      params.set("limit", "50")

      const res = await fetch(`/api/audit-trail?${params.toString()}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        if (cursor) {
          setLogs(prev => [...prev, ...data.data])
        } else {
          setLogs(data.data)
        }
        setNextCursor(data.nextCursor)
        setHasMore(!!data.nextCursor)
        setTotal(data.total)
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err)
    } finally {
      setLoading(false)
    }
  }, [selectedDept, search, actionFilter, statusFilter])

  // Initial fetch when filters change (not cursor-based)
  useEffect(() => {
    setNextCursor(null)
    setLogs([])
    fetchLogs()
  }, [selectedDept, search, actionFilter, statusFilter, fetchLogs])

  const loadMore = () => {
    if (nextCursor) fetchLogs(nextCursor)
  }

  // Department counts from stats
  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    if (stats?.departmentCounts) {
      stats.departmentCounts.forEach(d => { counts[d.department] = d.count })
    }
    return counts
  }, [stats])

  // Stats cards
  const mostActiveDept = useMemo(() => {
    if (!stats?.departmentCounts?.length) return "—"
    return stats.departmentCounts[0]?.department || "—"
  }, [stats])

  const mostCommonAction = useMemo(() => {
    if (!stats?.actionCounts?.length) return "—"
    return stats.actionCounts[0]?.action || "—"
  }, [stats])

  const successRate = useMemo(() => {
    if (!stats?.statusCounts?.length) return "—"
    const success = stats.statusCounts.find(s => s.status === "SUCCESS")
    const failure = stats.statusCounts.find(s => s.status === "FAILURE")
    const total = (success?.count || 0) + (failure?.count || 0)
    if (total === 0) return "—"
    return `${Math.round(((success?.count || 0) / total) * 100)}%`
  }, [stats])

  // Date range filter for export
  const getDateRange = useCallback(() => {
    const now = new Date()
    switch (dateRange) {
      case "7d": return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
      case "90d": return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
      default: return ""
    }
  }, [dateRange])

  const exportCsv = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (selectedDept) params.set("department", selectedDept)
      if (actionFilter) params.set("action", actionFilter)
      const startDate = getDateRange()
      if (startDate) params.set("startDate", startDate)
      params.set("endDate", new Date().toISOString())

      const res = await fetch(`/api/audit-trail/export?${params.toString()}`, { credentials: "include" })
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `audit-trail-${new Date().toISOString().split("T")[0]}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error("Export failed:", err)
    } finally {
      setExporting(false)
    }
  }

  const exportPdf = async () => {
    setExportingPdf(true)
    try {
      const params = new URLSearchParams()
      if (selectedDept) params.set("department", selectedDept)
      if (actionFilter) params.set("action", actionFilter)
      const startDate = getDateRange()
      if (startDate) params.set("startDate", startDate)
      params.set("endDate", new Date().toISOString())

      const res = await fetch(`/api/audit-trail/export-pdf?${params.toString()}`, { credentials: "include" })
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `audit-trail-${new Date().toISOString().split("T")[0]}.pdf`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error("PDF export failed:", err)
    } finally {
      setExportingPdf(false)
    }
  }

  if (sessionStatus === "loading") return null

  if (!session) return null

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsLoading ? (
          <>
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Entries</p>
                <p className="text-2xl font-bold tabular-nums">{stats?.total?.toLocaleString() || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Today</p>
                <p className="text-2xl font-bold tabular-nums">{stats?.todayCount?.toLocaleString() || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Most Active Dept</p>
                <p className="text-2xl font-bold capitalize">{AUDIT_DEPARTMENTS[mostActiveDept as AuditDepartment]?.label || mostActiveDept}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Success Rate</p>
                <p className="text-2xl font-bold">{successRate}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Main Content */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Sidebar — Department Cards */}
        <div className="lg:w-64 shrink-0 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Departments
          </h3>

          {/* All Departments card */}
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-md border-2",
              !selectedDept && "border-primary/50 bg-primary/5"
            )}
            onClick={() => setSelectedDept("")}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                  <Activity className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold">All Departments</p>
                  <p className="text-xs text-muted-foreground">{stats?.total?.toLocaleString() || 0} entries</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {(Object.entries(AUDIT_DEPARTMENTS) as [string, { label: string; pages: string[] }][]).map(([key, dept]) => {
            const Icon = iconMap[DEPARTMENT_ICONS[key]] || Settings
            const count = deptCounts[key] || 0
            const isSelected = selectedDept === key
            return (
              <Card
                key={key}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md border-2",
                  isSelected && "border-primary/50 bg-primary/5"
                )}
                onClick={() => setSelectedDept(isSelected ? "" : key)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center shrink-0",
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{dept.label}</p>
                    <p className="text-xs text-muted-foreground">{count.toLocaleString()} entries</p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* Top Bar */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search audit logs..."
                    className="pl-10 h-10"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={actionFilter} onValueChange={setActionFilter}>
                    <SelectTrigger className="w-[140px] h-10">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CREATE">Create</SelectItem>
                      <SelectItem value="UPDATE">Update</SelectItem>
                      <SelectItem value="DELETE">Delete</SelectItem>
                      <SelectItem value="LOGIN">Login</SelectItem>
                      <SelectItem value="LOGOUT">Logout</SelectItem>
                      <SelectItem value="APPROVE">Approve</SelectItem>
                      <SelectItem value="REJECT">Reject</SelectItem>
                      <SelectItem value="EXPORT">Export</SelectItem>
                      <SelectItem value="SEND">Send</SelectItem>
                      <SelectItem value="ASSIGN">Assign</SelectItem>
                      <SelectItem value="STATUS_CHANGE">Status Change</SelectItem>
                      <SelectItem value="CONFIG_CHANGE">Config Change</SelectItem>
                      <SelectItem value="ACCESS">Access</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[120px] h-10">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All</SelectItem>
                      <SelectItem value="SUCCESS">Success</SelectItem>
                      <SelectItem value="FAILURE">Failure</SelectItem>
                    </SelectContent>
                  </Select>
                  {isExportVisible && (
                    <>
                      <Button variant="outline" size="sm" className="h-10" onClick={exportCsv} disabled={exporting}>
                        {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                        CSV
                      </Button>
                      <Button variant="default" size="sm" className="h-10 bg-primary" onClick={exportPdf} disabled={exportingPdf}>
                        {exportingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                        PDF Report
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results Info */}
          <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
            <span>
              {loading ? (
                "Loading..."
              ) : (
                <>
                  {total.toLocaleString()} entries found
                  {selectedDept && (
                    <> in <span className="font-medium text-foreground capitalize">{AUDIT_DEPARTMENTS[selectedDept as AuditDepartment]?.label}</span></>
                  )}
                </>
              )}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Updated just now
            </span>
          </div>

          {/* Audit Logs Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">Timestamp</TableHead>
                      <TableHead className="w-[160px]">User</TableHead>
                      <TableHead className="w-[100px]">Action</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-[80px]">Page</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && logs.length === 0 ? (
                      <>
                        {[...Array(10)].map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-[140px]" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-[140px]" /></TableCell>
                            <TableCell><Skeleton className="h-6 w-[70px]" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-[60px]" /></TableCell>
                            <TableCell><Skeleton className="h-6 w-[60px]" /></TableCell>
                          </TableRow>
                        ))}
                      </>
                    ) : logs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Activity className="h-8 w-8 opacity-20" />
                            <p className="text-sm">No audit logs found</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      logs.map((log) => (
                        <TableRow key={log.id} className="hover:bg-muted/50">
                          <TableCell className="text-xs">
                            <TooltipProvider>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">{formatRelativeTime(log.createdAt)}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{formatDateTime(log.createdAt)}</p>
                              </TooltipContent>
                            </TooltipProvider>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                                  {log.userName.split(" ").filter(Boolean).map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <p className="text-xs font-medium truncate max-w-[120px]">{log.userName}</p>
                                <p className="text-[10px] text-muted-foreground">{log.userRole.replace("_", " ")}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={cn("text-[10px] font-semibold", ACTION_COLORS[log.action] || ACTION_COLORS.CONFIG_CHANGE)}
                            >
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p className="text-xs truncate max-w-[300px] lg:max-w-[500px]" title={log.description}>
                              {log.description}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p className="text-xs text-muted-foreground truncate max-w-[70px]">{log.page}</p>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn("text-[10px]", STATUS_COLORS[log.status] || "")}
                            >
                              {log.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Load More */}
              {hasMore && (
                <div className="flex justify-center p-4 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMore}
                    disabled={loading}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ChevronDown className="h-4 w-4 mr-2" />
                    )}
                    Load More
                  </Button>
                </div>
              )}

              {/* No more data indicator */}
              {!hasMore && logs.length > 0 && (
                <div className="flex justify-center p-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    Showing {logs.length} of {total.toLocaleString()} entries
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
