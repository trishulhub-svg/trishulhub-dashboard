"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"

type Props = {
  /** Authenticated PDF URL (assignment file endpoint) */
  url: string
}

/**
 * A4-style page-by-page PDF viewer (pdfjs). Responsive for mobile + desktop.
 */
export function PdfA4Viewer({ url }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setPage(1)
    setTotal(0)
    pdfRef.current = null

    ;(async () => {
      try {
        const pdfjs = await import("pdfjs-dist")
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        const res = await fetch(url, { credentials: "include", cache: "no-store" })
        if (!res.ok) throw new Error("Could not load PDF")
        const buf = await res.arrayBuffer()
        const doc = await pdfjs.getDocument({ data: buf }).promise
        if (cancelled) return
        pdfRef.current = doc
        setTotal(doc.numPages)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Failed to open PDF")
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [url])

  useEffect(() => {
    const doc = pdfRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas || total < 1) return
    let cancelled = false

    ;(async () => {
      try {
        const pdfPage = await doc.getPage(page)
        if (cancelled) return
        const base = pdfPage.getViewport({ scale: 1 })
        const containerW = canvas.parentElement?.clientWidth || 640
        // Fit width; A4 aspect preserved by viewport
        const scale = Math.min(containerW / base.width, 2.2)
        const viewport = pdfPage.getViewport({ scale })
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.floor(viewport.width * dpr)
        canvas.height = Math.floor(viewport.height * dpr)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        await pdfPage.render({ canvasContext: ctx, viewport, canvas }).promise
      } catch {
        if (!cancelled) setError("Failed to render page")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [page, total, loading])

  if (loading) {
    return (
      <div className="flex min-h-[320px] items-center justify-center rounded-xl border bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-4 text-sm text-destructive">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground tabular-nums">
          Page {page} of {total} · A4 view
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={page >= total}
            onClick={() => setPage((p) => Math.min(total, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-[#f3f4f6] dark:bg-zinc-900/60 p-2 sm:p-4 flex justify-center">
        <canvas
          ref={canvasRef}
          className="max-w-full shadow-md bg-white rounded-sm"
          style={{ aspectRatio: "210 / 297" }}
        />
      </div>
      {page === total && (
        <p className="text-[11px] text-center text-emerald-700 dark:text-emerald-400">
          Last page — sign in the box below when ready
        </p>
      )}
    </div>
  )
}
