"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, Loader2, FileText } from "lucide-react"
import { toast } from "sonner"

interface DownloadPdfButtonProps {
  topic: string
  content: string
  generatedBy?: string
  createdAt?: string
  variant?: "default" | "outline" | "ghost"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
}

export function DownloadPdfButton({
  topic,
  content,
  generatedBy,
  createdAt,
  variant = "outline",
  size = "sm",
  className = "",
}: DownloadPdfButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleDownload = async () => {
    setLoading(true)
    try {
      // Dynamically import @react-pdf/renderer (client-side only)
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

      // Create download link
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${topic.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 50)}_Training.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success("PDF downloaded successfully!")
    } catch (err: any) {
      console.error("PDF generation failed:", err)
      toast.error("Failed to generate PDF. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleDownload}
      disabled={loading || !content}
      className={`gap-2 ${className}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileText className="h-4 w-4" />
      )}
      {loading ? "Generating PDF..." : "Download PDF"}
    </Button>
  )
}
