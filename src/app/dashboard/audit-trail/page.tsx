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
  AlertTriangle,
  Calendar,
  ArrowRightLeft,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  XCircle,
  MinusCircle,
  RefreshCw,
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
  userName: string | null
  userRole: string | null
  userDepartment: string | null
  department: string
  page: string
  action: string | null
  entityType: string | null
  entityId: string | null
  description: string | null
  oldValue: string | null
  newValue: string | null
  ipAddress: string | null
  userAgent: string | null
  status: string | null
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

// ── Lark Sync Log types ──
interface LarkSyncLogEntry {
  id: string
  direction: string
  action: string
  status: string
  taskId: string | null
  larkTaskId: string | null
  larkTaskListId: string | null
  projectId: string | null
  userId: string | null
  error: string | null
  metadata: string | null
  createdAt: string
}

function formatRelativeTime(dateStr: string | null | undefined): string {
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

/** Safe helper: extract initials from a potentially null user name */
function getInitials(userName: string | null | undefined): string {
  if (!userName) return "?"
  return userName.split(" ").filter(Boolean).map(n => n[0] || "").join("").toUpperCase().slice(0, 2) || "?"
}

/** Safe helper: format role for display */
function formatRole(role: string | null | undefined): string {
  if (!role) return "—"
  return role.replace(/_/g, " ")
}

/** Badge color for Lark sync direction */
function directionBadge(direction: string): string {
  if (direction === "TO_LARK") return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
  if (direction === "FROM_LARK") return "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400"
  return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
}

/** Badge color for Lark sync status */
function syncStatusBadge(status: string): string {
  if (status === "SUCCESS") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
  if (status === "FAILED") return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
  if (status === "SKIPPED") return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
  return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
}

/** Icon for Lark sync status */
function SyncStatusIcon({ status }: { status: string }) {
  if (status === "SUCCESS") return <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
  if (status === "FAILED") return <XCircle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
  return <MinusCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
}

/** Icon for Lark sync direction */
function DirectionIcon({ direction }: { direction: string }) {
  if (direction === "TO_LARK") return <ArrowRight className="h-3 w-3" />
  if (direction === "FROM_LARK") return <ArrowLeft className="h-3 w-3" />
  return <ArrowRightLeft className="h-3 w-3" />
}

/**
 * Local error boundary for the Audit Trail page.
 * Catches render-time errors so they show a useful message
 * instead of the generic DashboardError boundary.
 */
class AuditTrailErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[AuditTrailErrorBoundary]", error.message, info.componentStack)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[40vh] flex items-center justify-center p-6">
          <Card className="max-w-md w-full border-red-200 dark:border-red-900/50">
            <CardContent className="p-6 space-y-4">
              <div className="flex justify-center">
                <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
                </div>
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-lg font-bold">Audit Trail Error</h2>
                <p className="text-sm text-muted-foreground">
                  Something went wrong loading the audit trail. This is likely a data or rendering issue.
                </p>
                <details className="text-left">
                  <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    Error details
                  </summary>
                  <pre className="mt-2 text-xs bg-muted p-3 rounded-md overflow-auto max-h-32 text-red-600 dark:text-red-400">
                    {this.state.error?.message || "Unknown error"}
                  </pre>
                </details>
              </div>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => this.setState({ hasError: false, error: null })}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }
    return this.props.children
  }
}

