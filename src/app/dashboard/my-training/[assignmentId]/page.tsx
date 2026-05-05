"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { useRouter, useParams } from "next/navigation"
import { toast } from "sonner"
import ReactMarkdown from "react-markdown"
import {
  ArrowLeft,
  BookOpen,
  Play,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Send,
  Loader2,
  Trophy,
  Eye,
  RotateCcw,
  Timer,
} from "lucide-react"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
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

interface AssignmentData {
  id: string
  testLevel: string
  status: string
  dueDate: string | null
  createdAt: string
  document: {
    id: string
    topic: string
    content: string
    imageUrl: string | null
    imageUrls: string
  }
  test: {
    id: string
    level: string
    timeLimit: number
    questions: string // JSON
    createdAt: string
  } | null
  attempts: TestAttemptData[]
}

interface TestAttemptData {
  id: string
  score: number
  total: number
  passed: boolean
  timeTaken: number | null
  createdAt: string
}

interface Question {
  question: string
  options: string[]
  correctAnswer?: number
  explanation?: string
}

type ViewMode = "loading" | "read" | "ready" | "test" | "submitting" | "results"

const OPTION_LABELS = ["A", "B", "C", "D"]

export default function TrainingReaderPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const params = useParams()
  const assignmentId = params.assignmentId as string

  const [assignment, setAssignment] = useState<AssignmentData | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("loading")
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [currentQ, setCurrentQ] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0) // seconds
  const [testStartTime, setTestStartTime] = useState<number>(0)
  const [submitConfirm, setSubmitConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState<{
    score: number
    total: number
    passed: boolean
    percentage: number
    results: { question: string; options: string[]; correctAnswer: number; selectedAnswer: number | null; isCorrect: boolean; explanation: string }[]
  } | null>(null)
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAssignment = useCallback(async () => {
    try {
      const res = await fetch(`/api/training/assignments/${assignmentId}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setAssignment(data)
        try {
          setImageUrls(JSON.parse(data.document.imageUrls || "[]"))
        } catch { /* ignore */ }

        // Determine view mode
        if (["PASSED", "FAILED"].includes(data.status)) {
          setViewMode("results")
          // Load results from last attempt
          if (data.test && data.attempts.length > 0) {
            const testQuestions: Question[] = JSON.parse(data.test.questions)
            const lastAttempt = data.attempts[0]
            const attemptAnswers: number[] = JSON.parse(
              `{"answers": []}` // We need to re-fetch this from attempts API
            ).answers || []
            // Show review from test data
            setQuestions(testQuestions)
            setResults({
              score: lastAttempt.score,
              total: lastAttempt.total,
              passed: lastAttempt.passed,
              percentage: Math.round((lastAttempt.score / lastAttempt.total) * 100),
              results: testQuestions.map((q: any, idx: number) => ({
                question: q.question,
                options: q.options,
                correctAnswer: q.correctAnswer,
                selectedAnswer: null, // We don't have stored answers visible
                isCorrect: false,
                explanation: q.explanation || "",
              })),
            })
          }
        } else if (data.status === "TEST_STARTED") {
          // Resume test - fetch questions with answers hidden
          if (data.test) {
            const testRes = await fetch(`/api/training/tests/${data.test.id}?assignmentId=${assignmentId}`, { credentials: "include" })
            if (testRes.ok) {
              const testData = await testRes.json()
              const testQs: Question[] = testData.questions
              setQuestions(testQs)
              setAnswers(new Array(testQs.length).fill(null))
              // Set timer (full time minus some buffer for resumed tests)
              setTimeLeft(data.test.timeLimit * 60)
              setTestStartTime(Date.now())
              setViewMode("test")
            }
          }
        } else if (data.status === "READ") {
          setViewMode("ready")
        } else {
          setViewMode("read")
        }
      } else if (res.status === 404) {
        toast.error("Assignment not found")
        router.push("/dashboard/my-training")
      }
    } catch {
      toast.error("Failed to load assignment")
      router.push("/dashboard/my-training")
    }
  }, [assignmentId, router])

  useEffect(() => {
    if (authStatus === "loading") return
    if (!session) {
      router.push("/login")
      return
    }
    fetchAssignment()
  }, [session, authStatus, router, fetchAssignment])

  // Timer effect
  useEffect(() => {
    if (viewMode !== "test" || timeLeft <= 0) return

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Auto-submit when time runs out
          if (timerRef.current) clearInterval(timerRef.current)
          handleAutoSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [viewMode])

  const handleMarkAsRead = async () => {
    try {
      const res = await fetch(`/api/training/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "READ" }),
      })
      if (res.ok) {
        setAssignment((prev) => prev ? { ...prev, status: "READ" } : prev)
        setViewMode("ready")
        toast.success("Marked as read! You can now start the test.")
      }
    } catch {
      toast.error("Failed to update status")
    }
  }

  const handleStartTest = async () => {
    if (!assignment?.test) return

    // Update status to TEST_STARTED
    try {
      const res = await fetch(`/api/training/assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "TEST_STARTED" }),
      })
      if (!res.ok) {
        toast.error("Failed to start test")
        return
      }
    } catch {
      toast.error("Failed to start test")
      return
    }

    // Fetch questions (without answers)
    try {
      const testRes = await fetch(`/api/training/tests/${assignment.test.id}?assignmentId=${assignmentId}`, { credentials: "include" })
      if (testRes.ok) {
        const testData = await testRes.json()
        const testQs: Question[] = testData.questions
        setQuestions(testQs)
        setAnswers(new Array(testQs.length).fill(null))
        setTimeLeft(assignment.test.timeLimit * 60)
        setTestStartTime(Date.now())
        setViewMode("test")
      }
    } catch {
      toast.error("Failed to load test questions")
    }
  }

  const handleAutoSubmit = async () => {
    if (submitting) return
    toast.warning("Time is up! Auto-submitting your test...")
    await submitTest()
  }

  const submitTest = async () => {
    if (submitting || !assignment) return
    setSubmitting(true)
    setViewMode("submitting")

    const timeTaken = Math.floor((Date.now() - testStartTime) / 1000)

    try {
      const res = await fetch("/api/training/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          assignmentId,
          answers,
          timeTaken,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setResults(data)
        setViewMode("results")
        if (data.passed) {
          toast.success(`Congratulations! You passed with ${data.score}/${data.total}!`)
        } else {
          toast.error(`You scored ${data.score}/${data.total}. You need 7/10 to pass.`)
        }
      } else {
        const data = await res.json()
        toast.error(data.error || "Failed to submit test")
        setViewMode("test")
      }
    } catch {
      toast.error("Failed to submit test")
      setViewMode("test")
    } finally {
      setSubmitting(false)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  const answeredCount = answers.filter((a) => a !== null).length

  if (authStatus === "loading" || viewMode === "loading") {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted/50 animate-pulse rounded" />
        <div className="h-96 bg-muted/50 animate-pulse rounded-xl" />
      </div>
    )
  }

  if (!assignment) return null

  // ─── READ MODE ───
  if (viewMode === "read") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/my-training")} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{assignment.document.topic}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Read the training material below, then mark as read to start the test.
            </p>
          </div>
          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            {LEVEL_LABELS[assignment.testLevel] || assignment.testLevel} Level
          </Badge>
        </div>

        {/* Images */}
        {imageUrls.length > 0 && (
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {imageUrls.map((url, idx) => (
              <div key={idx} className="rounded-xl overflow-hidden border">
                <img src={url} alt={`Illustration ${idx + 1}`} className="w-full h-auto" />
              </div>
            ))}
          </div>
        )}

        {/* Document content */}
        <Card>
          <CardContent className="p-6">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{assignment.document.content}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>

        {/* Mark as Read button */}
        <div className="flex justify-center sticky bottom-4">
          <Button size="lg" className="gap-2 shadow-lg" onClick={handleMarkAsRead}>
            <CheckCircle2 className="h-5 w-5" />
            Mark as Read &amp; Start Test
          </Button>
        </div>
      </div>
    )
  }

  // ─── READY MODE (Read completed, ready to start test) ───
  if (viewMode === "ready") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/my-training")} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </div>

        <Card className="p-12 text-center max-w-lg mx-auto">
          <div className="flex flex-col items-center gap-6">
            <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Ready to Take the Test!</h2>
              <p className="text-muted-foreground mt-2">
                You&apos;ve read the training material for &quot;{assignment.document.topic}&quot;.
                You can review the document again or start the test now.
              </p>
            </div>
            <div className="grid gap-3 w-full text-sm">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-muted-foreground">Difficulty Level</span>
                <Badge>{LEVEL_LABELS[assignment.testLevel] || assignment.testLevel}</Badge>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-muted-foreground">Questions</span>
                <span className="font-medium">10 Multiple Choice</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-muted-foreground">Time Limit</span>
                <span className="font-medium flex items-center gap-1">
                  <Timer className="h-4 w-4" /> 20 minutes
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-muted-foreground">Passing Score</span>
                <span className="font-medium">7/10 (70%)</span>
              </div>
            </div>
            <div className="flex gap-3 w-full">
              <Button variant="outline" className="flex-1 gap-2" onClick={() => setViewMode("read")}>
                <Eye className="h-4 w-4" /> Review Material
              </Button>
              <Button className="flex-1 gap-2" onClick={handleStartTest}>
                <Play className="h-4 w-4" /> Start Test
              </Button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  // ─── TEST MODE ───
  if (viewMode === "test") {
    const isWarning = timeLeft <= 300 // 5 minutes
    const isDanger = timeLeft <= 60 // 1 minute

    return (
      <div className="space-y-4">
        {/* Timer bar */}
        <div className={cn(
          "sticky top-0 z-10 -mx-5 md:-mx-8 px-5 md:px-8 py-3 border-b bg-card shadow-sm",
          isDanger ? "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800" :
          isWarning ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-300 dark:border-yellow-800" :
          ""
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-sm">
                Q {currentQ + 1}/{questions.length}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {answeredCount}/{questions.length} answered
              </span>
            </div>
            <div className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-lg font-bold",
              isDanger ? "bg-red-600 text-white animate-pulse" :
              isWarning ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400" :
              "bg-muted"
            )}>
              <Clock className="h-5 w-5" />
              {formatTime(timeLeft)}
            </div>
          </div>
          <Progress
            value={((assignment.test?.timeLimit || 20) * 60 - timeLeft) / ((assignment.test?.timeLimit || 20) * 60) * 100}
            className={cn("mt-2 h-1", isDanger ? "[&>div]:bg-red-600" : isWarning ? "[&>div]:bg-yellow-500" : "")}
          />
        </div>

        {/* Question */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-6">
            <span className="text-primary mr-2">Q{currentQ + 1}.</span>
            {questions[currentQ]?.question}
          </h3>
          <div className="space-y-3">
            {questions[currentQ]?.options.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => {
                  const newAnswers = [...answers]
                  newAnswers[currentQ] = idx
                  setAnswers(newAnswers)
                }}
                className={cn(
                  "w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left",
                  answers[currentQ] === idx
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/30 hover:bg-accent/50"
                )}
              >
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                  answers[currentQ] === idx
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}>
                  {OPTION_LABELS[idx]}
                </div>
                <span className="text-sm">{opt}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* Question navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentQ((prev) => Math.max(0, prev - 1))}
            disabled={currentQ === 0}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>

          {/* Question number buttons */}
          <div className="hidden md:flex items-center gap-1">
            {questions.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentQ(idx)}
                className={cn(
                  "h-8 w-8 rounded-lg text-xs font-medium transition-colors",
                  idx === currentQ
                    ? "bg-primary text-primary-foreground"
                    : answers[idx] !== null
                    ? "bg-primary/10 text-primary font-bold"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                )}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          {currentQ < questions.length - 1 ? (
            <Button onClick={() => setCurrentQ((prev) => Math.min(questions.length - 1, prev + 1))} className="gap-1">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={() => setSubmitConfirm(true)}
              disabled={answeredCount < questions.length}
              className="gap-1"
            >
              <Send className="h-4 w-4" />
              Submit ({answeredCount}/{questions.length})
            </Button>
          )}
        </div>

        {/* Mobile question nav */}
        <div className="flex md:hidden items-center justify-center gap-1 flex-wrap">
          {questions.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentQ(idx)}
              className={cn(
                "h-8 w-8 rounded-lg text-xs font-medium transition-colors",
                idx === currentQ
                  ? "bg-primary text-primary-foreground"
                  : answers[idx] !== null
                  ? "bg-primary/10 text-primary font-bold"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              {idx + 1}
            </button>
          ))}
        </div>

        {/* Submit Confirmation */}
        <AlertDialog open={submitConfirm} onOpenChange={setSubmitConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit Test?</AlertDialogTitle>
              <AlertDialogDescription>
                {answeredCount < questions.length ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-yellow-500 inline mr-1" />
                    You have {questions.length - answeredCount} unanswered question(s).
                    Unanswered questions will be marked as incorrect.
                  </>
                ) : (
                  "You have answered all questions. Are you sure you want to submit?"
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continue Test</AlertDialogCancel>
              <AlertDialogAction onClick={submitTest}>Submit Now</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // ─── SUBMITTING MODE ───
  if (viewMode === "submitting") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <h2 className="text-xl font-semibold">Submitting your test...</h2>
          <p className="text-muted-foreground">Please wait while we calculate your score.</p>
        </div>
      </div>
    )
  }

  // ─── RESULTS MODE ───
  if (viewMode === "results" && results) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/my-training")} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back to My Training
          </Button>
        </div>

        {/* Score Card */}
        <Card className={cn(
          "p-8 text-center",
          results.passed
            ? "border-green-300 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20"
            : "border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
        )}>
          <div className="flex flex-col items-center gap-4">
            <div className={cn(
              "h-20 w-20 rounded-full flex items-center justify-center",
              results.passed
                ? "bg-green-100 dark:bg-green-900/40"
                : "bg-red-100 dark:bg-red-900/40"
            )}>
              {results.passed
                ? <Trophy className="h-10 w-10 text-green-600 dark:text-green-400" />
                : <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
              }
            </div>
            <div>
              <h2 className="text-3xl font-bold">
                {results.score}/{results.total}
              </h2>
              <p className="text-lg text-muted-foreground">
                ({results.percentage}%)
              </p>
            </div>
            <Badge className={cn(
              "text-sm px-4 py-1",
              results.passed
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}>
              {results.passed ? "PASSED" : "FAILED"}
            </Badge>
            <p className="text-sm text-muted-foreground max-w-md">
              {results.passed
                ? "Great job! You've demonstrated a good understanding of the training material."
                : "You didn't meet the passing score of 70%. Review the material and try again."}
            </p>
          </div>
        </Card>

        {/* Review Answers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review Answers</CardTitle>
            <CardDescription>
              Review each question, your answer, and the correct answer.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {results.results.map((r, idx) => (
              <div key={idx} className="border rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Badge variant={r.isCorrect ? "default" : "destructive"} className="shrink-0 mt-0.5">
                    {r.isCorrect ? "Correct" : "Incorrect"}
                  </Badge>
                  <h4 className="text-sm font-medium">
                    <span className="text-muted-foreground">Q{idx + 1}.</span> {r.question}
                  </h4>
                </div>
                <div className="grid gap-1.5 ml-0 sm:ml-16">
                  {r.options.map((opt, optIdx) => (
                    <div
                      key={optIdx}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg text-sm",
                        optIdx === r.correctAnswer && "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
                        optIdx !== r.correctAnswer && optIdx === r.selectedAnswer && "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
                      )}
                    >
                      <span className="font-bold text-xs w-5">{OPTION_LABELS[optIdx]}</span>
                      <span>{opt}</span>
                      {optIdx === r.correctAnswer && <CheckCircle2 className="h-3.5 w-3.5 ml-auto shrink-0" />}
                      {optIdx === r.selectedAnswer && optIdx !== r.correctAnswer && <XCircle className="h-3.5 w-3.5 ml-auto shrink-0" />}
                    </div>
                  ))}
                </div>
                {r.explanation && (
                  <p className="text-xs text-muted-foreground ml-0 sm:ml-16 italic">
                    {r.explanation}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return null
}

const LEVEL_LABELS: Record<string, string> = {
  LOW: "Easy",
  MEDIUM: "Medium",
  HIGH: "Hard",
}
