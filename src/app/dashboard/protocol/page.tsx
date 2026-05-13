"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  FileText,
  Shield,
  Plus,
  Copy,
  Check,
  Trash2,
  Loader2,
  Save,
  Download,
  RefreshCw,
  Key,
  Clock,
  AlertTriangle,
  Upload,
} from "lucide-react";
import { cn, safeText, safeNumber, safeDate, safeJsonParse } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

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

interface ProtocolInvite {
  id: string;
  inviteCode: string;
  targetEmail: string;
  targetName: string | null;
  agentAccess: string;
  expiresAt: string;
  usedAt: string | null;
  status: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  USED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  EXPIRED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
  REVOKED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const ACTIVATE_URL = "https://trishulhub.com/protocol/activate";

export default function ProtocolManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "SUPER_ADMIN") {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  const [activeTab, setActiveTab] = useState("protocol");
  const [loading, setLoading] = useState(true);

  // Protocol editor state
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [protocolVersion, setProtocolVersion] = useState("");
  const [protocolTitle, setProtocolTitle] = useState("Trishul Protocol");
  const [protocolContent, setProtocolContent] = useState("");
  const [savingProtocol, setSavingProtocol] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Invites state
  const [invites, setInvites] = useState<ProtocolInvite[]>([]);

  // Generate dialog state
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState("72");
  const [creatingInvite, setCreatingInvite] = useState(false);

  // Result dialog
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [generatedExpiry, setGeneratedExpiry] = useState("");
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  // ── Fetch data ──
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
        }
      }
    } catch (err) {
      console.error("Failed to fetch protocol:", err);
    }
  }, []);

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/protocol/invites");
      if (res.ok) {
        const data = await res.json();
        setInvites(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to fetch invites:", err);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.role === "SUPER_ADMIN") {
      const loadAll = async () => {
        setLoading(true);
        await Promise.all([fetchProtocol(), fetchInvites()]);
        setLoading(false);
      };
      loadAll();
    }
  }, [session, fetchProtocol, fetchInvites]);

  // ── Protocol save ──
  const saveProtocol = async () => {
    setSavingProtocol(true);
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
        body.version = "5.1";
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
    setSavingProtocol(false);
  };

  // ── Token generation ──
  const createToken = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Team member email is required");
      return;
    }
    if (!protocolId) {
      toast.error("Save your protocol first before generating access documents");
      return;
    }
    setCreatingInvite(true);
    try {
      const res = await fetch("/api/protocol/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetEmail: inviteEmail.trim(),
          agentAccess: ["ALL"],
          expiresInHours: safeNumber(inviteExpiry, 72),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedCode(safeText(data.inviteCode));
        setGeneratedExpiry(safeText(data.expiresAt));
        setGeneratedEmail(inviteEmail.trim());
        setTokenDialogOpen(false);
        setResultDialogOpen(true);
        setInviteEmail("");
        setInviteExpiry("72");
        setCopiedCode(false);
        await fetchInvites();
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Failed to create access document"));
      }
    } catch {
      toast.error("Failed to create access document");
    }
    setCreatingInvite(false);
  };

  // ── Download small access document (GLM-compatible) ──
  const downloadAccessDocument = (code: string, email: string, expiresAt: string) => {
    const content = [
      "=============================================",
      "   TRISHULHUB — PROTOCOL ACCESS DOCUMENT",
      "=============================================",
      "",
      `Access Code: ${code}`,
      `Issued For:   ${email}`,
      `Generated:   ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      `Expires:     ${new Date(expiresAt || Date.now() + 72 * 3600000).toLocaleDateString()}`,
      "",
      "=============================================",
      "  HOW TO ACTIVATE YOUR PROTOCOL",
      "=============================================",
      "",
      "STEP 1: Go to the activation page:",
      ACTIVATE_URL,
      "",
      "STEP 2: Enter your access code (above)",
      "",
      "STEP 3: OTP will be sent to administrator",
      "         Contact your admin for the OTP",
      "",
      "STEP 4: Enter the 6-digit OTP",
      "",
      "STEP 5: Protocol activated! Copy it",
      "         and paste into your GLM workspace",
      "",
      "=============================================",
      "",
      "You can also paste this ENTIRE document",
      "into your GLM chat to start activation.",
      "",
      "WARNING: This document is for authorized",
      "use only. Do not share or distribute.",
      "Unauthorized access will be revoked.",
      "=============================================",
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trishul-access-${code}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Access document downloaded");
  };

  const revokeInvite = async (inviteId: string) => {
    try {
      const res = await fetch("/api/protocol/invites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inviteId, status: "REVOKED" }),
      });
      if (res.ok) {
        toast.success("Access document revoked");
        await fetchInvites();
      }
    } catch {
      toast.error("Failed to revoke");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // ── Upload protocol document ──
  const protocolFileInputRef = useRef<HTMLInputElement>(null);

  const handleProtocolFileUpload = async (file: File) => {
    const allowedExtensions = [".txt", ".md", ".pdf", ".doc", ".docx"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
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

  const onProtocolFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleProtocolFileUpload(file);
    e.target.value = "";
  };

  // ── Loading / Access check ──
  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session || session.user.role !== "SUPER_ADMIN") return null;

  const pendingCount = invites.filter((i) => i.status === "PENDING").length;
  const usedCount = invites.filter((i) => i.status === "USED").length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Protocol Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Edit master protocol and generate access documents for your team
          </p>
        </div>
        <div className="flex gap-2">
          {lastSaved && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Last saved: {safeDate(lastSaved)}
            </span>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Protocol</p>
              <p className="text-sm font-semibold">{protocolVersion ? `v${safeText(protocolVersion)} Live` : "No Version"}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Key className="h-4 w-4 text-yellow-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-sm font-semibold">{safeNumber(pendingCount)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Check className="h-4 w-4 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Activated</p>
              <p className="text-sm font-semibold">{safeNumber(usedCount)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Download className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Issued</p>
              <p className="text-sm font-semibold">{safeNumber(invites.length)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs — 2 only */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="protocol" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Master Protocol
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1.5">
            <Download className="h-4 w-4" /> Access Documents
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: Master Protocol Editor ═══ */}
        <TabsContent value="protocol" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Master Protocol</CardTitle>
              <CardDescription>
                This is the live protocol. Your team will follow this after OTP verification in GLM workspace.
                Only you (SUPER_ADMIN) can see and edit this content.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Protocol Title</label>
                <Input
                  value={protocolTitle}
                  onChange={(e) => setProtocolTitle(e.target.value)}
                  placeholder="Trishul Protocol"
                  className="max-w-md"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium">Protocol Content</label>
                  <div className="flex items-center gap-2">
                    <input ref={protocolFileInputRef} type="file" accept=".txt,.md,.pdf,.doc,.docx" className="hidden" onChange={onProtocolFileSelect} />
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => protocolFileInputRef.current?.click()}>
                      <Upload className="h-3.5 w-3.5 mr-1" /> Upload Document
                    </Button>
                    <span className="text-xs text-muted-foreground">{protocolContent.length} chars</span>
                  </div>
                </div>
                <Textarea
                  placeholder="Write your complete Trishul Protocol here..."
                  className="min-h-[500px] font-mono text-sm leading-relaxed"
                  value={protocolContent}
                  onChange={(e) => setProtocolContent(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Security rules are automatically added when team members activate
                </p>
                <Button onClick={saveProtocol} disabled={savingProtocol}>
                  {savingProtocol ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                  Save Protocol
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB 2: Access Documents ═══ */}
        <TabsContent value="documents" className="space-y-4 mt-6">
          {/* How it works */}
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="text-sm text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">How access documents work:</p>
                  <p>1. Generate an access document for a team member (small .txt file with just a code)</p>
                  <p>2. Share the file with them — they go to <code className="bg-background px-1.5 py-0.5 rounded text-xs">trishulhub.com/protocol/activate</code> and verify via OTP</p>
                  <p>3. After OTP verification, they copy the protocol and paste it into their GLM workspace</p>
                  <p className="text-amber-600 dark:text-amber-400 font-medium">The small document does NOT contain the protocol. OTP is sent to your email.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Access Documents</CardTitle>
                  <CardDescription className="mt-1">Generate and manage access documents for your team</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={fetchInvites}>
                    <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
                  </Button>
                  <Button onClick={() => setTokenDialogOpen(true)} size="sm">
                    <Plus className="h-4 w-4 mr-1.5" /> Generate New
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {invites.length === 0 ? (
                <div className="py-12 text-center px-4">
                  <Download className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">No access documents yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Click &quot;Generate New&quot; to create one for a team member.</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Access Code</TableHead>
                        <TableHead>Issued For</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invites.map((invite) => (
                        <TableRow key={safeText(invite.id)}>
                          <TableCell className="font-mono text-xs font-semibold">{safeText(invite.inviteCode)}</TableCell>
                          <TableCell className="text-sm">{safeText(invite.targetEmail)}</TableCell>
                          <TableCell>
                            <Badge className={cn("text-[10px]", STATUS_COLORS[invite.status] || "")}>
                              {safeText(invite.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{safeDate(invite.expiresAt)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {invite.status === "PENDING" && (
                                <>
                                  <Button variant="outline" size="sm" className="h-7"
                                    onClick={() => downloadAccessDocument(invite.inviteCode, invite.targetEmail, invite.expiresAt)}>
                                    <Download className="h-3.5 w-3.5 mr-1" /> Download
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive"
                                    onClick={() => revokeInvite(invite.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              {invite.status === "USED" && (
                                <span className="text-xs text-green-600 flex items-center gap-1">
                                  <Check className="h-3 w-3" /> Activated
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ Generate Token Dialog ═══ */}
      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Access Document</DialogTitle>
            <DialogDescription>
              Create a small access document for a team member. This document only contains a code — NOT the protocol.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Team Member Email *</label>
              <Input type="email" placeholder="name@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Expires In (hours)</label>
              <Input type="number" min="1" max="720" value={inviteExpiry} onChange={(e) => setInviteExpiry(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Default: 72 hours (3 days)</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>Cancel</Button>
            <Button onClick={createToken} disabled={creatingInvite}>
              {creatingInvite ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Token Result Dialog ═══ */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" /> Access Document Ready
            </DialogTitle>
            <DialogDescription>Share this document with your team member. OTP will be sent to your email when they activate.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-4 bg-muted/50 rounded-lg border-2 border-dashed">
              <p className="text-xs text-muted-foreground mb-1">Access Code</p>
              <p className="font-mono text-lg font-bold tracking-wider">{safeText(generatedCode)}</p>
            </div>
            <p className="text-xs text-muted-foreground">For: {safeText(generatedEmail)} &middot; Expires: {safeDate(generatedExpiry)}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => copyToClipboard(generatedCode)}>
                {copiedCode ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
                {copiedCode ? "Copied!" : "Copy Code"}
              </Button>
              <Button className="flex-1" onClick={() => downloadAccessDocument(generatedCode, generatedEmail, generatedExpiry)}>
                <Download className="h-4 w-4 mr-1.5" /> Download File
              </Button>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                <strong>Next steps:</strong> Send the file to your team member. They activate at
                trishulhub.com/protocol/activate. OTP will be sent to your email when they submit the code.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setResultDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
