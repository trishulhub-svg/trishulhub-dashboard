"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Shield, Save, Download, Upload, Loader2,
  Clock, AlertTriangle, Copy, Check,
} from "lucide-react";
import { safeText, safeDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { DEFAULT_PROTOCOL_CONTENT } from "@/lib/default-protocol";

// ── Types ──
interface ProtocolVersion {
  id: string;
  version: string;
  title: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ProtocolPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "SUPER_ADMIN";

  // Protocol state
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [protocolVersion, setProtocolVersion] = useState("");
  const [protocolTitle, setProtocolTitle] = useState("Trishul Protocol");
  const [protocolContent, setProtocolContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const protocolFileRef = useRef<HTMLInputElement>(null);

  // ── Fetch protocol ──
  const fetchProtocol = useCallback(async () => {
    try {
      const res = await fetch("/api/protocol?active=true");
      if (res.ok) {
        const data = await res.json();
        const active = Array.isArray(data) ? data.find((p: ProtocolVersion) => p.isActive) : data;
        if (active) {
          setProtocolId(active.id);
          setProtocolVersion(active.version || "");
          setProtocolTitle(active.title || "Trishul Protocol");
          setProtocolContent(active.content || "");
          setLastSaved(active.updatedAt || active.createdAt);
        } else if (isAdmin) {
          // No protocol exists yet — load default
          setProtocolContent(DEFAULT_PROTOCOL_CONTENT);
          setProtocolTitle("Trishul Protocol");
        }
      }
    } catch (err) {
      console.error("Failed to fetch protocol:", err);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (status === "authenticated") {
      setLoading(true);
      fetchProtocol();
      setLoading(false);
    }
  }, [status, fetchProtocol]);

  // ── Save protocol ──
  const saveProtocol = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = {
        title: protocolTitle.trim() || "Trishul Protocol",
        content: protocolContent,
      };

      let res: Response;
      let targetId = protocolId;

      if (!targetId) {
        try {
          const checkRes = await fetch("/api/protocol?active=true");
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const existing = Array.isArray(checkData) ? checkData.find((p: ProtocolVersion) => p.isActive) : checkData;
            if (existing?.id) {
              targetId = existing.id;
              setProtocolId(existing.id);
            }
          }
        } catch { /* fall through to POST */ }
      }

      if (targetId) {
        res = await fetch("/api/protocol", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: targetId, ...body }),
        });
      } else {
        body.version = "6.0";
        res = await fetch("/api/protocol", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (res.ok) {
        toast.success("Protocol saved successfully");
        const data = await res.json();
        if (!protocolId && data.id) setProtocolId(data.id);
        setLastSaved(new Date().toISOString());
        await fetchProtocol();
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Failed to save"));
      }
    } catch {
      toast.error("Failed to save protocol");
    }
    setSaving(false);
  };

  // ── Upload file ──
  const handleFileUpload = async (file: File) => {
    const allowedExt = [".txt", ".md", ".pdf", ".doc", ".docx"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExt.includes(ext)) {
      toast.error("Use .txt, .md, .pdf, .doc, or .docx");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5MB)");
      return;
    }
    if (ext === ".txt" || ext === ".md") {
      try {
        const text = await file.text();
        setProtocolContent(text);
        toast.success(`Loaded ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      } catch {
        toast.error("Failed to read file");
      }
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/protocol/upload-document", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        if (data.content) {
          setProtocolContent(data.content);
          toast.success(`Loaded ${file.name} (${(data.content.length / 1024).toFixed(1)} KB)`);
        } else {
          toast.error("Could not extract text from this file");
        }
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Failed to process file"));
      }
    } catch {
      toast.error("Failed to upload file");
    }
    setLoading(false);
  };

  // ── Download as .txt ──
  const downloadProtocol = () => {
    if (!protocolContent.trim()) {
      toast.error("No protocol content to download");
      return;
    }
    const blob = new Blob([protocolContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trishul-protocol-v${protocolVersion || "6.0"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Protocol downloaded");
  };

  // ── Copy to clipboard ──
  const copyProtocol = async () => {
    if (!protocolContent.trim()) {
      toast.error("No protocol content to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(protocolContent);
      setCopied(true);
      toast.success("Protocol copied to clipboard — paste it into GLM chat");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  // ── Loading ──
  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isAdmin ? "Protocol Management" : "Trishul Protocol"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin
              ? "Upload, edit, and manage the master protocol. Your team downloads it from here."
              : "View and download the Trishul Protocol. Paste it into GLM workspace to activate."}
          </p>
        </div>
        {lastSaved && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> Saved: {safeDate(lastSaved)}
          </span>
        )}
      </div>

      {/* Protocol Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                {protocolVersion ? `Version ${safeText(protocolVersion)}` : "Trishul Protocol"}
              </CardTitle>
              <CardDescription className="mt-1">
                {isAdmin
                  ? "Edit the protocol below or upload a document. Changes are saved to the database."
                  : "This is your team's operational protocol. Download it or copy to clipboard."}
              </CardDescription>
            </div>
            {protocolContent.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {(protocolContent.length / 1024).toFixed(1)} KB
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Title — ADMIN only */}
          {isAdmin && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">Protocol Title</label>
              <Input
                value={protocolTitle}
                onChange={(e) => setProtocolTitle(e.target.value)}
                placeholder="Trishul Protocol"
                className="max-w-md"
              />
            </div>
          )}

          {/* Content — ADMIN: editable. Team: read-only */}
          {isAdmin ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium">Protocol Content</label>
                <div className="flex items-center gap-2">
                  <input
                    ref={protocolFileRef}
                    type="file"
                    accept=".txt,.md,.pdf,.doc,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => protocolFileRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1" /> Upload Document
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {protocolContent.length.toLocaleString()} chars
                  </span>
                </div>
              </div>
              <Textarea
                placeholder="Write or paste your Trishul Protocol here..."
                className="min-h-[550px] font-mono text-sm leading-relaxed"
                value={protocolContent}
                onChange={(e) => setProtocolContent(e.target.value)}
              />
            </div>
          ) : (
            <div className="border rounded-lg p-4 bg-muted/20">
              <pre className="text-sm leading-relaxed whitespace-pre-wrap break-words font-mono max-h-[600px] overflow-y-auto">
                {protocolContent || "No protocol available. Contact your administrator."}
              </pre>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Confidential — do not share outside the team
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={copyProtocol} disabled={!protocolContent.trim()}>
                {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button onClick={downloadProtocol} disabled={!protocolContent.trim()}>
                <Download className="h-4 w-4 mr-1.5" /> Download .txt
              </Button>
              {isAdmin && (
                <Button onClick={saveProtocol} disabled={saving || !protocolContent.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                  Save
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