export default function AuditTrailPage() {
  const { data: session, status: sessionStatus } = useSession()
  const [activeView, setActiveView] = useState<"audit" | "lark-sync">("audit")

  // ── Audit Trail State ──
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [stats, setStats] = useState<StatsData | null>(null)
  const [selectedDept, setSelectedDept] = useState<string>("")
  const [search, setSearch] = useState("")
  const [actionFilter, setActionFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("ALL")
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "all">("30d")
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const userRole = session?.user?.role || "DEVELOPER"

  const isExportVisible = ["SUPER_ADMIN", "ADMIN"].includes(userRole)
  const isAdmin = ["SUPER_ADMIN", "ADMIN"].includes(userRole)

  // ── Lark Sync State ──
  const [syncLogs, setSyncLogs] = useState<LarkSyncLogEntry[]>([])
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncDirectionFilter, setSyncDirectionFilter] = useState<string>("")
  const [syncStatusFilter, setSyncStatusFilter] = useState<string>("")
  const [larkEnabled, setLarkEnabled] = useState(false)

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
        } else {
          console.error("[audit-trail] Stats API returned:", res.status)
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

  // Date range filter helper (used by fetchLogs and export)
  const getDateRange = useCallback(() => {
    const now = new Date()
    switch (dateRange) {
      case "7d": return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
      case "90d": return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
      default: return ""
    }
  }, [dateRange])

  // Fetch audit logs
  const fetchLogs = useCallback(async (cursor?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (selectedDept) params.set("department", selectedDept)
      if (search) params.set("search", search)
      if (actionFilter) params.set("action", actionFilter)
      if (statusFilter && statusFilter !== "ALL") params.set("status", statusFilter)
      if (cursor) params.set("cursor", cursor)
      const startDate = getDateRange()
      if (startDate) params.set("startDate", startDate)
      params.set("limit", "50")

      const res = await fetch(`/api/audit-trail?${params.toString()}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        const items: AuditLogEntry[] = Array.isArray(data?.data) ? data.data : []
        if (cursor) {
          setLogs(prev => [...prev, ...items])
        } else {
          setLogs(items)
        }
        setNextCursor(data?.nextCursor ?? null)
        setHasMore(!!data?.nextCursor)
        setTotal(typeof data?.total === "number" ? data.total : 0)
      } else {
        setError(`Failed to load logs (HTTP ${res.status})`)
      }
    } catch (err) {
      setError("Network error — check your connection and try again.")
      console.error("Failed to fetch audit logs:", err)
    } finally {
      setLoading(false)
    }
  }, [selectedDept, search, actionFilter, statusFilter, getDateRange])

  // Initial fetch when filters change (not cursor-based)
  useEffect(() => {
    setNextCursor(null)
    setLogs([])
    fetchLogs()
  }, [selectedDept, search, actionFilter, statusFilter, dateRange, fetchLogs])

  const loadMore = () => {
    if (nextCursor) fetchLogs(nextCursor)
  }

  // ── Fetch Lark Sync Logs ──
  const fetchSyncLogs = useCallback(async () => {
    setSyncLoading(true)
    setSyncError(null)
    try {
      const params = new URLSearchParams()
      params.set("limit", "100")
      if (syncDirectionFilter) params.set("direction", syncDirectionFilter)
      if (syncStatusFilter) params.set("status", syncStatusFilter)

      const res = await fetch(`/api/lark/sync?${params.toString()}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        const items: LarkSyncLogEntry[] = Array.isArray(data?.logs) ? data.logs : []
        setSyncLogs(items)
        setLarkEnabled(data?.config?.enabled === true)
      } else if (res.status === 403) {
        setSyncLogs([])
        setSyncError("Admin access required to view Lark sync logs")
      } else {
        setSyncError(`Failed to load sync logs (HTTP ${res.status})`)
      }
    } catch (err) {
      setSyncError("Network error loading Lark sync logs")
      console.error("Failed to fetch Lark sync logs:", err)
    } finally {
      setSyncLoading(false)
    }
  }, [syncDirectionFilter, syncStatusFilter])

  // Fetch sync logs when switching to lark-sync tab or filters change
  useEffect(() => {
    if (activeView === "lark-sync" && isAdmin) {
      fetchSyncLogs()
    }
  }, [activeView, fetchSyncLogs, isAdmin])

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
    if (!stats?.departmentCounts?.length) return ""
    return stats.departmentCounts[0]?.department || ""
  }, [stats])

  const successRate = useMemo(() => {
    if (!stats?.statusCounts?.length) return "—"
    const success = stats.statusCounts.find(s => s.status === "SUCCESS")
    const failure = stats.statusCounts.find(s => s.status === "FAILURE")
    const total = (success?.count || 0) + (failure?.count || 0)
    if (total === 0) return "—"
    return `${Math.round(((success?.count || 0) / total) * 100)}%`
  }, [stats])

  // ── Lark Sync summary stats ──
  const syncStats = useMemo(() => {
    const total = syncLogs.length
    const success = syncLogs.filter(l => l.status === "SUCCESS").length
    const failed = syncLogs.filter(l => l.status === "FAILED").length
    const toLark = syncLogs.filter(l => l.direction === "TO_LARK").length
    const fromLark = syncLogs.filter(l => l.direction === "FROM_LARK").length
    return { total, success, failed, toLark, fromLark }
  }, [syncLogs])

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
    <AuditTrailErrorBoundary>
    <TooltipProvider>
    <div className="space-y-6">
      {/* View Toggle Tabs */}
      <div className="flex items-center gap-3">
        <div className="flex bg-muted rounded-lg p-1">
          <button
            onClick={() => setActiveView("audit")}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2",
              activeView === "audit"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Shield className="h-4 w-4" />
            Audit Logs
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveView("lark-sync")}
              className={cn(
                "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2",
                activeView === "lark-sync"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ArrowRightLeft className="h-4 w-4" />
              Lark Sync
              {!larkEnabled && activeView !== "lark-sync" && (
                <span className="h-2 w-2 rounded-full bg-amber-400" />
              )}
            </button>
          )}
        </div>
        {activeView === "lark-sync" && (
          <Badge variant={larkEnabled ? "default" : "secondary"} className="text-xs">
            {larkEnabled ? (
              <><CheckCircle2 className="h-3 w-3 mr-1" /> Sync Active</>
            ) : (
              <><XCircle className="h-3 w-3 mr-1" /> Sync Inactive</>
            )}
          </Badge>
        )}
      </div>

      {/* ═══════════════ AUDIT LOGS VIEW ═══════════════ */}
      {activeView === "audit" && (
        <>
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
                    <p className="text-2xl font-bold tabular-nums">{(stats?.total ?? 0).toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Today</p>
                    <p className="text-2xl font-bold tabular-nums">{(stats?.todayCount ?? 0).toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Most Active Dept</p>
                    <p className="text-2xl font-bold capitalize">{mostActiveDept ? (AUDIT_DEPARTMENTS[mostActiveDept as AuditDepartment]?.label || mostActiveDept) : "—"}</p>
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
                      <p className="text-xs text-muted-foreground">{(stats?.total ?? 0).toLocaleString()} entries</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {Object.entries(AUDIT_DEPARTMENTS).map(([key, dept]) => {
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
                          <SelectItem value="ALL">All</SelectItem>
                          <SelectItem value="SUCCESS">Success</SelectItem>
                          <SelectItem value="FAILURE">Failure</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
                        <SelectTrigger className="w-[100px] h-10">
                          <Calendar className="h-4 w-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7d">7 days</SelectItem>
                          <SelectItem value="30d">30 days</SelectItem>
                          <SelectItem value="90d">90 days</SelectItem>
                          <SelectItem value="all">All time</SelectItem>
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

              {/* Error Display */}
              {error && (
                <Card className="border-red-200 dark:border-red-900/50">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-600 dark:text-red-400">Error loading audit logs</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => fetchLogs()}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Retry
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Results Info */}
              <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
                <span>
                  {loading ? (
                    "Loading..."
                  ) : (
                    <>
                      {total.toLocaleString()} entries found
                      {selectedDept && (
                        <> in <span className="font-medium text-foreground capitalize">{AUDIT_DEPARTMENTS[selectedDept as AuditDepartment]?.label || selectedDept}</span></>
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
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help">{formatRelativeTime(log.createdAt)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">{formatDateTime(log.createdAt)}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Avatar className="h-7 w-7">
                                    <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                                      {getInitials(log.userName)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium truncate max-w-[120px]">{log.userName || "Unknown"}</p>
                                    <p className="text-[10px] text-muted-foreground">{formatRole(log.userRole)}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  className={cn("text-[10px] font-semibold", ACTION_COLORS[log.action || ""] || ACTION_COLORS.CONFIG_CHANGE)}
                                >
                                  {log.action || "—"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <p className="text-xs truncate max-w-[300px] lg:max-w-[500px]" title={log.description || undefined}>
                                  {log.description || "—"}
                                </p>
                              </TableCell>
                              <TableCell>
                                <p className="text-xs text-muted-foreground truncate max-w-[70px]">{log.page || "—"}</p>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px]", STATUS_COLORS[log.status || ""] || "")}
                                >
                                  {log.status || "—"}
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
        </>
      )}

      {/* ═══════════════ LARK SYNC VIEW ═══════════════ */}
      {activeView === "lark-sync" && isAdmin && (
        <div className="space-y-6">
          {/* Lark Sync Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {syncLoading ? (
              <>
                {[...Array(5)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <Skeleton className="h-4 w-20 mb-2" />
                      <Skeleton className="h-8 w-12" />
                    </CardContent>
                  </Card>
                ))}
              </>
            ) : (
              <>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Syncs</p>
                    <p className="text-2xl font-bold tabular-nums">{syncStats.total.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">Successful</p>
                    <p className="text-2xl font-bold tabular-nums text-green-700 dark:text-green-400">{syncStats.success}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">Failed</p>
                    <p className="text-2xl font-bold tabular-nums text-red-700 dark:text-red-400">{syncStats.failed}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">To Lark</p>
                    <div className="flex items-center gap-1.5">
                      <ArrowRight className="h-4 w-4 text-blue-500" />
                      <p className="text-2xl font-bold tabular-nums">{syncStats.toLark}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wide">From Lark</p>
                    <div className="flex items-center gap-1.5">
                      <ArrowLeft className="h-4 w-4 text-violet-500" />
                      <p className="text-2xl font-bold tabular-nums">{syncStats.fromLark}</p>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Sync Logs Section */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Sync Operations</CardTitle>
                  <Badge variant="outline" className="text-xs font-mono">
                    LarkSyncLog
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={syncDirectionFilter} onValueChange={(v) => setSyncDirectionFilter(v === "ALL" ? "" : v)}>
                    <SelectTrigger className="w-[140px] h-9 text-xs">
                      <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                      <SelectValue placeholder="Direction" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Directions</SelectItem>
                      <SelectItem value="TO_LARK">To Lark</SelectItem>
                      <SelectItem value="FROM_LARK">From Lark</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={syncStatusFilter} onValueChange={(v) => setSyncStatusFilter(v === "ALL" ? "" : v)}>
                    <SelectTrigger className="w-[120px] h-9 text-xs">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Status</SelectItem>
                      <SelectItem value="SUCCESS">Success</SelectItem>
                      <SelectItem value="FAILED">Failed</SelectItem>
                      <SelectItem value="SKIPPED">Skipped</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="h-9" onClick={fetchSyncLogs} disabled={syncLoading}>
                    <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncLoading && "animate-spin")} />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Error Display */}
              {syncError && (
                <div className="p-4 border-b border-red-200 dark:border-red-900/50 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">{syncError}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchSyncLogs}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Retry
                  </Button>
                </div>
              )}

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">Time</TableHead>
                      <TableHead className="w-[90px]">Direction</TableHead>
                      <TableHead className="w-[80px]">Action</TableHead>
                      <TableHead className="w-[80px]">Status</TableHead>
                      <TableHead>Task ID</TableHead>
                      <TableHead>Lark Task ID</TableHead>
                      <TableHead className="max-w-[200px]">Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncLoading && syncLogs.length === 0 ? (
                      <>
                        {[...Array(10)].map((_, i) => (
                          <TableRow key={i}>
                            <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-[70px]" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-[60px]" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-[60px]" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                            <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                          </TableRow>
                        ))}
                      </>
                    ) : syncLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <ArrowRightLeft className="h-8 w-8 opacity-20" />
                            <p className="text-sm">No Lark sync logs found</p>
                            <p className="text-xs">Sync logs appear here when tasks are created, updated, or synced between TrishulHub and Lark.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      syncLogs.map((log) => (
                        <TableRow key={log.id} className="hover:bg-muted/50">
                          <TableCell className="text-xs">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-help">{formatRelativeTime(log.createdAt)}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{formatDateTime(log.createdAt)}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={cn("text-[10px] font-semibold flex items-center gap-1 w-fit", directionBadge(log.direction))}
                            >
                              <DirectionIcon direction={log.direction} />
                              {log.direction === "TO_LARK" ? "To Lark" : "From Lark"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="secondary"
                              className={cn("text-[10px] font-semibold", ACTION_COLORS[log.action] || ACTION_COLORS.UPDATE)}
                            >
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <SyncStatusIcon status={log.status} />
                              <span className={cn("text-[10px] font-semibold", syncStatusBadge(log.status).includes("green") ? "text-green-700 dark:text-green-400" : syncStatusBadge(log.status).includes("red") ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400")}>
                                {log.status}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {log.taskId ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[11px] font-mono text-muted-foreground cursor-help hover:text-foreground">
                                    {log.taskId.slice(0, 8)}...
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-[10px] font-mono">{log.taskId}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {log.larkTaskId ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-[11px] font-mono text-muted-foreground cursor-help hover:text-foreground">
                                    {log.larkTaskId.slice(0, 8)}...
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-[10px] font-mono">{log.larkTaskId}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {log.error ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-[11px] text-red-600 dark:text-red-400 truncate max-w-[200px] cursor-help">
                                    {log.error}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p className="text-xs">{log.error}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Sync logs footer */}
              {syncLogs.length > 0 && (
                <div className="flex items-center justify-between p-4 border-t text-xs text-muted-foreground">
                  <span>
                    Showing {syncLogs.length} sync operations
                    {syncDirectionFilter && <> — filtered by {syncDirectionFilter === "TO_LARK" ? "To Lark" : "From Lark"}</>}
                    {syncStatusFilter && <> — {syncStatusFilter}</>}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Last refreshed just now
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
    </TooltipProvider>
    </AuditTrailErrorBoundary>
  )
}