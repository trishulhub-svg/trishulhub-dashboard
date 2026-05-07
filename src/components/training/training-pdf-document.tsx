"use client"

import React from "react"
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Link,
} from "@react-pdf/renderer"

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Trishulhub Branded PDF Styles
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BRAND_PRIMARY = "#E85D04"
const BRAND_PRIMARY_DARK = "#C2410C"
const BRAND_ACCENT = "#FEF3C7"
const TEXT_DARK = "#1F2937"
const TEXT_MEDIUM = "#4B5563"
const TEXT_LIGHT = "#9CA3AF"
const WHITE = "#FFFFFF"
const BORDER = "#E5E7EB"
const CODE_BG = "#F3F4F6"

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: TEXT_DARK,
    lineHeight: 1.5,
  },
  // ── Header ──
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: BRAND_PRIMARY,
    borderRadius: 6,
    padding: "12 16",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerLogo: {
    width: 28,
    height: 28,
    backgroundColor: WHITE,
    borderRadius: 6,
    padding: 4,
  },
  headerCompanyName: {
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    color: WHITE,
  },
  headerLabel: {
    fontSize: 9,
    color: BRAND_ACCENT,
    fontFamily: "Helvetica",
  },
  headerRightText: {
    fontSize: 8,
    color: BRAND_ACCENT,
    textAlign: "right",
    fontFamily: "Helvetica",
  },
  // ── Title ──
  titleSection: {
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: BRAND_PRIMARY,
    paddingBottom: 12,
  },
  documentTitle: {
    fontSize: 22,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
    marginBottom: 6,
  },
  documentSubtitle: {
    fontSize: 10,
    color: TEXT_MEDIUM,
    fontFamily: "Helvetica",
  },
  // ── Content ──
  heading1: {
    fontSize: 18,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    color: BRAND_PRIMARY_DARK,
    marginTop: 20,
    marginBottom: 8,
    paddingTop: 8,
  },
  heading2: {
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    color: BRAND_PRIMARY_DARK,
    marginTop: 16,
    marginBottom: 6,
  },
  heading3: {
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
    marginTop: 12,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.6,
    marginBottom: 8,
    color: TEXT_DARK,
  },
  boldText: {
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
  },
  bulletList: {
    marginLeft: 16,
    marginBottom: 8,
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 4,
    alignItems: "flex-start",
  },
  bulletDot: {
    width: 10,
    fontSize: 10,
    color: BRAND_PRIMARY,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.5,
  },
  numberedList: {
    marginLeft: 16,
    marginBottom: 8,
  },
  numberedItem: {
    flexDirection: "row",
    marginBottom: 4,
    alignItems: "flex-start",
  },
  numberPrefix: {
    width: 18,
    fontSize: 10,
    color: BRAND_PRIMARY,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    textAlign: "right",
    paddingRight: 6,
  },
  numberText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.5,
  },
  // Code blocks
  codeBlock: {
    backgroundColor: CODE_BG,
    borderRadius: 4,
    padding: "10 12",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  codeText: {
    fontSize: 8.5,
    fontFamily: "Courier",
    color: TEXT_DARK,
    lineHeight: 1.5,
  },
  inlineCode: {
    fontFamily: "Courier",
    fontSize: 9,
    backgroundColor: CODE_BG,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
  },
  // Table
  tableContainer: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 4,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: BRAND_PRIMARY,
    padding: "8 10",
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: 9,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    color: WHITE,
  },
  tableRow: {
    flexDirection: "row",
    padding: "6 10",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
  },
  tableCell: {
    flex: 1,
    fontSize: 9,
    color: TEXT_DARK,
  },
  tableRowAlt: {
    flexDirection: "row",
    padding: "6 10",
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    backgroundColor: "#F9FAFB",
  },
  // ── Footer ──
  footerBar: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 8,
  },
  footerLeft: {
    fontSize: 7,
    color: TEXT_LIGHT,
    fontFamily: "Helvetica",
  },
  footerRight: {
    fontSize: 7,
    color: TEXT_LIGHT,
    fontFamily: "Helvetica",
  },
  // ── Separator ──
  separator: {
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    marginVertical: 8,
  },
  // Info box
  infoBox: {
    backgroundColor: BRAND_ACCENT,
    borderLeftWidth: 3,
    borderLeftColor: BRAND_PRIMARY,
    padding: "8 12",
    borderRadius: 4,
    marginBottom: 10,
  },
  infoBoxText: {
    fontSize: 9.5,
    color: TEXT_DARK,
    lineHeight: 1.5,
  },
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Simple Markdown Parser for PDF
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MdBlock {
  type: "h1" | "h2" | "h3" | "paragraph" | "bullet" | "numbered" | "code" | "table" | "separator" | "info"
  content: string
  items?: string[]
  rows?: string[][]
  language?: string
}

