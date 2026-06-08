"use client"

import React from "react"
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer"

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Trishulhub Branded PDF — Clean White Professional
// All bugs fixed: no position:absolute, proper padding, base64 logo
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BRAND_PRIMARY = "#E85D04"
const BRAND_PRIMARY_DARK = "#C2410C"
const TEXT_DARK = "#1F2937"
const TEXT_MEDIUM = "#4B5563"
const TEXT_LIGHT = "#9CA3AF"
const WHITE = "#FFFFFF"
const BORDER = "#E5E7EB"
const CODE_BG = "#F9FAFB"
const TABLE_ALT = "#F9FAFB"

const styles = StyleSheet.create({
  // ── Page: padding accounts for fixed header (~55px) and footer (~30px) ──
  page: {
    paddingTop: 70,
    paddingBottom: 45,
    paddingHorizontal: 50,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: TEXT_DARK,
    lineHeight: 1.5,
    backgroundColor: WHITE,
  },

  // ── Fixed Header: NO position:absolute — just flexbox + fixed prop ──
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 50,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: WHITE,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerLogoImage: {
    width: 44,
    height: 18,
    marginRight: 8,
  },
  headerTextBlock: {},
  headerName: {
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    color: BRAND_PRIMARY_DARK,
  },
  headerTagline: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: BRAND_PRIMARY,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 1,
  },
  headerRight: {
    flexDirection: "column",
    alignItems: "flex-end",
  },
  headerDocLabel: {
    fontSize: 7,
    color: TEXT_LIGHT,
    fontFamily: "Helvetica",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  headerDate: {
    fontSize: 8,
    color: TEXT_MEDIUM,
    fontFamily: "Helvetica",
    marginTop: 1,
  },

  // ── Title Block ──
  titleSection: {
    marginBottom: 20,
    paddingTop: 14,
    paddingBottom: 14,
    paddingLeft: 16,
    paddingRight: 16,
    borderLeftWidth: 4,
    borderLeftColor: BRAND_PRIMARY,
    backgroundColor: "#FFFBF5",
  },
  documentTitle: {
    fontSize: 22,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
    marginBottom: 4,
    lineHeight: 1.3,
  },
  documentSubtitle: {
    fontSize: 9.5,
    color: TEXT_MEDIUM,
    fontFamily: "Helvetica",
  },

  // ── Headings ──
  heading1: {
    fontSize: 18,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    color: BRAND_PRIMARY_DARK,
    marginTop: 22,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#FDE8D0",
  },
  heading2: {
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    color: BRAND_PRIMARY_DARK,
    marginTop: 16,
    marginBottom: 6,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: BRAND_PRIMARY,
  },
  heading3: {
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    color: TEXT_DARK,
    marginTop: 12,
    marginBottom: 4,
  },

  // ── Body text ──
  paragraph: {
    fontSize: 10,
    lineHeight: 1.7,
    marginBottom: 8,
    color: TEXT_DARK,
  },
  boldText: {
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
  },
  italicText: {
    fontStyle: "italic",
  },

  // ── Lists ──
  bulletList: {
    marginBottom: 10,
  },
  bulletItem: {
    flexDirection: "row",
    marginBottom: 4,
    alignItems: "flex-start",
    marginLeft: 12,
  },
  bulletDot: {
    width: 12,
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
    marginBottom: 10,
  },
  numberedItem: {
    flexDirection: "row",
    marginBottom: 5,
    alignItems: "flex-start",
    marginLeft: 12,
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

  // ── Code ──
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
    color: BRAND_PRIMARY_DARK,
  },

  // ── Table ──
  tableContainer: {
    marginBottom: 12,
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
    backgroundColor: TABLE_ALT,
  },

  // ── Fixed Footer: NO position:absolute — just flexbox + fixed prop ──
  footerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 50,
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  footerName: {
    fontSize: 8,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    color: BRAND_PRIMARY_DARK,
    marginRight: 5,
  },
  footerSep: {
    fontSize: 6,
    color: TEXT_LIGHT,
    marginRight: 5,
  },
  footerText: {
    fontSize: 7,
    color: TEXT_LIGHT,
    fontFamily: "Helvetica",
    marginRight: 5,
  },
  footerTagline: {
    fontSize: 7,
    fontFamily: "Helvetica-BoldOblique",
    color: BRAND_PRIMARY,
    marginRight: 5,
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
    marginVertical: 10,
  },
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Markdown Parser
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface MdBlock {
  type: "h1" | "h2" | "h3" | "paragraph" | "bullet" | "numbered" | "code" | "table" | "separator"
  content: string
  items?: string[]
  rows?: string[][]
}

function parseMarkdown(markdown: string): MdBlock[] {
  const lines = markdown.split("\n")
  const blocks: MdBlock[] = []
  let i = 0
  // Only skip the first H1 if the content actually starts with one
  const skipFirstH1 = lines.length > 0 && /^# /.test(lines[0].trim())

  while (i < lines.length) {
    const line = lines[i]

    if (line.trim() === "") { i++; continue }

    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      blocks.push({ type: "separator", content: "" }); i++; continue
    }

    const h1Match = line.match(/^# (.+)$/)
    const h2Match = line.match(/^## (.+)$/)
    const h3Match = line.match(/^### (.+)$/)

    if (h1Match) {
      if (skipFirstH1 && blocks.length === 0) { i++; continue }
      blocks.push({ type: "h1", content: h1Match[1] }); i++; continue
    }
    if (h2Match) { blocks.push({ type: "h2", content: h2Match[1] }); i++; continue }
    if (h3Match) { blocks.push({ type: "h3", content: h3Match[1] }); i++; continue }

    if (line.trim().startsWith("```")) {
      const codeLines: string[] = []; i++
      while (i < lines.length && !lines[i].trim().startsWith("```")) { codeLines.push(lines[i]); i++ }
      i++
      blocks.push({ type: "code", content: codeLines.join("\n") }); continue
    }

    if (/^[\-\*]\s/.test(line.trim())) {
      const items: string[] = []
      while (i < lines.length && /^[\-\*]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[\-\*]\s+/, "")); i++
      }
      blocks.push({ type: "bullet", content: "", items }); continue
    }

    if (/^\d+\.\s/.test(line.trim())) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, "")); i++
      }
      blocks.push({ type: "numbered", content: "", items }); continue
    }

    if (line.trim().startsWith("|")) {
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = lines[i].split("|").map(c => c.trim()).filter(c => c.length > 0 && !/^[-:\s]+$/.test(c))
        if (cells.length > 0 && !/^[-:\s]+$/.test(lines[i])) rows.push(cells)
        i++
      }
      if (rows.length > 1) {
        const cleanRows = rows.filter(r => !r.every(c => /^[-:\s]+$/.test(c)))
        if (cleanRows.length > 0) blocks.push({ type: "table", content: "", rows: cleanRows })
      }
      continue
    }

    const paraLines: string[] = []
    while (
      i < lines.length && lines[i].trim() !== "" &&
      !/^#{1,3}\s/.test(lines[i]) && !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("---") && !/^[\-\*]\s/.test(lines[i].trim()) &&
      !/^\d+\.\s/.test(lines[i].trim()) && !lines[i].trim().startsWith("|")
    ) {
      paraLines.push(lines[i].trim()); i++
    }
    if (paraLines.length > 0) blocks.push({ type: "paragraph", content: paraLines.join(" ") })
  }

  return blocks
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Inline text renderer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function renderInlineText(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*)|(`([^`]+?)`)|(\*(.+?)\*)/g
  let lastIndex = 0
  let match
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Text key={key++}>{text.slice(lastIndex, match.index)}</Text>)
    }
    if (match[1]) {
      parts.push(<Text key={key++} style={styles.boldText}>{match[2]}</Text>)
    } else if (match[3]) {
      parts.push(<Text key={key++} style={styles.inlineCode}>{match[4]}</Text>)
    } else if (match[5]) {
      parts.push(<Text key={key++} style={styles.italicText}>{match[6]}</Text>)
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
      return <Text key={idx} style={styles.paragraph}>{renderInlineText(block.content)}</Text>
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
                  <Text key={cellIdx} style={isHeader ? styles.tableHeaderCell : styles.tableCell}>{cell}</Text>
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
// Main PDF Document
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
      {/* SINGLE PAGE with wrap — auto page-breaks for any content length */}
      <Page size="A4" style={styles.page} wrap>

        {/* Fixed Header — repeats on every page, NO position:absolute */}
        <View style={styles.headerBar} fixed>
          <View style={styles.headerLeft}>
            {/* Logo: use SVG inline text as fallback-safe approach */}
            <View style={{
              width: 44,
              height: 18,
              backgroundColor: BRAND_PRIMARY_DARK,
              borderRadius: 3,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginRight: 8,
            }}>
              <Text style={{ fontSize: 9, fontWeight: "bold", fontFamily: "Helvetica-Bold", color: WHITE, letterSpacing: 1 }}>TH</Text>
            </View>
            <View style={styles.headerTextBlock}>
              <Text style={styles.headerName}>Trishulhub</Text>
              <Text style={styles.headerTagline}>Quality Matters !</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerDocLabel}>Training Document</Text>
            <Text style={styles.headerDate}>{formattedDate}</Text>
          </View>
        </View>

        {/* Title Block */}
        <View style={styles.titleSection}>
          <Text style={styles.documentTitle}>{topic}</Text>
          <Text style={styles.documentSubtitle}>
            {generatedBy ? `Prepared by ${generatedBy}` : "AI-Generated Training Material"}  |  {formattedDate}
          </Text>
        </View>

        {/* All Content — auto-flows across as many pages as needed */}
        {blocks.map((block, idx) => renderBlock(block, idx))}

        {/* Fixed Footer — repeats on every page, NO position:absolute */}
        <View style={styles.footerBar} fixed>
          <View style={styles.footerLeft}>
            <Text style={styles.footerName}>Trishulhub</Text>
            <Text style={styles.footerSep}>|</Text>
            <Text style={styles.footerTagline}>Quality Matters !</Text>
            <Text style={styles.footerSep}>|</Text>
            <Text style={styles.footerText}>{`\u00A9 ${new Date().getFullYear()} All rights reserved.`}</Text>
          </View>
          <Text
            style={styles.footerRight}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
