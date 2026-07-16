"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import {
  BookOpen,
  Download,
  QrCode,
  Smartphone,
  ScanLine,
  Info,
  ExternalLink,
  Upload,
  Trash2,
  RefreshCw,
  Loader2,
  Shield,
  Clock,
  ImagePlus,
  Sparkles,
  ArrowRight,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { formatDateTime } from "@/lib/format"

const ANDROID_URL =
  "https://play.google.com/store/apps/details?id=com.skillsoft.Percipio"
const IOS_URL =
  "https://apps.apple.com/gb/app/skillsoft-percipio/id1240149414"

const STEPS = [
  {
    num: "01",
    title: "Download the Percipio app",
    body: "Install Skillsoft Percipio on your phone from the official store for your device.",
    icon: Download,
  },
  {
    num: "02",
    title: "Select Login with QR code",
    body: "Open the app and choose the option to log in with a QR code.",
    icon: Smartphone,
  },
  {
    num: "03",
    title: "Open the QR code and scan",
    body: "Tap the button below to reveal the login QR, then scan it with your phone.",
    icon: ScanLine,
  },
] as const

type TrainingQr = {
  id: string
  imageData: string
  mimeType: string
  createdAt: string
  updatedAt: string
  uploadedBy?: { id: string; name: string } | null
}

type PendingRequester = {
  id: string
  createdAt: string
  user: { id: string; name: string; email: string }
}

type QrState = {
  qr: TrainingQr | null
  hasPendingRequest: boolean
  pendingRequestAt: string | null
  pendingCount?: number
  pendingRequesters?: PendingRequester[]
  isSuperAdmin: boolean
}

function StoreButton({
  href,
  label,
  sublabel,
  icon,
}: {
  href: string
  label: string
  sublabel: string
  icon: ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-3 rounded-xl border border-border bg-foreground text-background px-4 py-3 min-w-[168px] transition-all duration-200 hover:opacity-90 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span className="shrink-0 opacity-95">{icon}</span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[10px] uppercase tracking-wider opacity-70">
          {sublabel}
        </span>
        <span className="text-sm font-semibold tracking-tight">{label}</span>
      </span>
      <ExternalLink className="h-3.5 w-3.5 ml-auto opacity-0 group-hover:opacity-60 transition-opacity" />
    </a>
  )
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result)
      else reject(new Error("Failed to read file"))
    }
    reader.onerror = () => reject(new Error("Failed to read file"))
    reader.readAsDataURL(file)
  })
}