function parseMarkdown(markdown: string): MdBlock[] {
  const lines = markdown.split("\n")
  const blocks: MdBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Empty line
    if (line.trim() === "") {
      i++
      continue
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      blocks.push({ type: "separator", content: "" })
      i++
      continue
    }

    // Headings
    const h1Match = line.match(/^# (.+)$/)
    const h2Match = line.match(/^## (.+)$/)
    const h3Match = line.match(/^### (.+)$/)

    if (h1Match) {
      blocks.push({ type: "h1", content: h1Match[1] })
      i++
      continue
    }
    if (h2Match) {
      blocks.push({ type: "h2", content: h2Match[1] })
      i++
      continue
    }
    if (h3Match) {
      blocks.push({ type: "h3", content: h3Match[1] })
      i++
      continue
    }

    // Code block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().replace("```", "").trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      blocks.push({ type: "code", content: codeLines.join("\n"), language: lang })
      continue
    }

    // Bullet list
    if (/^[\-\*]\s/.test(line.trim())) {
      const items: string[] = []
      while (i < lines.length && /^[\-\*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[\-\*]\s+/, ""))
        i++
      }
      blocks.push({ type: "bullet", content: "", items })
      continue
    }

    // Numbered list
    if (/^\d+\.\s/.test(line.trim())) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""))
        i++
      }
      blocks.push({ type: "numbered", content: "", items })
      continue
    }

    // Table
    if (line.trim().startsWith("|")) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i]
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c.length > 0 && !/^[-:\s]+$/.test(c))
        if (cells.length > 0 && !/^[-:\s]+$/.test(lines[i])) {
          rows.push(cells)
        }
        i++
      }
      if (rows.length > 1) {
        // Remove separator row (row with only -, :, spaces)
        const cleanRows = rows.filter((r) => !r.every((c) => /^[-:\s]+$/.test(c)))
        if (cleanRows.length > 0) {
          blocks.push({ type: "table", content: "", rows: cleanRows })
        }
      }
      continue
    }

    // Paragraph - collect consecutive non-empty, non-special lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("---") &&
      !/^[\-\*]\s/.test(lines[i].trim()) &&
      !/^\d+\.\s/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("|")
    ) {
      paraLines.push(lines[i].trim())
      i++
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", content: paraLines.join(" ") })
    }
  }

  return blocks
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Inline text renderer (bold, code, italic)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderInlineText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // Pattern matches: **bold**, `code`, *italic*
  const regex = /(\*\*(.+?)\*\*)|(`([^`]+?)`)|(\*(.+?)\*)/g
  let lastIndex = 0
  let match
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      parts.push(<Text key={key++}>{text.slice(lastIndex, match.index)}</Text>)
    }
    if (match[1]) {
      // Bold
      parts.push(<Text key={key++} style={styles.boldText}>{match[2]}</Text>)
    } else if (match[3]) {
      // Inline code
      parts.push(<Text key={key++} style={styles.inlineCode}>{match[4]}</Text>)
    } else if (match[5]) {
      // Italic
      parts.push(<Text key={key++} style={{ fontStyle: "italic" }}>{match[6]}</Text>)
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(<Text key={key++}>{text.slice(lastIndex)}</Text>)
  }

  return parts.length > 0 ? parts : [<Text key="p">{text}</Text>]
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Block renderer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderBlock(block: MdBlock, idx: number): React.ReactNode {
  switch (block.type) {
    case "h1":
      return <Text key={idx} style={styles.heading1}>{block.content}</Text>
    case "h2":
      return <Text key={idx} style={styles.heading2}>{block.content}</Text>
    case "h3":
      return <Text key={idx} style={styles.heading3}>{block.content}</Text>
    case "paragraph":
      return (
        <Text key={idx} style={styles.paragraph}>
          {renderInlineText(block.content)}
        </Text>
      )
    case "bullet":
      return (
        <View key={idx} style={styles.bulletList}>
          {block.items?.map((item, j) => (
            <View key={j} style={styles.bulletItem}>
              <Text style={styles.bulletDot}>{"\u2022"}</Text>
              <Text style={styles.bulletText}>{renderInlineText(item)}</Text>
            </View>
          ))}
        </View>
      )
    case "numbered":
      return (
        <View key={idx} style={styles.numberedList}>
          {block.items?.map((item, j) => (
            <View key={j} style={styles.numberedItem}>
              <Text style={styles.numberPrefix}>{j + 1}.</Text>
              <Text style={styles.numberText}>{renderInlineText(item)}</Text>
            </View>
          ))}
        </View>
      )
    case "code":
      return (
        <View key={idx} style={styles.codeBlock}>
          <Text style={styles.codeText}>{block.content}</Text>
        </View>
      )
    case "table":
      return (
        <View key={idx} style={styles.tableContainer}>
          {block.rows?.map((row, rowIdx) => {
            const isHeader = rowIdx === 0
            const isAlt = rowIdx % 2 === 0
            return (
              <View key={rowIdx} style={isHeader ? styles.tableHeader : isAlt ? styles.tableRowAlt : styles.tableRow}>
                {row.map((cell, cellIdx) => (
                  <Text key={cellIdx} style={isHeader ? styles.tableHeaderCell : styles.tableCell}>
                    {cell}
                  </Text>
                ))}
              </View>
            )
          })}
        </View>
      )
    case "separator":
      return <View key={idx} style={styles.separator} />
    default:
      return null
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main PDF Document Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TrainingPdfDocumentProps {
  topic: string
  content: string
  generatedBy?: string
  createdAt?: string
}

export default function TrainingPdfDocument({
  topic,
  content,
  generatedBy,
  createdAt,
}: TrainingPdfDocumentProps) {
  const blocks = parseMarkdown(content)
  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* ── Branded Header Bar ── */}
        <View style={styles.headerBar} fixed>
          <View style={styles.headerLeft}>
            <View style={styles.headerLogo}>
              <Text style={{ fontSize: 8, fontWeight: "bold", fontFamily: "Helvetica-Bold", color: BRAND_PRIMARY_DARK }}>
                TH
              </Text>
            </View>
            <View>
              <Text style={styles.headerCompanyName}>Trishulhub</Text>
              <Text style={styles.headerLabel}>Training Academy</Text>
            </View>
          </View>
          <View>
            <Text style={styles.headerRightText}>Confidential</Text>
            <Text style={styles.headerRightText}>{formattedDate}</Text>
          </View>
        </View>

        {/* ── Document Title ── */}
        <View style={styles.titleSection}>
          <Text style={styles.documentTitle}>{topic}</Text>
          <Text style={styles.documentSubtitle}>
            {generatedBy ? `Prepared by ${generatedBy}` : "AI-Generated Training Material"}{" "}
            {"\u2022"} {formattedDate}
          </Text>
        </View>

        {/* ── Document Content ── */}
        {blocks.map((block, idx) => renderBlock(block, idx))}

        {/* ── Footer ── */}
        <View style={styles.footerBar} fixed>
          <Text style={styles.footerLeft}>
            {"\u00A9"} {new Date().getFullYear()} Trishulhub. All rights reserved.
          </Text>
          <Text
            style={styles.footerRight}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
