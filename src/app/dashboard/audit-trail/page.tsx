"use client"

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react"
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
  Shield,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Loader2,
  FileText,
  AlertTriangle,
  Calendar,
  X,
} from "lucide-react"
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
import { PageHeader } from "@/components/page-header"
import {
  AUDIT_DEPARTMENTS,
  AUDIT_ACTIONS,
  ACTION_COLORS,
  STATUS_COLORS,
  DEPARTMENT_ICONS,
  DEPARTMENT_COLORS,
  type AuditDepartment,
} from "@/lib/audit-log"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Briefcase,
  FolderKanban,
  Users,
  GraduationCap,
  Settings,
}

const INITIAL_PER_DEPT = 7

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
  userAgent?: string | null
  status: string | null
  metadata?: string | null
  createdAt: string
}

interface DeptState {
  logs: AuditLogEntry[]
  nextCursor: string | null
  total: number
  loading: boolean
  loadingMore: boolean
  error: string | null
}

interface StatsData {
  total: number
  todayCount: number
  departmentCounts: { department: string; count: number }[]
  actionCounts: { action: string; count: number }[]
  statusCounts: { status: string; count: number }[]
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

function getInitials(userName: string | null | undefined): string {
  if (!userName) return "?"
  return userName.split(" ").filter(Boolean).map((n) => n[0] || "").join("").toUpperCase().slice(0, 2) || "?"
}

function formatRole(role: string | null | undefined): string {
  if (!role) return "—"
  return role.replace(/_/g, " ")
}

function emptyDeptState(loading = true): DeptState {
  return { logs: [], nextCursor: null, total: 0, loading, loadingMore: false, error: null }
}

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
          <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex justify-center">
              <div className="th-stat-icon !bg-red-100 !text-red-600 dark:!bg-red-900/30 dark:!text-red-400">
                <AlertTriangle className="h-5 w-5" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold">Audit Trail Error</h2>
              <p className="text-sm text-muted-foreground">
                Something went wrong loading the audit trail.
              </p>
            </div>
            <div className="flex justify-center">
              <Button onClick={() => this.setState({ hasError: false, error: null })}>
                <RotateCcw className="h-4 w-4 mr-2" /> Try Again
              </Button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function AuditRow({ log, expanded, onToggle }: { log: AuditLogEntry; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/40"
        onClick={onToggle}
        data-state={expanded ? "open" : undefined}
      >
        <TableCell className="w-8 px-2">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        </TableCell>
        <TableCell className="text-xs whitespace-nowrap">
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
          <div className="flex items-center gap-2 min-w-0">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[9px] font-bold bg-muted text-foreground">
                {getInitials(log.userName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate max-w-[120px]">{log.userName || "Unknown"}</p>
              <p className="text-[10px] text-muted-foreground truncate">{formatRole(log.userRole)}</p>
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
          <p className="text-xs truncate max-w-[280px] lg:max-w-[420px]" title={log.description || undefined}>
            {log.description || "—"}
          </p>
        </TableCell>
        <TableCell>
          <p className="text-xs text-muted-foreground truncate max-w-[70px]">{log.page || "—"}</p>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={cn("text-[10px]", STATUS_COLORS[log.status || ""] || "")}>
            {log.status || "—"}
          </Badge>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={7} className="px-4 py-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Description</p>
                <p className="text-foreground leading-relaxed">{log.description || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Entity</p>
                <p className="text-foreground">
                  {log.entityType || "—"}
                  {log.entityId ? <span className="text-muted-foreground font-mono ml-1 text-[10px]">{log.entityId.slice(0, 12)}…</span> : null}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">IP Address</p>
                <p className="font-mono text-foreground">{log.ipAddress || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Status</p>
                <Badge variant="outline" className={cn("text-[10px]", STATUS_COLORS[log.status || ""] || "")}>
                  {log.status || "—"}
                </Badge>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function AuditMobileCard({ log, expanded, onToggle }: { log: AuditLogEntry; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <button type="button" className="w-full text-left space-y-2" onClick={onToggle}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{formatRelativeTime(log.createdAt)}</span>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className={cn("text-[10px]", STATUS_COLORS[log.status || ""] || "")}>
              {log.status || "—"}
            </Badge>
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-[10px] font-bold bg-muted">{getInitials(log.userName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{log.userName || "Unknown"}</p>
            <p className="text-[10px] text-muted-foreground">{formatRole(log.userRole)}</p>
          </div>
          <Badge variant="secondary" className={cn("text-[10px] shrink-0", ACTION_COLORS[log.action || ""] || "")}>
            {log.action || "—"}
          </Badge>
        </div>
        {log.description && (
          <p className={cn("text-xs text-muted-foreground", !expanded && "truncate")}>{log.description}</p>
        )}
      </button>
      {expanded && (
        <div className="pt-2 border-t border-border grid gap-2 text-xs">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Page</span>
            <span>{log.page || "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Entity</span>
            <span className="text-right">{log.entityType || "—"}{log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">IP</span>
            <span className="font-mono">{log.ipAddress || "—"}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function DepartmentSection({
  deptKey,
  state,
  onLoadMore,
  expandedIds,
  onToggleExpand,
}: {
  deptKey: string
  state: DeptState
  onLoadMore: () => void
  expandedIds: Set<string>
  onToggleExpand: (id: string) => void
}) {
  const dept = AUDIT_DEPARTMENTS[deptKey as AuditDepartment]
  const Icon = iconMap[DEPARTMENT_ICONS[deptKey]] || Settings
  const label = dept?.label || deptKey

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn("th-stat-icon !h-8 !w-8 shrink-0", DEPARTMENT_COLORS[deptKey])}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{label}</h3>
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {state.loading && state.logs.length === 0
                ? "Loading…"
                : `${state.logs.length.toLocaleString()} shown${state.total ? ` · ${state.total.toLocaleString()} total` : ""}`}
            </p>
          </div>
        </div>
        {state.nextCursor && (
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={onLoadMore} disabled={state.loadingMore}>
            {state.loadingMore ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5 mr-1.5" />}
            Load more
          </Button>
        )}
      </div>

      {state.error && (
        <div className="px-4 py-3 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      {state.loading && state.logs.length === 0 && (
        <div className="p-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      )}

      {!state.loading && state.logs.length === 0 && !state.error && (
        <div className="py-10 flex flex-col items-center text-muted-foreground">
          <Activity className="h-7 w-7 opacity-20 mb-2" />
          <p className="text-sm">No recent activity</p>
        </div>
      )}

      {state.logs.length > 0 && (
        <>
          {/* Mobile */}
          <div className="md:hidden space-y-2 p-3">
            {state.logs.map((log) => (
              <AuditMobileCard
                key={log.id}
                log={log}
                expanded={expandedIds.has(log.id)}
                onToggle={() => onToggleExpand(log.id)}
              />
            ))}
          </div>

          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8 px-2" />
                  <TableHead className="w-[120px]">When</TableHead>
                  <TableHead className="w-[150px]">User</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[80px]">Page</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.logs.map((log) => (
                  <AuditRow
                    key={log.id}
                    log={log}
                    expanded={expandedIds.has(log.id)}
                    onToggle={() => onToggleExpand(log.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  )
}

export default function AuditTrailPage() {
  const { data: session, status: sessionStatus } = useSession()
  const userRole = session?.user?.role || "DEVELOPER"
  const userDepartment = session?.user?.department as string | undefined

  const [stats, setStats] = useState<StatsData | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [listLoading, setListLoading] = useState(true)
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [actionFilter, setActionFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("ALL")
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "all">("7d")
  const [exporting, setExporting] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [deptStates, setDeptStates] = useState<Record<string, DeptState>>({})
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const fetchGen = useRef(0)

  const isExportVisible = ["SUPER_ADMIN", "ADMIN"].includes(userRole)

  const accessibleDepts = useMemo(() => {
    const all = Object.keys(AUDIT_DEPARTMENTS)
    if (["SUPER_ADMIN", "ADMIN"].includes(userRole)) return all
    if (userDepartment && all.includes(userDepartment)) return [userDepartment]
    return all
  }, [userRole, userDepartment])

  // Debounce search 300ms
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const getStartDate = useCallback(() => {
    const now = new Date()
    switch (dateRange) {
      case "7d": return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
      case "90d": return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
      default: return ""
    }
  }, [dateRange])

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    if (actionFilter) params.set("action", actionFilter)
    if (statusFilter && statusFilter !== "ALL") params.set("status", statusFilter)
    const startDate = getStartDate()
    if (startDate) params.set("startDate", startDate)
    return params
  }, [search, actionFilter, statusFilter, getStartDate])

  // Stats in parallel — never blocks the log list
  useEffect(() => {
    if (sessionStatus === "loading" || !session) return
    let cancelled = false
    const fetchStats = async () => {
      setStatsLoading(true)
      try {
        const res = await fetch("/api/audit-trail/stats", { credentials: "include" })
        if (!cancelled && res.ok) setStats(await res.json())
      } catch (err) {
        console.error("Failed to fetch audit stats:", err)
      } finally {
        if (!cancelled) setStatsLoading(false)
      }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [session, sessionStatus])

  // Single fetch → client-group by department (up to 7 shown per section)
  const fetchMainList = useCallback(async () => {
    const gen = ++fetchGen.current
    setListLoading(true)
    setDeptStates(() => {
      const next: Record<string, DeptState> = {}
      for (const d of accessibleDepts) next[d] = emptyDeptState(true)
      return next
    })

    try {
      const params = buildFilterParams()
      params.set("limit", "80")
      const res = await fetch(`/api/audit-trail?${params.toString()}`, { credentials: "include" })
      if (gen !== fetchGen.current) return

      if (!res.ok) {
        const errMsg = res.status === 403 ? "Access denied" : `HTTP ${res.status}`
        setDeptStates(() => {
          const next: Record<string, DeptState> = {}
          for (const d of accessibleDepts) {
            next[d] = { ...emptyDeptState(false), error: errMsg }
          }
          return next
        })
        return
      }

      const data = await res.json()
      if (gen !== fetchGen.current) return

      const items: AuditLogEntry[] = Array.isArray(data?.data) ? data.data : []
      const byDept: Record<string, AuditLogEntry[]> = {}
      for (const item of items) {
        const key = item.department || "SYSTEM"
        if (!byDept[key]) byDept[key] = []
        byDept[key].push(item)
      }

      setDeptStates(() => {
        const next: Record<string, DeptState> = {}
        for (const d of accessibleDepts) {
          const all = byDept[d] || []
          const shown = all.slice(0, INITIAL_PER_DEPT)
          const nextCursor =
            shown.length >= INITIAL_PER_DEPT && shown.length > 0
              ? shown[shown.length - 1].createdAt
              : null
          next[d] = {
            logs: shown,
            nextCursor,
            total: all.length,
            loading: false,
            loadingMore: false,
            error: null,
          }
        }
        return next
      })
    } catch {
      if (gen !== fetchGen.current) return
      setDeptStates(() => {
        const next: Record<string, DeptState> = {}
        for (const d of accessibleDepts) {
          next[d] = { ...emptyDeptState(false), error: "Network error" }
        }
        return next
      })
    } finally {
      if (gen === fetchGen.current) setListLoading(false)
    }
  }, [accessibleDepts, buildFilterParams])

  useEffect(() => {
    if (sessionStatus === "loading" || !session) return
    fetchMainList()
  }, [session, sessionStatus, fetchMainList])

  // Enrich totals from stats when they arrive (without waiting for them)
  useEffect(() => {
    if (!stats?.departmentCounts?.length) return
    setDeptStates((prev) => {
      let changed = false
      const next = { ...prev }
      for (const d of accessibleDepts) {
        const count = stats.departmentCounts.find((c) => c.department === d)?.count
        if (typeof count === "number" && next[d] && next[d].total !== count) {
          next[d] = { ...next[d], total: count }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [stats, accessibleDepts])

  const loadMoreDept = async (dept: string) => {
    const current = deptStates[dept]
    if (!current?.nextCursor || current.loadingMore) return
    setDeptStates((prev) => ({
      ...prev,
      [dept]: { ...prev[dept], loadingMore: true },
    }))
    try {
      const params = buildFilterParams()
      params.set("department", dept)
      params.set("limit", "20")
      params.set("cursor", current.nextCursor)
      const res = await fetch(`/api/audit-trail?${params.toString()}`, { credentials: "include" })
      if (!res.ok) {
        setDeptStates((prev) => ({
          ...prev,
          [dept]: { ...prev[dept], loadingMore: false, error: `Failed to load more (HTTP ${res.status})` },
        }))
        return
      }
      const data = await res.json()
      const items: AuditLogEntry[] = Array.isArray(data?.data) ? data.data : []
      const existingIds = new Set(current.logs.map((l) => l.id))
      const fresh = items.filter((l) => !existingIds.has(l.id))
      setDeptStates((prev) => ({
        ...prev,
        [dept]: {
          ...prev[dept],
          logs: [...prev[dept].logs, ...fresh],
          nextCursor: data?.nextCursor ?? null,
          loadingMore: false,
          error: null,
        },
      }))
    } catch {
      setDeptStates((prev) => ({
        ...prev,
        [dept]: { ...prev[dept], loadingMore: false, error: "Network error" },
      }))
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearFilters = () => {
    setSearchInput("")
    setSearch("")
    setActionFilter("")
    setStatusFilter("ALL")
    setDateRange("7d")
  }

  const hasActiveFilters = searchInput || actionFilter || statusFilter !== "ALL" || dateRange !== "7d"

  const successRate = useMemo(() => {
    if (!stats?.statusCounts?.length) return "—"
    const success = stats.statusCounts.find((s) => s.status === "SUCCESS")
    const failure = stats.statusCounts.find((s) => s.status === "FAILURE")
    const total = (success?.count || 0) + (failure?.count || 0)
    if (total === 0) return "—"
    return `${Math.round(((success?.count || 0) / total) * 100)}%`
  }, [stats])

  const exportCsv = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (actionFilter) params.set("action", actionFilter)
      const startDate = getStartDate()
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
      if (actionFilter) params.set("action", actionFilter)
      const startDate = getStartDate()
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
        <div className="space-y-5 th-page-enter">
          <PageHeader title="Audit Trail" description="Department activity grouped for quick review">
            {isExportVisible && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting}>
                  {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
                  CSV
                </Button>
                <Button size="sm" onClick={exportPdf} disabled={exportingPdf}>
                  {exportingPdf ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />}
                  PDF
                </Button>
              </div>
            )}
          </PageHeader>

          {/* Compact stats strip — loads independently */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-5 rounded-xl border border-border bg-card/50 px-4 py-3">
            {statsLoading && !stats ? (
              <>
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-24" />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="th-stat-icon !h-8 !w-8">
                    <Shield className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</p>
                    <p className="text-sm font-semibold tabular-nums">{(stats?.total ?? 0).toLocaleString()}</p>
                  </div>
                </div>
                <div className="h-6 w-px bg-border hidden sm:block" />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Today</p>
                  <p className="text-sm font-semibold tabular-nums">{(stats?.todayCount ?? 0).toLocaleString()}</p>
                </div>
                <div className="h-6 w-px bg-border hidden sm:block" />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Success</p>
                  <p className="text-sm font-semibold tabular-nums">{successRate}</p>
                </div>
              </>
            )}
          </div>

          {/* Toolbar */}
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search descriptions…"
                  className="pl-9 h-9"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={actionFilter || "__all"} onValueChange={(v) => setActionFilter(v === "__all" ? "" : v)}>
                  <SelectTrigger className="w-auto min-w-[120px] h-9">
                    <Filter className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                    <SelectValue placeholder="Action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All actions</SelectItem>
                    {AUDIT_ACTIONS.map((a) => (
                      <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-auto min-w-[100px] h-9">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All status</SelectItem>
                    <SelectItem value="SUCCESS">Success</SelectItem>
                    <SelectItem value="FAILURE">Failure</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
                  <SelectTrigger className="w-auto min-w-[100px] h-9">
                    <Calendar className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d">7 days</SelectItem>
                    <SelectItem value="30d">30 days</SelectItem>
                    <SelectItem value="90d">90 days</SelectItem>
                    <SelectItem value="all">All time</SelectItem>
                  </SelectContent>
                </Select>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" className="h-9 px-2" onClick={clearFilters}>
                    <X className="h-3.5 w-3.5 mr-1" /> Clear
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Department sections */}
          <div className="space-y-4">
            {listLoading && accessibleDepts.every((d) => !deptStates[d] || deptStates[d].logs.length === 0) ? (
              <div className="space-y-4">
                {accessibleDepts.slice(0, 3).map((d) => (
                  <div key={d} className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              accessibleDepts.map((deptKey) => (
                <DepartmentSection
                  key={deptKey}
                  deptKey={deptKey}
                  state={deptStates[deptKey] || emptyDeptState(false)}
                  onLoadMore={() => loadMoreDept(deptKey)}
                  expandedIds={expandedIds}
                  onToggleExpand={toggleExpand}
                />
              ))
            )}
          </div>
        </div>
      </TooltipProvider>
    </AuditTrailErrorBoundary>
  )
}
