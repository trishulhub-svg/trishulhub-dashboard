"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  FileText, Upload, Download, Trash2, Loader2,
  FileUp, CheckCircle2, AlertCircle, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { safeText, safeDate } from "@/lib/utils";

interface ProtocolFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
}

export default function ProtocolPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = session?.user?.role === "SUPER_ADMIN";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // ── Fetch current protocol PDF ──
  const { data: protocol = null, isLoading: protocolLoading } = useQuery({
    queryKey: ["protocol"],
    queryFn: async () => {
      const res = await fetch("/api/protocol");
      if (!res.ok) return null;
      const data = await res.json();
      return data?.id ? data as ProtocolFile : null;
    },
    staleTime: 60 * 1000,
    retry: 1,
    enabled: status === "authenticated",
  });
  const loading = protocolLoading;

  // ── Upload PDF ──
  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Only PDF files are allowed");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10MB)");
      return;
    }

    setUploading(true);
    try {
      // Convert to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      const res = await fetch("/api/protocol", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/pdf",
          data: base64,
        }),
      });

      if (res.ok) {
        toast.success("Protocol PDF uploaded successfully");
        queryClient.invalidateQueries({ queryKey: ["protocol"] });
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Upload failed"));
      }
    } catch {
      toast.error("Failed to upload file");
    }
    setUploading(false);
  };

  // ── Download PDF ──
  const handleDownload = useCallback(async () => {
    if (!protocol) return;
    try {
      const res = await fetch("/api/protocol?download=true");
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          const binary = atob(data.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: protocol.mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = protocol.fileName || "trishul-protocol.pdf";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success("Download started");
        } else {
          toast.error("No PDF data found");
        }
      } else {
        toast.error("Failed to download protocol");
      }
    } catch {
      toast.error("Download failed");
    }
  }, [protocol]);

  // ── Delete PDF ──
  const handleDelete = async () => {
    if (!protocol) return;
    if (!confirm("Are you sure you want to delete this protocol PDF?")) return;
    try {
      const res = await fetch("/api/protocol", { method: "DELETE" });
      if (res.ok) {
        toast.success("Protocol PDF deleted");
        queryClient.invalidateQueries({ queryKey: ["protocol"] });
      } else {
        toast.error("Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  // ── Drag & Drop handlers ──
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <PageHeader
        title="Protocol"
        description={isAdmin
          ? "Upload and manage your protocol PDF. Team members can download it."
          : "Download the latest TrishulHub protocol PDF."}
      />

      {/* Current Protocol Card */}
      <Card>
        <CardContent className="p-6">
          {protocol ? (
            /* ── Protocol exists ── */
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {safeText(protocol.fileName)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-xs">
                        PDF
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatSize(protocol.fileSize)}
                      </span>
                    </div>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs flex items-center gap-1 flex-shrink-0">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  Active
                </Badge>
              </div>

              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                Uploaded: {safeDate(protocol.uploadedAt)}
                {protocol.uploadedBy && (
                  <> &middot; by {safeText(protocol.uploadedBy)}</>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t">
                <Button onClick={handleDownload} className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </Button>
                {isAdmin && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Replace
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleDelete}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* ── No protocol uploaded ── */
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-sm">No protocol uploaded</p>
                  <p className="text-xs text-muted-foreground">
                    {isAdmin
                      ? "Upload your protocol PDF to get started."
                      : "No protocol is available yet. Contact your admin."}
                  </p>
                </div>
              </div>

              {isAdmin && (
                <>
                  {/* Drop zone */}
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                      relative flex flex-col items-center justify-center gap-3
                      rounded-xl border-2 border-dashed p-8 cursor-pointer
                      transition-all duration-200
                      ${dragOver
                        ? "border-primary bg-primary/5 scale-[1.01]"
                        : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
                      }
                    `}
                  >
                    <div className={`
                      w-12 h-12 rounded-full flex items-center justify-center
                      transition-colors duration-200
                      ${dragOver ? "bg-primary/10" : "bg-muted"}
                    `}>
                      <FileUp className={`h-5 w-5 transition-colors duration-200 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">
                        {dragOver ? "Drop your PDF here" : "Click to upload or drag & drop"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        PDF files only, max 10MB
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = "";
        }}
      />

      {/* Upload overlay spinner */}
      {uploading && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-background rounded-2xl p-6 flex flex-col items-center gap-3 shadow-xl">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Uploading protocol...</p>
          </div>
        </div>
      )}
    </div>
  );
}
