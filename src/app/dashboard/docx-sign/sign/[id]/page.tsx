"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { ArrowLeft, Loader2, Save, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { PdfA4Viewer } from "@/components/docx-sign/pdf-a4-viewer"
import { SignaturePad } from "@/components/docx-sign/signature-pad"
import { safeText } from "@/lib/utils"

type Assignment = {
  id: string
  status: string
  hasSignature: boolean
  resignNote: string | null
  document: { id: string; title: string; fileName: string }
}

export default function DocxSignSignPage() {
  const params = useParams()
  const id = typeof params?.id === "string" ? params.id : ""
  const router = useRouter()
  const { status: sessionStatus } = useSession()
  const [row, setRow] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [signature, setSignature] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch("/api/docx-sign/assignments?mine=1", {
        credentials: "include",
        cache: "no-store",
      })
      if (!res.ok) throw new Error("load failed")
      const j = await res.json()
      const found = (Array.isArray(j.assignments) ? j.assignments : []).find(
        (a: Assignment) => a.id === id
      )
      if (!found) {
        toast.error("Assignment not found")
        router.replace("/dashboard/docx-sign/my")
        return
      }
      if (found.status === "SIGNED") {
        toast.message("Already signed")
        router.replace("/dashboard/docx-sign/my")
        return
      }
      setRow(found)
    } catch {
      toast.error("Failed to load document")
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.replace("/login")
      return
    }
    if (sessionStatus === "authenticated") void load()
  }, [sessionStatus, load, router])

  const saveSignature = async () => {
    if (!signature) {
      toast.error("Draw your signature first")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/docx-sign/assignments", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "save_signature", signatureData: signature }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(j?.error || "Could not save signature")
        return
      }
      toast.success("Signature saved")
    } catch {
      toast.error("Could not save signature")
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    if (!signature) {
      toast.error("Draw and save your signature, then submit")
      return
    }
    setSubmitting(true)
    try {
      // Persist signature then submit stamped PDF
      const saveRes = await fetch("/api/docx-sign/assignments", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "save_signature", signatureData: signature }),
      })
      if (!saveRes.ok) {
        const j = await saveRes.json().catch(() => null)
        toast.error(j?.error || "Could not save signature")
        return
      }
      const res = await fetch("/api/docx-sign/assignments", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "submit", signatureData: signature }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(j?.error || "Submit failed")
        return
      }
      toast.success("Signed and submitted")
      router.replace("/dashboard/docx-sign/my")
    } catch {
      toast.error("Submit failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!row) return null

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-1 sm:px-0 pb-10">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={() => router.push("/dashboard/docx-sign/my")}
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-semibold truncate">{safeText(row.document.title)}</h1>
          <p className="text-[11px] text-muted-foreground truncate">{safeText(row.document.fileName)}</p>
        </div>
      </div>

      {row.resignNote && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">
          Re-sign requested: {row.resignNote}
        </div>
      )}

      <PdfA4Viewer url={`/api/docx-sign/assignments/${id}/file?kind=source`} />

      <section className="rounded-2xl border bg-card/70 p-3 sm:p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Signature</h2>
          <p className="text-[11px] text-muted-foreground">
            Sign in the box, save, then submit to generate your signed PDF.
          </p>
        </div>
        <SignaturePad value={signature} onChange={setSignature} disabled={saving || submitting} />
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => void saveSignature()}
            disabled={saving || submitting || !signature}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save signature
          </Button>
          <Button
            type="button"
            className="h-10"
            onClick={() => void submit()}
            disabled={submitting || !signature}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
            Submit signed document
          </Button>
        </div>
      </section>
    </div>
  )
}
