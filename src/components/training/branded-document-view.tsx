"use client"

import React from "react"
import ReactMarkdown from "react-markdown"
import { FileText, Calendar, Shield } from "lucide-react"

interface BrandedDocumentViewProps {
  topic: string
  content: string
  generatedBy?: string
  createdAt?: string
  imageUrls?: string[]
  children?: React.ReactNode
}

export function BrandedDocumentView({
  topic,
  content,
  generatedBy,
  createdAt,
  imageUrls = [],
  children,
}: BrandedDocumentViewProps) {
  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

  return (
    <div className="w-full">
      {/* Branded document container - styled like a real PDF */}
      <div className="bg-white dark:bg-zinc-950 rounded-xl shadow-lg border border-gray-200 dark:border-zinc-800 overflow-hidden">
        {/* ── Branded Header Bar ── */}
        <div className="bg-gradient-to-r from-[#E85D04] to-[#C2410C] px-4 sm:px-8 py-4 sm:py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Logo mark */}
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                <span className="text-white font-bold text-base sm:text-lg tracking-tight">TH</span>
              </div>
              <div>
                <h2 className="text-white font-bold text-lg sm:text-xl tracking-tight">Trishulhub</h2>
                <p className="text-orange-100 text-xs sm:text-sm font-medium">Training Academy</p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="flex items-center gap-1.5 text-orange-100 text-xs justify-end">
                <Shield className="h-3.5 w-3.5" />
                <span>Confidential</span>
              </div>
              <p className="text-orange-100/70 text-xs mt-0.5">{formattedDate}</p>
            </div>
          </div>
        </div>

        {/* ── Document Title Section ── */}
        <div className="px-4 sm:px-8 pt-6 sm:pt-8 pb-4 border-b-2 border-[#E85D04]/20">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white leading-tight">
            {topic}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              {generatedBy ? `Prepared by ${generatedBy}` : "AI-Generated Training Material"}
            </span>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formattedDate}
            </span>
          </div>
        </div>

        {/* ── Action buttons area ── */}
        {children && (
          <div className="px-4 sm:px-8 py-3 bg-gray-50 dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800">
            {children}
          </div>
        )}

        {/* ── Illustrations ── */}
        {imageUrls.length > 0 && (
          <div className="px-4 sm:px-8 pt-6">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {imageUrls.map((url, idx) => (
                <div key={idx} className="rounded-xl overflow-hidden border border-gray-200 dark:border-zinc-700 shadow-sm">
                  <img
                    src={url}
                    alt={`Illustration ${idx + 1}`}
                    className="w-full h-auto object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Document Content ── */}
        <div className="px-4 sm:px-8 py-6 sm:py-8">
          <div className="prose prose-sm sm:prose-base dark:prose-invert max-w-none
            prose-headings:text-gray-900 dark:prose-headings:text-white
            prose-h1:text-2xl prose-h1:sm:text-3xl prose-h1:font-bold prose-h1:mt-8 prose-h1:mb-4 prose-h1:text-[#C2410C] dark:prose-h1:text-[#F97316]
            prose-h2:text-xl prose-h2:sm:text-2xl prose-h2:font-bold prose-h2:mt-6 prose-h2:mb-3 prose-h2:text-[#C2410C] dark:prose-h2:text-[#F97316]
            prose-h3:text-lg prose-h3:sm:text-xl prose-h3:font-semibold prose-h3:mt-5 prose-h3:mb-2
            prose-p:leading-relaxed prose-p:text-gray-700 dark:prose-p:text-gray-300
            prose-li:text-gray-700 dark:prose-li:text-gray-300
            prose-strong:text-gray-900 dark:prose-strong:text-white
            prose-code:text-[#C2410C] prose-code:bg-orange-50 dark:prose-code:bg-orange-950/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
            prose-pre:bg-gray-900 dark:prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-gray-200 dark:prose-pre:border-zinc-700 prose-pre:rounded-xl
            prose-pre:shadow-sm
            prose-table:text-sm
            prose-th:bg-[#E85D04] prose-th:text-white prose-th:px-4 prose-th:py-2.5 prose-th:font-semibold
            prose-td:px-4 prose-td:py-2 prose-td:border-gray-200 dark:prose-td:border-zinc-700
            prose-tr:border-b prose-tr:border-gray-100 dark:prose-tr:border-zinc-800
            prose-blockquote:border-l-[#E85D04] prose-blockquote:bg-orange-50 dark:prose-blockquote:bg-orange-950/20 prose-blockquote:rounded-r-lg prose-blockquote:py-2 prose-blockquote:px-4
            prose-hr:border-[#E85D04]/20
            prose-a:text-[#E85D04] prose-a:no-underline hover:prose-a:underline
          ">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-4 sm:px-8 py-4 border-t border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-400 dark:text-gray-500">
            <p>&copy; {new Date().getFullYear()} Trishulhub. All rights reserved.</p>
            <p>Generated by Trishulhub Training Academy</p>
          </div>
        </div>
      </div>
    </div>
  )
}
