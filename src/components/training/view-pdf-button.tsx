"use client"

import React, { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { FileText, Loader2, X } from "lucide-react"
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

      {/* Full-screen PDF Viewer Modal */}
      {pdfUrl && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-[#E85D04] flex items-center justify-center shrink-0">
                <span className="text-white font-bold text-xs">TH</span>
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold truncate">{topic}</h2>
                <p className="text-xs text-muted-foreground">
                  Trishulhub Training Academy
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Download option inside the viewer */}
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:flex gap-1.5 text-xs"
                onClick={() => {
                  const a = document.createElement("a")
                  a.href = pdfUrl
                  a.download = `${topic.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 50)}_Training.pdf`
                  document.body.appendChild(a)
                  a.click()
                  document.body.removeChild(a)
                }}
              >
                <FileText className="h-3.5 w-3.5" />
                Download
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={closePdf}
                className="gap-1.5"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Close</span>
              </Button>
            </div>
          </div>

          {/* PDF iframe */}
          <div className="flex-1 relative">
            <iframe
              src={pdfUrl}
              className="absolute inset-0 w-full h-full border-0 bg-white"
              title={topic}
            />
          </div>
        </div>
      )}
    </>
  )
}
