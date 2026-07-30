"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { ArrowLeft, Loader2, PenLine, Save, Send, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { PdfA4Viewer } from "@/components/docx-sign/pdf-a4-viewer"
import { SignaturePad } from "@/components/docx-sign/signature-pad"
import { cn, safeText } from "@/lib/utils"

type Assignment = {
  id: string
  status: string
  hasSignature: boolean
  resignNote: string | null
  document: { id: string; title: string; fileName: string }
}

type SigMode = "choose" | "saved" | "draw"

export default function DocxSignSignPage() {
  const params = useParams()
  const id = typeof params?.id === "string" ? params.id : ""
  const router = useRouter()
  const { status: sessionStatus } = useSession()
  const [row, setRow] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [signature, setSignature] = useState<string | null>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(null)
  const [hasSavedSignature, setHasSavedSignature] = useState(false)
  const [sigMode, setSigMode] = useState<SigMode>("draw")
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [aRes, sRes] = await Promise.all([
        fetch(`/api/docx-sign/assignments?id=${encodeURIComponent(id)}`, {
          credentials: "include",
          cache: "no-store",
        }),
        fetch("/api/docx-sign/my-signature?meta=1", {
          credentials: "include",
          cache: "no-store",
        }),
      ])
      if (!aRes.ok) throw new Error("load failed")
      const j = await aRes.json()
      const found = (j.assignment || null) as Assignment | null
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

      if (sRes.ok) {
        const sj = await sRes.json()
        const has = Boolean(sj.hasSignature)
        setHasSavedSignature(has)
        setSavedSignature(null)
        setSigMode(has ? "choose" : "draw")
      }
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

  const useSavedSignature = async () => {
    setSaving(true)
    try {
      let sig = savedSignature
      if (!sig) {
        const res = await fetch("/api/docx-sign/my-signature", {
          credentials: "include",
          cache: "no-store",
        })
        if (!res.ok) throw new Error("sig")
        const sj = await res.json()
        sig =
          typeof sj.signatureData === "string" && sj.signatureData.startsWith("data:image/png")
            ? sj.signatureData
            : null
        setSavedSignature(sig)
        setHasSavedSignature(Boolean(sj.hasSignature && sig))
      }
      if (!sig) {
        toast.error("No saved signature found")
        setSigMode("draw")
        return
      }
      setSignature(sig)
      setSigMode("saved")
      toast.success("Using your saved signature")
    } catch {
      toast.error("Could not load saved signature")
    } finally {
      setSaving(false)
    }
  }

  const startNewSignature = () => {
    setSignature(null)
    setSigMode("draw")
  }

  const saveSignature = async () => {
    if (!signature) {
      toast.error("Draw or select your signature first")
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
      setSavedSignature(signature)
      setHasSavedSignature(true)
      toast.success("Signature saved for this contract and future use")
    } catch {
      toast.error("Could not save signature")
    } finally {
      setSaving(false)
    }
  }

  const submit = async () => {
    if (!signature) {
      toast.error("Choose a saved signature or draw a new one, then submit")
      return
    }
    setSubmitting(true)
    try {
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
        body: JSON.stringify({
          id,
          action: "submit",
          signatureData: signature,
          signerTimeZone:
            typeof Intl !== "undefined"
              ? Intl.DateTimeFormat().resolvedOptions().timeZone
              : null,
        }),
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
          <h2 className="text-sm font-semibold">Your signature (Accepted by)</h2>
          <p className="text-[11px] text-muted-foreground">
            Use a signature you saved earlier, or draw a new one. The signed PDF will show the Authorized
            Person signature plus yours, with UK date/time (and your local time if outside the UK), and your IP on the bottom line.
          </p>
        </div>

        {hasSavedSignature && (
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant={sigMode === "saved" ? "default" : "outline"}
              className="h-10 flex-1"
              onClick={useSavedSignature}
              disabled={saving || submitting}
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Use saved signature
            </Button>
            <Button
              type="button"
              variant={sigMode === "draw" ? "default" : "outline"}
              className="h-10 flex-1"
              onClick={startNewSignature}
              disabled={saving || submitting}
            >
              <PenLine className="h-4 w-4 mr-1.5" />
              Draw new signature
            </Button>
          </div>
        )}

        {sigMode === "choose" && hasSavedSignature && (
          <p className="text-[11px] text-muted-foreground">
            Choose <span className="font-medium text-foreground">Use saved signature</span> or{" "}
            <span className="font-medium text-foreground">Draw new signature</span> to continue.
          </p>
        )}

        {sigMode === "saved" && signature && (
          <div className="rounded-xl border bg-white p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
              Saved signature preview
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signature}
              alt="Saved signature"
              className="h-28 w-full object-contain bg-white"
            />
          </div>
        )}

        {sigMode === "draw" && (
          <SignaturePad
            value={signature}
            onChange={setSignature}
            disabled={saving || submitting}
          />
        )}

        <div className={cn("flex flex-col sm:flex-row gap-2", !signature && "opacity-90")}>
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
