"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  FileText,
  Users,
  Shield,
  Plus,
  Copy,
  Check,
  X,
  Trash2,
  Loader2,
  Save,
  Download,
  UserCog,
  Ban,
  RefreshCw,
  Key,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { cn, safeText, safeNumber, safeDate, safeArray, safeJsonParse } from "@/lib/utils";
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

interface UserProtocolAccess {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  agentAccess: string;
  isActive: boolean;
  verifiedAt: string;
  verifiedVia: string;
  user?: { id: string; name: string; email: string; role: string };
}

const ALL_AGENT_TYPES = [
  { value: "DEV", label: "Dev Agent" },
  { value: "CLIENT_HUNTER", label: "Client Hunter" },
  { value: "FINANCE", label: "Finance Agent" },
  { value: "PROJECT_MANAGER", label: "Project Manager" },
  { value: "HR", label: "HR Agent" },
  { value: "CONTENT", label: "Content Agent" },
  { value: "SUPPORT", label: "Support Agent" },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  USED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  EXPIRED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
  REVOKED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function ProtocolManagementPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Access control — only SUPER_ADMIN
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "SUPER_ADMIN") {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  const [activeTab, setActiveTab] = useState("protocol");
  const [loading, setLoading] = useState(true);

  // Protocol editor state
  const [protocolId, setProtocolId] = useState<string | null>(null);
  const [protocolTitle, setProtocolTitle] = useState("Trishul Protocol v5.0");
  const [protocolContent, setProtocolContent] = useState("");
  const [savingProtocol, setSavingProtocol] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Invites state
  const [invites, setInvites] = useState<ProtocolInvite[]>([]);

  // User access state
  const [userAccessList, setUserAccessList] = useState<UserProtocolAccess[]>([]);
  const [editingUserAccess, setEditingUserAccess] = useState<Record<string, string[]>>({});
  const [savingUserAccess, setSavingUserAccess] = useState<string | null>(null);

  // Generate token dialog state
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAgents, setInviteAgents] = useState<string[]>([]);
  const [inviteExpiry, setInviteExpiry] = useState("72");
  const [creatingInvite, setCreatingInvite] = useState(false);

  // Token result dialog
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [generatedExpiry, setGeneratedExpiry] = useState("");
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
        setInvites(safeArray<ProtocolInvite>(data));
      }
    } catch (err) {
      console.error("Failed to fetch invites:", err);
    }
  }, []);

  const fetchUserAccess = useCallback(async () => {
    try {
      const res = await fetch("/api/protocol/agent-access");
      if (res.ok) {
        const data = await res.json();
        const list = safeArray<UserProtocolAccess>(data);
        setUserAccessList(list);
        const editState: Record<string, string[]> = {};
        list.forEach((item) => {
          editState[item.userId] = safeJsonParse<string[]>(item.agentAccess, []);
        });
        setEditingUserAccess(editState);
      }
    } catch (err) {
      console.error("Failed to fetch user access:", err);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.role === "SUPER_ADMIN") {
      const loadAll = async () => {
        setLoading(true);
        await Promise.all([fetchProtocol(), fetchInvites(), fetchUserAccess()]);
        setLoading(false);
      };
      loadAll();
    }
  }, [session, fetchProtocol, fetchInvites, fetchUserAccess]);

  // ── Protocol save ──
  const saveProtocol = async () => {
    setSavingProtocol(true);
    try {
      const body: Record<string, string> = {
        title: protocolTitle.trim() || "Trishul Protocol",
        content: protocolContent,
      };

      let res: Response;
      if (protocolId) {
        res = await fetch("/api/protocol", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: protocolId, ...body }),
        });
      } else {
        // Auto-create first protocol version
        body.version = "5.0";
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
    } catch (err) {
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
    if (inviteAgents.length === 0) {
      toast.error("Select at least one agent");
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
          agentAccess: inviteAgents,
          expiresInHours: safeNumber(inviteExpiry, 72),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedCode(safeText(data.inviteCode));
        setGeneratedExpiry(safeText(data.expiresAt));
        setTokenDialogOpen(false);
        setResultDialogOpen(true);
        setInviteEmail("");
        setInviteAgents([]);
        setInviteExpiry("72");
        setCopiedCode(false);
        await fetchInvites();
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Failed to create access document"));
      }
    } catch (err) {
      toast.error("Failed to create access document");
    }
    setCreatingInvite(false);
  };

  // ── Download small access document ──
  const downloadAccessDocument = (code: string, targetEmail: string) => {
    const content = [
      "========================================",
      "   TRISHULHUB — PROTOCOL ACCESS KEY",
      "========================================",
      "",
      `Access Code: ${code}`,
      `Issued For:   ${targetEmail}`,
      `Generated:   ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
      `Expires:     ${new Date(generatedExpiry || Date.now() + 72 * 3600000).toLocaleDateString()}`,
      "",
      "========================================",
      "INSTRUCTIONS:",
      "1. Go to your TrishulHub Dashboard",
      "2. Open 'Protocol Access' page",
      "3. Upload this file OR enter the code above",
      "4. An OTP will be sent to administrator",
      "5. Contact administrator for the OTP",
      "6. Enter OTP to activate protocol access",
      "========================================",
      "",
      "WARNING: This key is for authorized use only.",
      "Do not share or distribute this document.",
      "Unauthorized access will be revoked.",
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

  // ── Agent access handlers ──
  const toggleAgentForUser = (userId: string, agentType: string) => {
    const current = editingUserAccess[userId] || [];
    const updated = current.includes(agentType)
      ? current.filter((a) => a !== agentType)
      : [...current, agentType];
    setEditingUserAccess((prev) => ({ ...prev, [userId]: updated }));
  };

  const saveUserAgentAccess = async (userId: string) => {
    const agents = editingUserAccess[userId] || [];
    setSavingUserAccess(userId);
    try {
      const res = await fetch("/api/protocol/agent-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, agentAccess: agents }),
      });
      if (res.ok) {
        toast.success("Agent access updated");
        await fetchUserAccess();
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Failed to update"));
      }
    } catch {
      toast.error("Failed to update agent access");
    }
    setSavingUserAccess(null);
  };

  const revokeUserAccess = async (userId: string) => {
    try {
      const res = await fetch("/api/protocol/agent-access", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        toast.success("Protocol access revoked");
        await fetchUserAccess();
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Failed to revoke"));
      }
    } catch {
      toast.error("Failed to revoke access");
    }
  };

  // ── Loading / Access check ──
  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session || session.user.role !== "SUPER_ADMIN") {
    return null;
  }

  const pendingCount = invites.filter((i) => i.status === "PENDING").length;
  const activeUsersCount = userAccessList.filter((u) => u.isActive).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Protocol Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Edit your master protocol, control team access, and generate access documents
          </p>
        </div>
        <div className="flex gap-2">
          {lastSaved && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last saved: {safeDate(lastSaved)}
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
              <p className="text-sm font-semibold">v5.0 Live</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="h-4 w-4 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active Users</p>
              <p className="text-sm font-semibold">{safeNumber(activeUsersCount)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Key className="h-4 w-4 text-yellow-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pending Tokens</p>
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
              <p className="text-xs text-muted-foreground">Total Issued</p>
              <p className="text-sm font-semibold">{safeNumber(invites.length)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="protocol" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Master Protocol
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-1.5">
            <UserCog className="h-4 w-4" /> Team Access
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1.5">
            <Download className="h-4 w-4" /> Access Documents
          </TabsTrigger>
        </TabsList>

        {/* ═══════════ TAB 1: Master Protocol Editor ═══════════ */}
        <TabsContent value="protocol" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your Master Protocol</CardTitle>
              <CardDescription>
                This is the live Trishul Protocol. Edit it anytime and click Save. Your team will use this protocol after they authenticate.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Protocol Title</label>
                <Input
                  value={protocolTitle}
                  onChange={(e) => setProtocolTitle(e.target.value)}
                  placeholder="Trishul Protocol v5.0"
                  className="max-w-md"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium">Protocol Content</label>
                  <span className="text-xs text-muted-foreground">
                    {protocolContent.length} characters
                  </span>
                </div>
                <Textarea
                  placeholder="Write your complete Trishul Protocol here...

Include everything: stages, agent instructions, workflows, rules, etc.

This is the master document. Your team will follow this protocol after OTP verification.
They will NEVER see this raw document — it's only used by the workspace agents."
                  className="min-h-[500px] font-mono text-sm leading-relaxed"
                  value={protocolContent}
                  onChange={(e) => setProtocolContent(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Only you (SUPER_ADMIN) can see and edit this content
                </p>
                <Button onClick={saveProtocol} disabled={savingProtocol}>
                  {savingProtocol ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1.5" />
                  )}
                  Save Protocol
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ TAB 2: Team Agent Access Control ═══════════ */}
        <TabsContent value="team" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Agent Access Control</CardTitle>
                  <CardDescription className="mt-1">
                    Choose which agents each team member can use. Changes take effect immediately.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchUserAccess}>
                  <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {userAccessList.length === 0 ? (
                <div className="py-12 text-center px-4">
                  <UserCog className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">No team members have protocol access yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Generate access documents and share them with your team. They will appear here after OTP verification.
                  </p>
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[160px]">Team Member</TableHead>
                        <TableHead>Agent Access</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userAccessList.map((ua) => {
                        const currentAgents = editingUserAccess[ua.userId] || [];
                        return (
                          <TableRow key={safeText(ua.id)}>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium">
                                  {safeText(ua.userName) || safeText(ua.user?.name) || "Unknown"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {safeText(ua.userEmail) || safeText(ua.user?.email)}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1.5">
                                {ALL_AGENT_TYPES.map((agent) => (
                                  <label
                                    key={agent.value}
                                    className={cn(
                                      "flex items-center gap-1 px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors border",
                                      currentAgents.includes(agent.value)
                                        ? "border-primary bg-primary/10 text-primary font-medium"
                                        : "border-border text-muted-foreground hover:bg-accent/50"
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      className="sr-only"
                                      checked={currentAgents.includes(agent.value)}
                                      onChange={() => toggleAgentForUser(ua.userId, agent.value)}
                                    />
                                    {agent.label}
                                  </label>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn(
                                "text-[10px]",
                                ua.isActive
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                              )}>
                                {ua.isActive ? "Active" : "Revoked"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7"
                                  disabled={savingUserAccess === ua.userId || !ua.isActive}
                                  onClick={() => saveUserAgentAccess(ua.userId)}
                                >
                                  {savingUserAccess === ua.userId ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Save className="h-3.5 w-3.5 mr-1" />
                                  )}
                                  Save
                                </Button>
                                {ua.isActive && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-destructive hover:text-destructive"
                                    onClick={() => revokeUserAccess(ua.userId)}
                                  >
                                    <Ban className="h-3.5 w-3.5 mr-1" /> Revoke
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ TAB 3: Access Documents ═══════════ */}
        <TabsContent value="documents" className="space-y-4 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Access Documents</CardTitle>
                  <CardDescription className="mt-1">
                    Generate access keys for your team. Download the small document and share it with them.
                    When they upload it, OTP will be sent to your email.
                  </CardDescription>
                </div>
                <Button onClick={() => setTokenDialogOpen(true)} size="sm">
                  <Plus className="h-4 w-4 mr-1.5" /> Generate New
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {invites.length === 0 ? (
                <div className="py-12 text-center px-4">
                  <Download className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">No access documents generated yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click &quot;Generate New&quot; to create an access document for a team member.
                  </p>
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Access Code</TableHead>
                        <TableHead>Issued For</TableHead>
                        <TableHead>Agents</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invites.map((invite) => {
                        const agentList = safeJsonParse<string[]>(invite.agentAccess, []);
                        return (
                          <TableRow key={safeText(invite.id)}>
                            <TableCell className="font-mono text-xs font-semibold">
                              {safeText(invite.inviteCode)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {safeText(invite.targetEmail)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {agentList.slice(0, 2).map((a) => (
                                  <Badge key={a} variant="outline" className="text-[10px] px-1.5">{safeText(a)}</Badge>
                                ))}
                                {agentList.length > 2 && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5">+{agentList.length - 2}</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn("text-[10px]", STATUS_COLORS[invite.status] || "")}>
                                {safeText(invite.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {safeDate(invite.expiresAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {invite.status === "PENDING" && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7"
                                      onClick={() => downloadAccessDocument(invite.inviteCode, invite.targetEmail)}
                                    >
                                      <Download className="h-3.5 w-3.5 mr-1" /> Download
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-destructive hover:text-destructive"
                                      onClick={() => revokeInvite(invite.id)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══════════ Generate Token Dialog ═══════════ */}
      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Access Document</DialogTitle>
            <DialogDescription>
              Create an access key for a team member. You can download it as a small file and share it with them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Team Member Email *</label>
              <Input
                type="email"
                placeholder="name@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Agent Access * (select what they can use)</label>
              <div className="flex flex-wrap gap-2">
                {ALL_AGENT_TYPES.map((agent) => (
                  <label
                    key={agent.value}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-sm transition-colors",
                      inviteAgents.includes(agent.value)
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:bg-accent/50"
                    )}
                  >
                    <input type="checkbox" className="sr-only"
                      checked={inviteAgents.includes(agent.value)}
                      onChange={(e) => {
                        if (e.target.checked) setInviteAgents([...inviteAgents, agent.value]);
                        else setInviteAgents(inviteAgents.filter((a) => a !== agent.value));
                      }}
                    />
                    {agent.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Expires In (hours)</label>
              <Input type="number" min="1" max="720" value={inviteExpiry}
                onChange={(e) => setInviteExpiry(e.target.value)} />
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

      {/* ═══════════ Token Result Dialog ═══════════ */}
      <Dialog open={resultDialogOpen} onOpenChange={setResultDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" /> Access Document Ready
            </DialogTitle>
            <DialogDescription>
              Download this document and share it with your team member. Do NOT share the code publicly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-4 bg-muted/50 rounded-lg border-2 border-dashed">
              <p className="text-xs text-muted-foreground mb-1">Access Code</p>
              <p className="font-mono text-lg font-bold tracking-wider">{safeText(generatedCode)}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Expires: {safeDate(generatedExpiry)}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => copyToClipboard(generatedCode)}
              >
                {copiedCode ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
                {copiedCode ? "Copied!" : "Copy Code"}
              </Button>
              <Button
                className="flex-1"
                onClick={() => downloadAccessDocument(generatedCode, inviteEmail)}
              >
                <Download className="h-4 w-4 mr-1.5" /> Download File
              </Button>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                <strong>Next steps:</strong> Share the downloaded file with your team member.
                When they upload it, an OTP will be sent to your email. Give them the OTP verbally to activate their access.
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
