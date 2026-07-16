"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  CircleUserRound,
  ClipboardList,
  ListMusic,
  Loader2,
  QrCode,
  UserCircle2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AssignmentDetailDialog } from "@/components/training/assignment-detail-dialog"
import {
  isTourDone,
  setTourDone,
  setLearningLanding,
} from "@/lib/learning-prefs"

const TOUR_STEPS = [
  {
    num: 1,
    title: "Open your Profile",
    narration:
      "You’re on the Percipio Home screen. Look at the bottom navigation bar and tap Profile (far right) to open your account menu.",
    image: "/learning/tour/step-1-home.jpg",
    highlight: "Tap Profile",
    icon: UserCircle2,
  },
  {
    num: 2,
    title: "Open Playlists",
    narration:
      "On your Profile page, scroll the menu and tap Playlists. That’s where your assigned training playlists live.",
    image: "/learning/tour/step-2-profile.jpg",
    highlight: "Tap Playlists",
    icon: ListMusic,
  },
  {
    num: 3,
    title: "Choose your playlist",
    narration:
      "On My Playlists, open the playlist assigned to you (your name or training title). Start the courses inside to complete your training.",
    image: "/learning/tour/step-3-playlists.jpg",
    highlight: "Choose your playlist",
    icon: CircleUserRound,
  },
] as const

type Assignment = {
  id: string
  userId: string
  title: string
  notes: string | null
  dueDate: string
  status: string
  completedAt: string | null
  createdAt?: string | null
  updatedAt?: string | null
  assignedBy?: { id: string; name: string } | null
}

export default function MyTrainingPage() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const [step, setStep] = useState(0)
  const [showTour, setShowTour] = useState(false)
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Assignment | null>(null)
  const isAdmin =
    session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN"

  useEffect(() => {
    setShowTour(!isTourDone())
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const res = await fetch("/api/training/assignments?mine=1", {
        credentials: "include",
        signal: controller.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.detail || "Failed to load")
      setAssignments(Array.isArray(data.assignments) ? data.assignments : [])
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "AbortError"
          ? "Timed out loading training — try again"
          : err instanceof Error
            ? err.message
            : "Failed to load training"
      toast.error(msg)
      setAssignments([])
    } finally {
      clearTimeout(timeout)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (sessionStatus === "authenticated") void load()
    else if (sessionStatus === "unauthenticated") setLoading(false)
  }, [sessionStatus, load])

  const current = TOUR_STEPS[step]

  const finishTour = (dontShowAgain: boolean) => {
    if (dontShowAgain) setTourDone(true)
    setShowTour(false)
  }

  const markDone = async (id: string) => {
    setMarkingId(id)
    try {
      const res = await fetch("/api/training/assignments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to mark done")
      toast.success("Marked as done — admins notified")
      setDetail(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed")
    } finally {
      setMarkingId(null)
    }
  }

  return (
    <div className="th-page-enter space-y-8 max-w-4xl">
      <PageHeader
        title="My Training"
        description="Percipio tour and your assigned training with due dates."
        showBack={false}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              setLearningLanding("qr")
              router.push("/dashboard/training/qr")
            }}
          >
            <QrCode className="h-4 w-4" />
            Back to QR setup
          </Button>
          {isAdmin && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => router.push("/dashboard/training/assign")}
            >
              <ClipboardList className="h-4 w-4" />
              Assign training
            </Button>
          )}
        </div>
      </PageHeader>

      {showTour && (
        <section className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Percipio tour · Step {current.num} of {TOUR_STEPS.length}
              </p>
              <h2 className="text-lg font-semibold tracking-tight mt-0.5">{current.title}</h2>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <current.icon className="h-3.5 w-3.5" />
                {current.highlight}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Close tour"
                onClick={() => finishTour(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid lg:grid-cols-[minmax(0,280px)_1fr] gap-0">
            <div className="bg-muted/30 p-4 sm:p-5 flex justify-center items-start border-b lg:border-b-0 lg:border-r border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.image}
                alt={`Percipio tour step ${current.num}: ${current.title}`}
                className="w-full max-w-[240px] rounded-xl border border-border shadow-sm object-cover"
              />
            </div>
            <div className="p-5 sm:p-6 flex flex-col justify-between gap-6">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">{current.narration}</p>
                <div className="flex gap-2">
                  {TOUR_STEPS.map((s, i) => (
                    <button
                      key={s.num}
                      type="button"
                      onClick={() => setStep(i)}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        i === step ? "bg-primary" : i < step ? "bg-primary/40" : "bg-muted"
                      }`}
                      aria-label={`Go to step ${s.num}`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={step === 0}
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                >
                  Previous
                </Button>
                {step < TOUR_STEPS.length - 1 ? (
                  <Button type="button" onClick={() => setStep((s) => s + 1)}>
                    Next step
                  </Button>
                ) : (
                  <Button type="button" onClick={() => finishTour(true)}>
                    Tour done
                  </Button>
                )}
                <Button type="button" variant="secondary" onClick={() => finishTour(true)}>
                  Don&apos;t show again
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {!showTour && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowTour(true)}>
            Show Percipio tour
          </Button>
        </div>
      )}

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Your assigned training</h2>
          <p className="text-sm text-muted-foreground">
            Complete each item in Percipio, then mark it done here.
          </p>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 flex justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading assignments…
          </div>
        ) : assignments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No training assigned to you yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-border bg-card px-3 py-2.5 flex items-center gap-2"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setDetail(a)}
                  aria-label={`Open details for ${a.title}`}
                >
                  <h3 className="font-medium tracking-tight truncate text-sm">{a.title}</h3>
                  {a.assignedBy?.name ? (
                    <p className="text-xs text-muted-foreground truncate">
                      Assigned by {a.assignedBy.name}
                    </p>
                  ) : null}
                </button>
                {a.status === "OVERDUE" && (
                  <Badge variant="destructive" className="text-[10px] shrink-0">
                    Overdue
                  </Badge>
                )}
                {a.status === "DONE" && (
                  <Badge className="bg-success/15 text-success border-0 text-[10px] shrink-0">
                    Done
                  </Badge>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 px-2.5"
                  onClick={() => setDetail(a)}
                >
                  Open
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AssignmentDetailDialog
        assignment={detail}
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null)
        }}
        showAssignee={false}
        onMarkDone={(id) => void markDone(id)}
        marking={!!detail && markingId === detail.id}
      />
    </div>
  )
}