export default function LearningPage() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const [qrOpen, setQrOpen] = useState(false)
  const [state, setState] = useState<QrState | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isSa =
    state?.isSuperAdmin ??
    (session?.user?.role === "SUPER_ADMIN")

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/training/qr")
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || "Failed to load QR")
      }
      const data = await res.json()
      setState(data)
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : "Failed to load training QR")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (sessionStatus === "authenticated") load()
    else if (sessionStatus === "unauthenticated") setLoading(false)
  }, [sessionStatus, load])

  // Deep-link from notifications: #manage-qr / #open-qr
  useEffect(() => {
    if (loading) return
    if (typeof window === "undefined") return

    const applyHash = () => {
      const hash = window.location.hash
      if (hash === "#manage-qr") {
        document.getElementById("manage-qr")?.scrollIntoView({ behavior: "smooth", block: "start" })
      } else if (hash === "#open-qr") {
        document.getElementById("open-qr")?.scrollIntoView({ behavior: "smooth", block: "center" })
        if (state?.qr?.imageData) setQrOpen(true)
      }
    }

    applyHash()
    window.addEventListener("hashchange", applyHash)
    return () => window.removeEventListener("hashchange", applyHash)
  }, [loading, state?.qr?.imageData])

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (PNG, JPEG, WebP, or GIF)")
      return
    }
    if (file.size > 2_500_000) {
      toast.error("Image must be under 2.5 MB")
      return
    }
    setUploading(true)
    try {
      const imageData = await fileToDataUrl(file)
      const res = await fetch("/api/training/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed")

      const notified = data.notifiedCount ?? 0
      toast.success(
        notified > 0
          ? `QR uploaded. Notified ${notified} requester${notified === 1 ? "" : "s"}.`
          : "QR uploaded. Latest code is now visible to the team."
      )
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch("/api/training/qr", { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Delete failed")
      toast.success("Training QR removed")
      setDeleteOpen(false)
      setQrOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setDeleting(false)
    }
  }

  const handleRequest = async () => {
    setRequesting(true)
    try {
      const res = await fetch("/api/training/qr/request", { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Request failed")
      toast.success(data.message || "Request sent to Super Admin")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed")
    } finally {
      setRequesting(false)
    }
  }

  const qrSrc = state?.qr?.imageData || null

  return (
    <div className="th-page-enter space-y-8 max-w-3xl">
      <PageHeader
        title="Learning"
        description="Access Percipio training on your phone in three steps."
        showBack={false}
      />

      {/* Intro */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card px-6 py-8 sm:px-10 sm:py-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.55]"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 0% 0%, color-mix(in oklch, var(--primary) 18%, transparent), transparent 55%), radial-gradient(ellipse 70% 50% at 100% 100%, color-mix(in oklch, var(--info) 12%, transparent), transparent 50%)",
          }}
        />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="th-stat-icon shrink-0">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-lg sm:text-xl font-semibold tracking-tight">
              Percipio training login
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
              Download the app, choose QR login, then scan the latest code here.
              If it stops working, request a new one — Super Admin will refresh it.
            </p>
          </div>
        </div>
      </section>

      {/* App setup done → tour + assignments */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="th-stat-icon shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-base font-semibold tracking-tight">App setup done?</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Open a short tour of Percipio (Profile → Playlists → choose yours) and
            see your assigned training with due dates.
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          className="gap-2 shrink-0 shadow-sm"
          onClick={() => router.push("/dashboard/training/setup")}
        >
          App setup done
          <ArrowRight className="h-4 w-4" />
        </Button>
      </section>

      {/* Super Admin manage panel */}
      {isSa && (
        <section
          id="manage-qr"
          className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4 scroll-mt-24"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <h3 className="text-base font-semibold tracking-tight">
                  Manage training QR
                </h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Upload or replace the Percipio Smart App Login QR. Only people who
                requested a new code since the last upload get notified.
              </p>
            </div>
            {(state?.pendingCount ?? 0) > 0 && (
              <Badge variant="secondary" className="gap-1.5">
                <Clock className="h-3 w-3" />
                {state?.pendingCount} pending
              </Badge>
            )}
          </div>

          {(state?.pendingRequesters?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border/80 bg-muted/40 px-4 py-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Waiting for a new QR
              </p>
              <ul className="space-y-1.5">
                {state!.pendingRequesters!.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="font-medium truncate">
                      {r.user.name || r.user.email}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDateTime(r.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleUpload(file)
              }}
            />
            <Button
              type="button"
              className="gap-2"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : state?.qr ? (
                <Upload className="h-4 w-4" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              {state?.qr ? "Replace QR" : "Upload QR"}
            </Button>
            {state?.qr && (
              <Button
                type="button"
                variant="outline"
                className="gap-2 text-destructive hover:text-destructive"
                disabled={deleting}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            )}
          </div>

          {state?.qr && (
            <p className="text-xs text-muted-foreground">
              Current QR uploaded{" "}
              {state.qr.uploadedBy?.name
                ? `by ${state.qr.uploadedBy.name} · `
                : ""}
              {formatDateTime(state.qr.updatedAt || state.qr.createdAt)}
            </p>
          )}
        </section>
      )}

      {/* Steps */}
      <ol className="space-y-4">
        {STEPS.map((step, index) => {
          const Icon = step.icon
          return (
            <li
              key={step.num}
              className="rounded-2xl border border-border bg-card p-5 sm:p-6 animate-login-fade-up"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <div className="flex gap-4 sm:gap-5">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold tracking-wide">
                    {step.num}
                  </span>
                  {index < STEPS.length - 1 && (
                    <span className="hidden sm:block w-px flex-1 min-h-[12px] bg-border" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <h3 className="text-base font-semibold tracking-tight">
                        {step.title}
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed pl-6">
                      {step.body}
                    </p>
                  </div>

                  {step.num === "01" && (
                    <div className="flex flex-wrap gap-3 pl-0 sm:pl-6">
                      <StoreButton
                        href={ANDROID_URL}
                        sublabel="Get it on"
                        label="Google Play"
                        icon={
                          <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
                            <path
                              fill="currentColor"
                              d="M3.6 2.3c-.3.2-.6.6-.6 1.1v17.2c0 .5.3.9.6 1.1l9.8-9.7L3.6 2.3zm12.1 7.1L5.1 20.8l9.6-5.4 1-5.99zm.7-.4l1.9 1.1c.9.5.9 1.4 0 1.9l-1.9 1.1-1.2-1.2 1.2-1.2zm-1.5-.4L5.1 3.2l10.8 6.05z"
                            />
                          </svg>
                        }
                      />
                      <StoreButton
                        href={IOS_URL}
                        sublabel="Download on the"
                        label="App Store"
                        icon={
                          <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
                            <path
                              fill="currentColor"
                              d="M16.5 3.2c.9-1.1 1.5-2.6 1.3-4.1-1.3.1-2.8.9-3.7 2-.8.9-1.6 2.4-1.4 3.8 1.5.1 2.9-.7 3.8-1.7zM20.8 17.4c-.6 1.3-.9 1.9-1.7 3-.1.2-1.1 1.6-2.4 1.6-1.1 0-1.4-.7-2.9-.7s-1.9.7-2.9.7c-1.3 0-2.2-1.5-3.1-2.9-1.8-2.7-3.2-7.6-1.3-10.9.9-1.6 2.5-2.6 4.2-2.6 1.2 0 2.3.8 2.9.8s2-.9 3.5-.8c.6 0 2.3.2 3.4 1.8-3 1.7-2.5 6.1.3 7.3z"
                            />
                          </svg>
                        }
                      />
                    </div>
                  )}

                  {step.num === "03" && (
                    <div id="open-qr" className="pl-0 sm:pl-6 space-y-3 scroll-mt-24">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="lg"
                          className="gap-2 shadow-sm"
                          disabled={loading || !qrSrc}
                          onClick={() => setQrOpen(true)}
                        >
                          {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <QrCode className="h-4 w-4" />
                          )}
                          Open QR code
                        </Button>
                        {!isSa && (
                          <Button
                            type="button"
                            size="lg"
                            variant="outline"
                            className="gap-2"
                            disabled={requesting || state?.hasPendingRequest}
                            onClick={() => void handleRequest()}
                          >
                            {requesting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                            {state?.hasPendingRequest
                              ? "Request sent"
                              : "Request new QR"}
                          </Button>
                        )}
                        {isSa && !state?.qr && (
                          <Button
                            type="button"
                            size="lg"
                            variant="outline"
                            className="gap-2"
                            disabled={uploading}
                            onClick={() => fileRef.current?.click()}
                          >
                            <ImagePlus className="h-4 w-4" />
                            Upload QR first
                          </Button>
                        )}
                      </div>
                      {!loading && !qrSrc && (
                        <p className="text-sm text-muted-foreground">
                          No QR is available yet.
                          {isSa
                            ? " Upload one above so the team can scan it."
                            : " Request a new QR and Super Admin will upload one shortly."}
                        </p>
                      )}
                      {state?.hasPendingRequest && !isSa && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          Waiting for Super Admin
                          {state.pendingRequestAt
                            ? ` · requested ${formatDateTime(state.pendingRequestAt)}`
                            : ""}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 space-y-2">
            <DialogTitle className="text-xl tracking-tight">
              Smart App Login
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Scan this code using your device to quickly log in to the Percipio
              app.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 flex justify-center">
            <div className="rounded-xl border border-border bg-white p-4 sm:p-5 shadow-sm animate-login-scale-in">
              {qrSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrSrc}
                  alt="Percipio Smart App Login QR code"
                  width={280}
                  height={280}
                  className="h-[220px] w-[220px] sm:h-[280px] sm:w-[280px] object-contain"
                />
              ) : (
                <div className="h-[220px] w-[220px] sm:h-[280px] sm:w-[280px] flex items-center justify-center text-sm text-muted-foreground">
                  No QR available
                </div>
              )}
            </div>
          </div>

          <div className="px-6 pb-6 space-y-3">
            <div className="flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed">
              <Info className="h-4 w-4 shrink-0 mt-0.5 text-info" />
              <p>
                This QR code grants access to training. Please don&apos;t share
                it with anyone outside your team. If it doesn&apos;t work, close
                this and tap Request new QR.
              </p>
            </div>
            {!isSa && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 w-full sm:w-auto"
                disabled={requesting || state?.hasPendingRequest}
                onClick={() => void handleRequest()}
              >
                {requesting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {state?.hasPendingRequest ? "Request sent" : "Request new QR"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete training QR?</AlertDialogTitle>
            <AlertDialogDescription>
              The current QR will be removed for everyone until you upload a new
              one. Pending requests stay open so requesters still get notified
              after your next upload.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete QR"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
