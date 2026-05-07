"use client"

import React, { useState, useCallback, useRef, useEffect } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import { Button } from "@/components/ui/button"
import { FileText, Loader2, X, Download, ZoomIn, ZoomOut } from "lucide-react"

// Set up PDF.js worker from CDN
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfViewerInnerProps {
  pdfUrl: string
  topic: string
  onClose: () => void
}

export default function PdfViewerInner({ pdfUrl, topic, onClose }: PdfViewerInnerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [scale, setScale] = useState(1)
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages)
    setRenderedPages(new Set())
  }

  function onPageRenderSuccess(page: number) {
    setRenderedPages((prev) => new Set(prev).add(page))
  }

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 3)), [])
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.5)), [])

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [])

  // Download handler
  const handleDownload = useCallback(() => {
    const a = document.createElement("a")
    a.href = pdfUrl
    a.download = `${topic.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 50)}_Training.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [pdfUrl, topic])

  const isFullyRendered = numPages > 0 && renderedPages.size === numPages

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#E5E7EB] dark:bg-zinc-800">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-700 shrink-0 z-10 shadow-sm">
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-[#E85D04] flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-[10px] sm:text-xs">TH</span>
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-semibold truncate max-w-[130px] sm:max-w-[280px]">{topic}</h2>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {numPages > 0 ? `${numPages} page${numPages > 1 ? "s" : ""}` : "Loading..."}
            </p>
          </div>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={zoomOut} disabled={scale <= 0.5} title="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-[10px] sm:text-xs font-medium text-muted-foreground min-w-[36px] sm:min-w-[42px] text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={zoomIn} disabled={scale >= 3} title="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>

          <div className="w-px h-4 bg-gray-200 dark:bg-zinc-700 mx-0.5 sm:mx-1" />

          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={handleDownload} title="Download PDF">
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Scrollable PDF Pages ── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex flex-col items-center py-4 sm:py-8 px-2 sm:px-4 gap-4 sm:gap-6">
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-[#E85D04]" />
                <p className="text-sm text-muted-foreground">Loading PDF...</p>
              </div>
            }
            error={
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <FileText className="h-8 w-8 text-red-500" />
                <p className="text-sm text-red-600">Failed to load PDF</p>
              </div>
            }
          >
            {numPages > 0 &&
              Array.from({ length: numPages }, (_, i) => (
                <div
                  key={i}
                  className="bg-white shadow-lg rounded-sm w-full"
                  style={{ maxWidth: "816px" }}
                >
                  {/* Page number label */}
                  <div className="text-center py-1 text-[10px] sm:text-xs text-muted-foreground bg-gray-50 dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-700">
                    Page {i + 1} of {numPages}
                  </div>
                  <Page
                    pageNumber={i + 1}
                    scale={scale}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading={
                      <div className="flex items-center justify-center bg-white" style={{ minHeight: "400px" }}>
                        <div className="flex flex-col items-center gap-3">
                          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                          <span className="text-xs text-gray-400">Page {i + 1}...</span>
                        </div>
                      </div>
                    }
                    onRenderSuccess={() => onPageRenderSuccess(i + 1)}
                  />
                </div>
              ))}
          </Document>

          {/* End of document indicator */}
          {isFullyRendered && (
            <div className="py-6 text-center">
              <p className="text-xs text-muted-foreground">End of document</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
