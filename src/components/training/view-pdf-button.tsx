"use client"

import React, { useState, useCallback, lazy, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"

// Lazy load the PDF viewer to avoid SSR issues with pdfjs
const PdfViewerInner = lazy(() => import("./pdf-viewer-inner"))

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

      setPdfUrl(URL.createObjectURL(blob))
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
  }, [pdfUrl])

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

      {/* Full-screen PDF Viewer (loaded lazily) */}
      {pdfUrl && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#E5E7EB] dark:bg-zinc-800">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-[#E85D04]" />
                <p className="text-sm text-muted-foreground">Preparing PDF viewer...</p>
              </div>
            </div>
          }
        >
          <PdfViewerInner
            pdfUrl={pdfUrl}
            topic={topic}
            onClose={closePdf}
          />
        </Suspense>
      )}
    </>
  )
}
