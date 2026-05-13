import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// POST — Upload and extract text from protocol document (SUPER_ADMIN only)
// Supports: .txt, .md (handled client-side), .pdf, .doc, .docx (handled here)
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

    // .txt and .md should be handled client-side, but support them here too
    if (ext === ".txt" || ext === ".md") {
      const text = await file.text();
      return NextResponse.json({ content: text, filename: file.name, size: file.size });
    }

    // .pdf extraction
    if (ext === ".pdf") {
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await extractPdfText(buffer);
      if (!text.trim()) {
        return NextResponse.json({ error: "Could not extract text from this PDF. It may be image-based." }, { status: 400 });
      }
      return NextResponse.json({ content: text, filename: file.name, size: file.size });
    }

    // .docx extraction
    if (ext === ".docx") {
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await extractDocxText(buffer);
      if (!text.trim()) {
        return NextResponse.json({ error: "Could not extract text from this DOCX file." }, { status: 400 });
      }
      return NextResponse.json({ content: text, filename: file.name, size: file.size });
    }

    // .doc (old Word format) — basic attempt
    if (ext === ".doc") {
      const buffer = Buffer.from(await file.arrayBuffer());
      // Try to extract readable text from .doc (binary format)
      const text = extractDocTextBasic(buffer);
      if (!text.trim()) {
        return NextResponse.json({ error: "Could not extract text from this .doc file. Please convert to .docx or .txt first." }, { status: 400 });
      }
      return NextResponse.json({ content: text, filename: file.name, size: file.size });
    }

    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  } catch (error: any) {
    console.error("[protocol/upload-document] error:", error);
    return NextResponse.json({ error: "Failed to process document" }, { status: 500 });
  }
}

// ── PDF Text Extraction ──
// Simple PDF text extractor — reads text from PDF stream objects
async function extractPdfText(buffer: Buffer): Promise<string> {
  const content = buffer.toString("latin1");
  const lines: string[] = [];

  // Find all stream objects and extract text between BT and ET markers
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(content)) !== null) {
    const streamContent = match[1];

    // Extract text from text showing operators: (Tj, ', ")
    // Look for text between parentheses before Tj
    const textRegex = /\(([^)]*)\)\s*Tj/g;
    let textMatch: RegExpExecArray | null;

    while ((textMatch = textRegex.exec(streamContent)) !== null) {
      const text = decodePdfString(textMatch[1]);
      if (text.trim()) {
        lines.push(text);
      }
    }

    // Also handle TJ operator (array of strings)
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
      if (line.trim()) {
        lines.push(line);
      }
    }
  }

  return lines.join("\n");
}

function decodePdfString(str: string): string {
  // Handle PDF escape sequences
  return str
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

// ── DOCX Text Extraction ──
// DOCX is a ZIP file — we read word/document.xml and extract text
async function extractDocxText(buffer: Buffer): Promise<string> {
  // Use Node.js built-in zlib for decompression (DOCX uses ZIP)
  const { decompressSync } = await import("zlib");

  try {
    // Simple ZIP parser — find the Central Directory to locate word/document.xml
    const content = buffer.toString("binary");

    // Find word/document.xml entry in the ZIP
    const entryName = "word/document.xml";
    const entryIndex = content.indexOf(entryName);

    if (entryIndex === -1) {
      // Try alternative: search for the compressed content directly
      return extractDocxTextFallback(buffer);
    }

    // Parse local file header after central directory entry
    // Look for PK\x03\x04 signature
    const localHeaderPos = findLocalHeader(content, entryName);

    if (localHeaderPos === -1) {
      return extractDocxTextFallback(buffer);
    }

    // Read compression method and compressed size from local header
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const compressionMethod = view.getUint16(localHeaderPos + 8, true);
    const compressedSize = view.getUint32(localHeaderPos + 18, true);
    const uncompressedSize = view.getUint32(localHeaderPos + 22, true);
    const fileNameLen = view.getUint16(localHeaderPos + 26, true);
    const extraFieldLen = view.getUint16(localHeaderPos + 28, true);

    const dataStart = localHeaderPos + 30 + fileNameLen + extraFieldLen;
    const compressedData = buffer.slice(dataStart, dataStart + compressedSize);

    let xmlContent: string;

    if (compressionMethod === 0) {
      // No compression (stored)
      xmlContent = compressedData.toString("utf8");
    } else if (compressionMethod === 8) {
      // Deflate
      const decompressed = decompressSync(compressedData);
      xmlContent = decompressed.toString("utf8");
    } else {
      return extractDocxTextFallback(buffer);
    }

    // Extract text from XML: find all <w:t> tags
    return extractTextFromDocxXml(xmlContent);
  } catch {
    return extractDocxTextFallback(buffer);
  }
}

function findLocalHeader(content: string, entryName: string): number {
  // Search backwards for PK\x03\x04 near the entry name
  for (let i = content.indexOf(entryName) - 100; i >= 0; i--) {
    if (content.charCodeAt(i) === 0x50 && content.charCodeAt(i + 1) === 0x4B &&
        content.charCodeAt(i + 2) === 0x03 && content.charCodeAt(i + 3) === 0x04) {
      return i;
    }
  }
  return -1;
}

function extractTextFromDocxXml(xml: string): string {
  const texts: string[] = [];
  // Match <w:t> and <w:t xml:space="preserve"> tags
  const tagRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let match: RegExpExecArray | null;

  let currentParagraph = "";
  let lastWasT = false;

  // We need to handle paragraph breaks (<w:p>)
  const paragraphs = xml.split(/<\/w:p>/);

  for (const para of paragraphs) {
    const paraTexts: string[] = [];
    const tagMatch = para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g);
    for (const m of tagMatch) {
      paraTexts.push(m[1]);
    }
    if (paraTexts.length > 0) {
      texts.push(paraTexts.join(""));
    }
  }

  return texts.join("\n");
}

function extractDocxTextFallback(buffer: Buffer): string {
  // Fallback: try to find readable text in the DOCX file
  const content = buffer.toString("utf8");
  const texts: string[] = [];
  const tagRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(content)) !== null) {
    if (match[1].trim()) {
      texts.push(match[1]);
    }
  }

  if (texts.length > 0) {
    return texts.join(" ");
  }

  return "";
}

// ── DOC Text Extraction (Basic) ──
// Old .doc format is binary — this is a best-effort extraction
function extractDocTextBasic(buffer: Buffer): string {
  // Try to find readable text chunks in the binary
  const content = buffer.toString("binary");
  const textChunks: string[] = [];

  // Extract sequences of printable ASCII characters (length >= 4)
  const printableRegex = /[\x20-\x7E]{4,}/g;
  let match: RegExpExecArray | null;

  while ((match = printableRegex.exec(content)) !== null) {
    const text = match[0].trim();
    if (text.length >= 4 && !text.match(/^(PK|\\x00|RIFF|BM)/)) {
      textChunks.push(text);
    }
  }

  // Join chunks with spaces and clean up
  return textChunks
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
