"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { FilePenLine, Loader2, PenLine, Download, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn, safeText } from "@/lib/utils"

type Assignment = {
  id: string
  status: string
  signedAt: string | null
  resignNote: string | null
  hasSignedPdf: boolean
  createdAt: string
  document: { id: string; title: string; fileName: string }
  assignedBy: { id: string; name: string }
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30",
  SIGNED: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
  RESIGN_REQUESTED: "bg-rose-500/15 text-rose-800 dark:text-rose-300 border-rose-500/30",
}

export default function DocxSignMyPage() {
  const { status } = useSession()
  const router = useRouter()
  const [rows, setRows] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/docx-sign/assignments?mine=1", {
        credentials: "include",
        cache: "no-store",
      })
      if (!res.ok) {
        toast.error("Failed to load documents")
        return
      }
      const j = await res.json()
      setRows(Array.isArray(j.assignments) ? j.assignments : [])
    } catch {
      toast.error("Failed to load documents")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login")
      return
    }
    if (status === "authenticated") void load()
  }, [status, load, router])

  if (status === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const needsAction = rows.filter((r) => r.status !== "SIGNED")

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-1 sm:px-0">
      <div className="rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-sky-500/[0.06] p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sky-700 dark:text-sky-400 mb-1">
              <FilePenLine className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">My contracts</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Docx Sign</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Read each page, sign in the box, then submit. {needsAction.length} waiting for you.
            </p>
          </div>
          <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => void load()}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No documents assigned to you yet.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border bg-card/70 px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{safeText(a.document.title)}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  From {safeText(a.assignedBy?.name)} · {new Date(a.createdAt).toLocaleDateString()}
                  {a.signedAt ? ` · signed ${new Date(a.signedAt).toLocaleString()}` : ""}
                </p>
                {a.resignNote && a.status === "RESIGN_REQUESTED" && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">
                    Re-sign requested: {a.resignNote}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLE[a.status] || "")}>
                  {a.status.replace("_", " ")}
                </Badge>
                {a.status === "SIGNED" ? (
                  a.hasSignedPdf && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() =>
                        window.open(
                          `/api/docx-sign/assignments/${a.id}/file?kind=signed&download=1`,
                          "_blank"
                        )
                      }
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      Download
                    </Button>
                  )
                ) : (
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => router.push(`/dashboard/docx-sign/sign/${a.id}`)}
                  >
                    <PenLine className="h-3.5 w-3.5 mr-1" />
                    {a.status === "RESIGN_REQUESTED" ? "Sign again" : "Review & sign"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
