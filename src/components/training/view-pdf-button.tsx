"use client"

import React, { useState, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { FileText, Loader2, X, Download, ZoomIn, ZoomOut, RotateCw } from "lucide-react"
import { toast } from "sonner"

interface ViewPdfButtonProps {
  topic: string
  content: string
  generatedBy?: string
  createdAt?: string
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm" | "lg"
  className?: string
}

export function ViewPdfButton({
  topic,
  content,
  generatedBy,
  createdAt,
  variant = "default",
  size = "lg",
  className = "",
}: ViewPdfButtonProps) {
  const [loading, setLoading] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [scale, setScale] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)

  const generatePdf = useCallback(async () => {
    setLoading(true)
    try {
      const { pdf } = await import("@react-pdf/renderer")
      const TrainingPdfDocument = (await import("./training-pdf-document")).default

      const blob = await pdf(
        <TrainingPdfDocument
          topic={topic}
          content={content}
          generatedBy={generatedBy}
          createdAt={createdAt}
        />
      ).toBlob()

      const url = URL.createObjectURL(blob)
      setPdfUrl(url)
    } catch (err: any) {
      console.error("PDF generation failed:", err)
      toast.error("Failed to generate PDF. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [topic, content, generatedBy, createdAt])

  const closePdf = useCallback(() => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }
    setScale(1)
  }, [pdfUrl])

  // Handle ESC key
  useEffect(() => {
    if (!pdfUrl) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePdf()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [pdfUrl, closePdf])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (pdfUrl) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [pdfUrl])

  const handleDownload = useCallback(() => {
    if (!pdfUrl) return
    const a = document.createElement("a")
    a.href = pdfUrl
    a.download = `${topic.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 50)}_Training.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [pdfUrl, topic])

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 3)), [])
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.5)), [])

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={generatePdf}
        disabled={loading || !content}
        className={`gap-2 ${className}`}
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <FileText className="h-5 w-5" />
        )}
        {loading ? "Generating PDF..." : "View PDF"}
      </Button>

      {/* Full-screen PDF Viewer Modal */}
      {pdfUrl && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-black/90" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          {/* Top toolbar */}
          <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 shrink-0 z-10">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-[#E85D04] flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-[10px] sm:text-xs">TH</span>
              </div>
              <div className="min-w-0">
                <h2 className="text-xs sm:text-sm font-semibold truncate max-w-[140px] sm:max-w-[300px]">{topic}</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Trishulhub Training Academy</p>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {/* Zoom controls */}
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={zoomOut} title="Zoom out">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-[10px] sm:text-xs font-medium text-muted-foreground min-w-[40px] text-center tabular-nums">
                {Math.round(scale * 100)}%
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={zoomIn} title="Zoom in">
                <ZoomIn className="h-4 w-4" />
              </Button>

              <div className="w-px h-5 bg-gray-200 dark:bg-zinc-700 mx-0.5 sm:mx-1" />

              {/* Download */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9"
                onClick={handleDownload}
                title="Download PDF"
              >
                <Download className="h-4 w-4" />
              </Button>

              {/* Close */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 sm:h-9 sm:w-9"
                onClick={closePdf}
                title="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Scrollable PDF content area */}
          <div
            ref={containerRef}
            className="flex-1 overflow-auto overscroll-contain"
            style={{
              WebkitOverflowScrolling: "touch",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            <div className="flex justify-center py-4 sm:py-6 min-h-full">
              <div
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: "top center",
                  width: scale === 1 ? "100%" : undefined,
                  maxWidth: scale === 1 ? "816px" : undefined,
                }}
              >
                <iframe
                  src={pdfUrl}
                  title={topic}
                  className="w-full border-0 bg-white rounded-lg shadow-2xl"
                  style={{
                    height: "calc(100vh - 120px)",
                    minHeight: "600px",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
