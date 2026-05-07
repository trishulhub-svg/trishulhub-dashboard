"use client"

import { useState, useEffect, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useParams } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  FileText,
  Trash2,
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Loader2,
  Eye,
  BookOpen,
  Send,
  Calendar,
  BadgeCheck,
  XCircle,
} from "lucide-react"
import { BrandedDocumentView, DownloadPdfButton } from "@/components/training"
import { cn, safeDateStr, safeArray } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Checkbox } from "@/components/ui/checkbox"

interface DocumentData {
  id: string
  topic: string
  content: string
  summary: string | null
  imageUrl: string | null
  imageUrls: string
  status: string
  createdAt: string
  updatedAt: string
  generator: { id: string; name: string }
  tests: TestData[]
  assignments: AssignmentData[]
  _count: { tests: number; assignments: number }
}

interface TestData {
  id: string
  documentId: string
  level: string
  timeLimit: number
  createdAt: string
  generator: { id: string; name: string }
  _count: { assignments: number }
}

interface AssignmentData {
  id: string
  testLevel: string
  status: string
  dueDate: string | null
  createdAt: string
  employee: { id: string; name: string; email: string }
  assigner: { id: string; name: string }
  test: TestData | null
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

interface Employee {
  id: string
  name: string
  email: string
  role: string
}

const LEVEL_CONFIG: Record<string, { label: string; className: string; desc: string }> = {
  LOW: { label: "Easy", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", desc: "Basic recall questions" },
  MEDIUM: { label: "Medium", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", desc: "Application questions" },
  HIGH: { label: "Hard", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", desc: "Critical thinking questions" },
}

const ASSIGNMENT_STATUS: Record<string, { label: string; className: string }> = {
  ASSIGNED: { label: "Assigned", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  READ: { label: "Read", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  TEST_STARTED: { label: "In Progress", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  COMPLETED: { label: "Completed", className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  PASSED: { label: "Passed", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  FAILED: { label: "Failed", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
}

export default function DocumentDetailPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const params = useParams()
  const docId = params.docId as string

  const [document, setDocument] = useState<DocumentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generatingTest, setGeneratingTest] = useState<string | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignLevel, setAssignLevel] = useState("LOW")
  const [assignDueDate, setAssignDueDate] = useState("")
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([])
  const [assigning, setAssigning] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [imageUrls, setImageUrls] = useState<string[]>([])

  const fetchDocument = useCallback(async () => {
    try {
      const res = await fetch(`/api/training/documents/${docId}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setDocument(data)
        try {
          setImageUrls(JSON.parse(data.imageUrls || "[]"))
        } catch (_e) { /* ignore */ }
      } else if (res.status === 404) {
        toast.error("Document not found")
        router.push("/dashboard/training")
      }
    } catch (_e) {
      toast.error("Failed to load document")
    } finally {
      setLoading(false)
    }
  }, [docId, router])

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch("/api/team?type=users", { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        // Filter only non-admin employees (DEVELOPER role)
        setEmployees(
          safeArray<Employee>(data)
            .filter((e: Employee) => e.role === "DEVELOPER")
            .map((e: Employee) => ({ id: e.id, name: e.name, email: e.email, role: e.role }))
        )
      }
    } catch (_e) { /* ignore */ }
  }, [])

  useEffect(() => {
    if (authStatus === "loading") return
    if (!session || !["SUPER_ADMIN", "ADMIN"].includes(session.user?.role || "")) {
      router.push("/dashboard")
      return
    }
    fetchDocument()
    fetchEmployees()
  }, [session, authStatus, router, fetchDocument, fetchEmployees])

  const handleGenerateTest = async (level: string) => {
    setGeneratingTest(level)
    toast.info(`Generating ${level} difficulty test...`)
    try {
      const res = await fetch("/api/training/tests/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ documentId: docId, level }),
      })
      if (res.ok) {
        toast.success(`${level} test generated successfully!`)
        fetchDocument()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to generate test")
      }
    } catch (_e) {
      toast.error("Failed to generate test")
    } finally {
      setGeneratingTest(null)
    }
  }

  const handleDeleteTest = async (testId: string) => {
    try {
      const res = await fetch(`/api/training/tests/${testId}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (res.ok) {
        toast.success("Test deleted")
        fetchDocument()
      } else {
        toast.error("Failed to delete test")
      }
    } catch (_e) {
      toast.error("Failed to delete test")
    } finally {
      setDeleteId(null)
    }
  }

  const handleAssign = async () => {
    if (selectedEmployees.length === 0) {
      toast.error("Select at least one employee")
      return
    }
    setAssigning(true)
    try {
      const res = await fetch("/api/training/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          documentId: docId,
          employeeIds: selectedEmployees,
          testLevel: assignLevel,
          dueDate: assignDueDate || null,
        }),
      })
      if (res.ok) {
        toast.success(`Training assigned to ${selectedEmployees.length} employee(s)`)
        setAssignOpen(false)
        setSelectedEmployees([])
        setAssignDueDate("")
        fetchDocument()
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to assign training")
      }
    } catch (_e) {
      toast.error("Failed to assign training")
    } finally {
      setAssigning(false)
    }
  }

  const toggleEmployee = (empId: string) => {
    setSelectedEmployees((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    )
  }

  if (authStatus === "loading" || loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted/50 animate-pulse rounded" />
        <div className="h-96 bg-muted/50 animate-pulse rounded-xl" />
      </div>
    )
  }

  if (!document) return null

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/training")} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{document.topic}</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs sm:text-sm text-muted-foreground">
            <span>Created by {document.generator.name}</span>
            <span className="hidden sm:inline">•</span>
            <span>{safeDateStr(new Date(document.createdAt))}</span>
            <span className="hidden sm:inline">•</span>
            <span>{document.tests.length} test(s)</span>
            <span className="hidden sm:inline">•</span>
            <span>{document.assignments.length} assignment(s)</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="document" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="document" className="gap-1 text-xs sm:text-sm">
            <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Document
          </TabsTrigger>
          <TabsTrigger value="tests" className="gap-1 text-xs sm:text-sm">
            <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Tests
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-1 text-xs sm:text-sm">
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> <span className="hidden xs:inline">Assignments</span><span className="xs:hidden">Assign</span> ({document.assignments.length})
          </TabsTrigger>
        </TabsList>

        {/* Document Tab */}
        <TabsContent value="document">
          <BrandedDocumentView
            topic={document.topic}
            content={document.content}
            generatedBy={document.generator.name}
            createdAt={document.createdAt}
            imageUrls={imageUrls}
          >
            <div className="flex flex-wrap items-center gap-2">
              <DownloadPdfButton
                topic={document.topic}
                content={document.content}
                generatedBy={document.generator.name}
                createdAt={document.createdAt}
                variant="outline"
                size="sm"
                className="border-[#E85D04]/30 text-[#C2410C] hover:bg-[#E85D04]/10"
              />
            </div>
          </BrandedDocumentView>
        </TabsContent>

        {/* Tests Tab */}
        <TabsContent value="tests">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Test Generation</CardTitle>
                <CardDescription>
                  Generate MCQ tests at different difficulty levels. Each level can have one test.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {(["LOW", "MEDIUM", "HIGH"] as const).map((level) => {
                    const cfg = LEVEL_CONFIG[level]
                    const existingTest = document.tests.find((t) => t.level === level)
                    const isGenerating = generatingTest === level

                    return (
                      <Card key={level} className="border-border">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <Badge className={cfg.className}>{cfg.label}</Badge>
                            {existingTest && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-red-500 hover:text-red-600"
                                onClick={() => setDeleteId(existingTest.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-3">{cfg.desc}</p>
                          {existingTest ? (
                            <div className="space-y-2 text-xs text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                                <span>Generated {safeDateStr(new Date(existingTest.createdAt))}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="h-3 w-3" />
                                <span>{existingTest.timeLimit} min time limit</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Users className="h-3 w-3" />
                                <span>{existingTest._count.assignments} assigned</span>
                              </div>
                            </div>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full gap-1"
                              disabled={isGenerating}
                              onClick={() => handleGenerateTest(level)}
                            >
                              {isGenerating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Sparkles className="h-3 w-3" />
                              )}
                              {isGenerating ? "Generating..." : "Generate"}
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Assignments Tab */}
        <TabsContent value="assignments">
          <div className="space-y-4">
            {/* Assign button */}
            <div className="flex justify-end">
              <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" disabled={document.tests.length === 0}>
                    <Send className="h-4 w-4" /> Assign to Employees
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg sm:max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Assign Training</DialogTitle>
                    <DialogDescription>
                      Select employees and test level to assign this training.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {document.tests.length === 0 && (
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-sm text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Generate at least one test before assigning.
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium mb-2 block">Test Level</label>
                      <Select value={assignLevel} onValueChange={setAssignLevel}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {document.tests.map((t) => (
                            <SelectItem key={t.level} value={t.level}>
                              {LEVEL_CONFIG[t.level]?.label || t.level}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Due Date (optional)</label>
                      <Input
                        type="date"
                        value={assignDueDate}
                        onChange={(e) => setAssignDueDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Select Employees ({selectedEmployees.length} selected)
                      </label>
                      <ScrollArea className="h-48 rounded-lg border">
                        <div className="p-2 space-y-1">
                          {employees.length === 0 ? (
                            <p className="text-sm text-muted-foreground p-3 text-center">No developers found</p>
                          ) : (
                            employees.map((emp) => (
                              <label
                                key={emp.id}
                                className={cn(
                                  "flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-accent/50 transition-colors",
                                  selectedEmployees.includes(emp.id) && "bg-primary/5"
                                )}
                              >
                                <Checkbox
                                  checked={selectedEmployees.includes(emp.id)}
                                  onCheckedChange={() => toggleEmployee(emp.id)}
                                />
                                <Avatar className="h-7 w-7">
                                  <AvatarFallback className="text-xs">{emp.name.split(" ").map((n) => n[0]).join("")}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">{emp.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{emp.email}</p>
                                </div>
                              </label>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
                    <Button
                      onClick={handleAssign}
                      disabled={assigning || selectedEmployees.length === 0 || document.tests.length === 0}
                    >
                      {assigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                      Assign ({selectedEmployees.length})
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Assignments list */}
            {document.assignments.length === 0 ? (
              <Card className="p-8 text-center">
                <Users className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <h3 className="text-sm font-medium mt-3">No assignments yet</h3>
                <p className="text-xs text-muted-foreground mt-1">Assign this training to employees to get started.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {document.assignments.map((a) => {
                  const statusCfg = ASSIGNMENT_STATUS[a.status] || ASSIGNMENT_STATUS.ASSIGNED
                  const latestAttempt = a.attempts[0]
                  return (
                    <Card key={a.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className="text-xs">
                                {a.employee.name.split(" ").map((n) => n[0]).join("")}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{a.employee.name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{a.testLevel} level</span>
                                {a.dueDate && (
                                  <>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      Due {safeDateStr(new Date(a.dueDate))}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {latestAttempt && (
                              <div className="text-right">
                                <p className={cn("text-sm font-bold", latestAttempt.passed ? "text-green-600" : "text-red-600")}>
                                  {latestAttempt.score}/{latestAttempt.total}
                                </p>
                                {latestAttempt.timeTaken && (
                                  <p className="text-xs text-muted-foreground">
                                    {Math.floor(latestAttempt.timeTaken / 60)}m {latestAttempt.timeTaken % 60}s
                                  </p>
                                )}
                              </div>
                            )}
                            <Badge className={cn("text-xs", statusCfg.className)}>
                              {a.status === "PASSED" && <BadgeCheck className="h-3 w-3 mr-1" />}
                              {a.status === "FAILED" && <XCircle className="h-3 w-3 mr-1" />}
                              {statusCfg.label}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Delete Test Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Test</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this test. Any assignments using this test will lose their test data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && handleDeleteTest(deleteId)} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
