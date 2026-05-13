import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { unzipSync } from "fflate";

// POST — Upload and extract text from protocol document (SUPER_ADMIN only)
// Supports: .txt, .md, .pdf, .doc, .docx
export async function POST(request: NextRequest) {
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token || token.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

    // .txt and .md
    if (ext === ".txt" || ext === ".md") {
      const text = await file.text();
      return NextResponse.json({ content: text, filename: file.name, size: file.size });
    }

    // .pdf extraction
    if (ext === ".pdf") {
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = extractPdfText(buffer);
      if (!text.trim()) {
        return NextResponse.json({ error: "Could not extract text from this PDF. It may be image-based." }, { status: 400 });
      }
      return NextResponse.json({ content: text, filename: file.name, size: file.size });
    }

    // .docx extraction (using fflate for reliable ZIP handling)
    if (ext === ".docx") {
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = extractDocxText(buffer);
      if (!text.trim()) {
        return NextResponse.json({ error: "Could not extract text from this DOCX file." }, { status: 400 });
      }
      return NextResponse.json({ content: text, filename: file.name, size: file.size });
    }

    // .doc (old Word format) — basic attempt
    if (ext === ".doc") {
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = extractDocTextBasic(buffer);
      if (!text.trim()) {
        return NextResponse.json({ error: "Could not extract text from this .doc file. Please convert to .docx or .txt first." }, { status: 400 });
      }
      return NextResponse.json({ content: text, filename: file.name, size: file.size });
    }

    return NextResponse.json({ error: "Unsupported file type. Supported: .txt, .md, .pdf, .docx, .doc" }, { status: 400 });
  } catch (error: any) {
    console.error("[protocol/upload-document] error:", error);
    return NextResponse.json({ error: "Failed to process document: " + (error?.message || "Unknown error") }, { status: 500 });
  }
}

// ── PDF Text Extraction ──
function extractPdfText(buffer: Buffer): string {
  const content = buffer.toString("latin1");
  const lines: string[] = [];

  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(content)) !== null) {
    const streamContent = match[1];

    const textRegex = /\(([^)]*)\)\s*Tj/g;
    let textMatch: RegExpExecArray | null;
    while ((textMatch = textRegex.exec(streamContent)) !== null) {
      const text = decodePdfString(textMatch[1]);
      if (text.trim()) lines.push(text);
    }

    const tjRegex = /\[([^\]]*)\]\s*TJ/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(streamContent)) !== null) {
      const arrayContent = tjMatch[1];
      const partsRegex = /\(([^)]*)\)/g;
      let partMatch: RegExpExecArray | null;
      let line = "";
      while ((partMatch = partsRegex.exec(arrayContent)) !== null) {
        line += decodePdfString(partMatch[1]);
      }
      if (line.trim()) lines.push(line);
    }
  }

  return lines.join("\n");
}

function decodePdfString(str: string): string {
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

// ── DOCX Text Extraction (fflate-powered) ──
function extractDocxText(buffer: Buffer): string {
  try {
    // fflate's unzipSync expects Uint8Array
    const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const files = unzipSync(data);

    // Read word/document.xml from the ZIP
    const docXml = files["word/document.xml"];
    if (!docXml) {
      console.error("[protocol/upload-document] word/document.xml not found in DOCX");
      return "";
    }

    const xmlStr = new TextDecoder("utf-8").decode(docXml);
    return extractTextFromDocxXml(xmlStr);
  } catch (error: any) {
    console.error("[protocol/upload-document] DOCX extraction failed:", error);
    return "";
  }
}

function extractTextFromDocxXml(xml: string): string {
  const texts: string[] = [];

  // Split by paragraph closing tags to preserve line breaks
  const paragraphs = xml.split(/<\/w:p>/);

  for (const para of paragraphs) {
    const paraTexts: string[] = [];
    const tagMatch = para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    for (const m of tagMatch) {
      if (m[1].trim()) paraTexts.push(m[1]);
    }
    if (paraTexts.length > 0) {
      texts.push(paraTexts.join(""));
    }
  }

  return texts.join("\n");
}

// ── DOC Text Extraction (Basic) ──
function extractDocTextBasic(buffer: Buffer): string {
  const content = buffer.toString("binary");
  const textChunks: string[] = [];

  const printableRegex = /[\x20-\x7E]{4,}/g;
  let match: RegExpExecArray | null;

  while ((match = printableRegex.exec(content)) !== null) {
    const text = match[0].trim();
    if (text.length >= 4 && !text.match(/^(PK|\\x00|RIFF|BM)/)) {
      textChunks.push(text);
    }
  }

  return textChunks
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
