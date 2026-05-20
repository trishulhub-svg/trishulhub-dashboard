"use client"

import { useState, useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  BookOpen,
  Clock,
  Calendar,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  Eye,
  Trophy,
  Loader2,
} from "lucide-react"
import { cn, safeDateStr, safeArray } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

interface Assignment {
  id: string
  testLevel: string
  status: string
  dueDate: string | null
  createdAt: string
  document: { id: string; topic: string; imageUrl: string | null }
  assigner: { id: string; name: string }
  test: { id: string; level: string; timeLimit: number; createdAt: string } | null
  attempts: TestAttempt[]
}

interface TestAttempt {
  id: string
  score: number
  total: number
  passed: boolean
  timeTaken: number | null
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  ASSIGNED: { label: "Assigned", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: AlertCircle },
  READ: { label: "Read", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Eye },
  TEST_STARTED: { label: "In Progress", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: Play },
  PASSED: { label: "Passed", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
  FAILED: { label: "Failed", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
}

const LEVEL_CONFIG: Record<string, { label: string; className: string }> = {
  LOW: { label: "Easy", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  MEDIUM: { label: "Medium", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  HIGH: { label: "Hard", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
}

export default function MyTrainingPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()

  const { data: assignmentsData = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["training-assignments"],
    queryFn: async () => {
      const res = await fetch("/api/training/assignments", { credentials: "include" })
      if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized") }
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json()
      return safeArray<Assignment>(data)
    },
    enabled: authStatus !== "loading" && !!session,
    staleTime: 60 * 1000,
    retry: 1,
  })

  const assignments = assignmentsData
  const loading = assignmentsLoading

  const handleAction = (assignment: Assignment) => {
    switch (assignment.status) {
      case "ASSIGNED":
        router.push(`/dashboard/my-training/${assignment.id}`)
        break
      case "READ":
        router.push(`/dashboard/my-training/${assignment.id}`)
        break
      case "TEST_STARTED":
        router.push(`/dashboard/my-training/${assignment.id}`)
        break
      case "PASSED":
      case "FAILED":
        router.push(`/dashboard/my-training/${assignment.id}`)
        break
      default:
        break
    }
  }

  const getActionLabel = (assignment: Assignment) => {
    switch (assignment.status) {
      case "ASSIGNED": return "Start Reading"
      case "READ": return "Take Test"
      case "TEST_STARTED": return "Continue Test"
      case "PASSED":
      case "FAILED": return "View Results"
      default: return "View"
    }
  }

  useEffect(() => {
    if (authStatus !== "loading" && !session) {
      router.push("/login")
    }
  }, [session, authStatus, router])

  if (authStatus === "loading" || loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-muted/50 animate-pulse rounded-lg" />
            <div className="h-4 w-72 bg-muted/50 animate-pulse rounded" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 rounded-xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  const inProgressCount = assignments.filter((a) => ["ASSIGNED", "READ", "TEST_STARTED"].includes(a.status)).length
  const passedCount = assignments.filter((a) => a.status === "PASSED").length
  const failedCount = assignments.filter((a) => a.status === "FAILED").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-7 w-7 text-primary" />
          My Training
        </h1>
        <p className="text-muted-foreground mt-1">
          View and complete your assigned training modules
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-lg sm:text-xl font-bold">{assignments.length}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
              <Play className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-lg sm:text-xl font-bold">{inProgressCount}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">In Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-lg sm:text-xl font-bold">{passedCount}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Passed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
              <XCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-lg sm:text-xl font-bold">{failedCount}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Failed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assignments */}
      {assignments.length === 0 ? (
        <Card className="p-8 sm:p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">No Training Assigned</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Your admin hasn&apos;t assigned any training yet. Check back later!
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {assignments.map((a) => {
            const statusCfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.ASSIGNED
            const levelCfg = LEVEL_CONFIG[a.testLevel] || LEVEL_CONFIG.LOW
            const latestAttempt = a.attempts[0]
            const isOverdue = a.dueDate && new Date(a.dueDate) < new Date() && !["PASSED", "FAILED"].includes(a.status)

            return (
              <Card
                key={a.id}
                className={cn(
                  "group hover:shadow-lg transition-all duration-200 cursor-pointer",
                  isOverdue && "border-red-300 dark:border-red-800"
                )}
                onClick={() => handleAction(a)}
              >
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm sm:text-base font-semibold line-clamp-2">{a.document.topic}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        Assigned by {a.assigner.name} {"\u2022"} {safeDateStr(new Date(a.createdAt))}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge className={cn("text-xs", levelCfg.className)}>{levelCfg.label}</Badge>
                      <Badge className={cn("text-xs", statusCfg.className)}>
                        <statusCfg.icon className="h-3 w-3 mr-1" />
                        {statusCfg.label}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 sm:gap-3 text-xs text-muted-foreground flex-wrap">
                      {a.dueDate && (
                        <span className={cn("flex items-center gap-1 text-[10px] sm:text-xs", isOverdue && "text-red-600 dark:text-red-400 font-medium")}>
                          <Calendar className="h-3 w-3" />
                          {isOverdue ? "Overdue" : `Due ${safeDateStr(new Date(a.dueDate))}`}
                        </span>
                      )}
                      {latestAttempt && (
                        <span className={cn("flex items-center gap-1 font-medium", latestAttempt.passed ? "text-green-600" : "text-red-600")}>
                          {latestAttempt.passed ? <Trophy className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {latestAttempt.score}/{latestAttempt.total}
                        </span>
                      )}
                    </div>
                    <Button
                      variant={["PASSED", "FAILED"].includes(a.status) ? "outline" : "default"}
                      size="sm"
                      className="h-8 gap-1 text-xs"
                    >
                      {a.status === "TEST_STARTED" && <Play className="h-3 w-3" />}
                      {getActionLabel(a)}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
