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
  ChevronDown,
  ChevronUp,
  UserCog,
  Ban,
  RefreshCw,
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
  stageDescriptions: string;
  agentSkills: string;
  isActive: boolean;
  createdAt: string;
  _count?: { invites: number; accessLogs: number };
  creator?: { id: string; name: string; email: string };
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
  protocol?: { id: string; version: string; title: string };
  creator?: { id: string; name: string; email: string };
}

interface AccessLog {
  id: string;
  userEmail: string;
  agentAccess: string;
  ipAddress: string | null;
  createdAt: string;
  protocol?: { version: string; title: string };
}

interface UserProtocolAccess {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  protocolId: string;
  agentAccess: string;
  isActive: boolean;
  verifiedAt: string;
  verifiedVia: string;
  lastAccessAt: string;
  user?: { id: string; name: string; email: string; role: string };
  protocol?: { id: string; version: string; title: string };
}

interface StageItem {
  stage: number;
  title: string;
  description: string;
  deliverables: string;
}

interface AgentSkillItem {
  agentType: string;
  name: string;
  skills: string[];
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

  // Access control
  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "SUPER_ADMIN") {
      router.push("/dashboard");
    }
  }, [status, session, router]);

  // State
  const [activeTab, setActiveTab] = useState("editor");
  const [protocols, setProtocols] = useState<ProtocolVersion[]>([]);
  const [invites, setInvites] = useState<ProtocolInvite[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [userProtocolAccessList, setUserProtocolAccessList] = useState<UserProtocolAccess[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formVersion, setFormVersion] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formStages, setFormStages] = useState<StageItem[]>([]);
  const [formAgentSkills, setFormAgentSkills] = useState<AgentSkillItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [expandedStage, setExpandedStage] = useState<number | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  // Invite dialog state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAgents, setInviteAgents] = useState<string[]>([]);
  const [inviteProtocolId, setInviteProtocolId] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState("24");
  const [creatingInvite, setCreatingInvite] = useState(false);

  // Token created dialog (simpler — just shows the token code)
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [generatedCode, setGeneratedCode] = useState("");
  const [generatedExpiry, setGeneratedExpiry] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  // Agent access editing state
  const [editingUserAccess, setEditingUserAccess] = useState<Record<string, string[]>>({});
  const [savingUserAccess, setSavingUserAccess] = useState<string | null>(null);

  // Fetch data
  const fetchProtocols = useCallback(async () => {
    try {
      const res = await fetch("/api/protocol");
      if (res.ok) {
        const data = await res.json();
        setProtocols(safeArray<ProtocolVersion>(data));
      }
    } catch (err) {
      console.error("Failed to fetch protocols:", err);
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

  const fetchAccessLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/protocol/invites?status=USED");
      if (res.ok) {
        const data = await res.json();
        const usedInvites = safeArray<ProtocolInvite>(data);
        const logs: AccessLog[] = usedInvites.map((inv) => ({
          id: inv.id,
          userEmail: inv.targetEmail,
          agentAccess: inv.agentAccess,
          ipAddress: null,
          createdAt: inv.usedAt || inv.createdAt,
          protocol: inv.protocol,
        }));
        setAccessLogs(logs);
      }
    } catch (err) {
      console.error("Failed to fetch access logs:", err);
    }
  }, []);

  const fetchUserProtocolAccess = useCallback(async () => {
    try {
      const res = await fetch("/api/protocol/agent-access");
      if (res.ok) {
        const data = await res.json();
        const list = safeArray<UserProtocolAccess>(data);
        setUserProtocolAccessList(list);
        // Initialize editing state with current values
        const editState: Record<string, string[]> = {};
        list.forEach((item) => {
          editState[item.userId] = safeJsonParse<string[]>(item.agentAccess, []);
        });
        setEditingUserAccess(editState);
      }
    } catch (err) {
      console.error("Failed to fetch user protocol access:", err);
    }
  }, []);

  useEffect(() => {
    if (session?.user?.role === "SUPER_ADMIN") {
      const loadAll = async () => {
        setLoading(true);
        await Promise.all([fetchProtocols(), fetchInvites(), fetchAccessLogs(), fetchUserProtocolAccess()]);
        setLoading(false);
      };
      loadAll();
    }
  }, [session, fetchProtocols, fetchInvites, fetchAccessLogs, fetchUserProtocolAccess]);

  // ── Editor handlers ──
  const loadProtocolForEdit = (protocol: ProtocolVersion) => {
    setEditingId(protocol.id);
    setFormVersion(protocol.version);
    setFormTitle(protocol.title);
    setFormContent(protocol.content);
    setFormStages(safeJsonParse<StageItem[]>(protocol.stageDescriptions, []));
    setFormAgentSkills(safeJsonParse<AgentSkillItem[]>(protocol.agentSkills, []));
    setActiveTab("editor");
  };

  const createNewProtocol = () => {
    setEditingId(null);
    setFormVersion("");
    setFormTitle("Trishul Protocol");
    setFormContent("");
    setFormStages([{ stage: 0, title: "", description: "", deliverables: "" }]);
    setFormAgentSkills(
      ALL_AGENT_TYPES.map((a) => ({ agentType: a.value, name: a.label, skills: [""] }))
    );
    setActiveTab("editor");
  };

  const saveProtocol = async () => {
    if (!formVersion.trim()) {
      toast.error("Version is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        version: formVersion.trim(),
        title: formTitle.trim() || "Trishul Protocol",
        content: formContent,
        stageDescriptions: JSON.stringify(formStages.filter((s) => s.title.trim())),
        agentSkills: JSON.stringify(
          formAgentSkills
            .filter((a) => a.skills.some((s) => s.trim()))
            .map((a) => ({ ...a, skills: a.skills.filter((s) => s.trim()) }))
        ),
      };

      let res: Response;
      if (editingId) {
        res = await fetch("/api/protocol", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingId, ...body }),
        });
      } else {
        res = await fetch("/api/protocol", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (res.ok) {
        toast.success(editingId ? "Protocol updated" : "Protocol created");
        await fetchProtocols();
        setEditingId(null);
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Failed to save"));
      }
    } catch (err) {
      toast.error("Failed to save protocol");
    }
    setSaving(false);
  };

  const addStage = () => {
    setFormStages([...formStages, { stage: formStages.length, title: "", description: "", deliverables: "" }]);
  };

  const removeStage = (index: number) => {
    setFormStages(formStages.filter((_, i) => i !== index));
  };

  const updateStage = (index: number, field: keyof StageItem, value: string | number) => {
    const updated = [...formStages];
    updated[index] = { ...updated[index], [field]: value };
    setFormStages(updated);
  };

  const addSkill = (agentIndex: number) => {
    const updated = [...formAgentSkills];
    updated[agentIndex] = { ...updated[agentIndex], skills: [...updated[agentIndex].skills, ""] };
    setFormAgentSkills(updated);
  };

  const removeSkill = (agentIndex: number, skillIndex: number) => {
    const updated = [...formAgentSkills];
    updated[agentIndex] = { ...updated[agentIndex], skills: updated[agentIndex].skills.filter((_, i) => i !== skillIndex) };
    setFormAgentSkills(updated);
  };

  const updateSkill = (agentIndex: number, skillIndex: number, value: string) => {
    const updated = [...formAgentSkills];
    updated[agentIndex].skills[skillIndex] = value;
    setFormAgentSkills(updated);
  };

  // ── Token (invite) handlers ──
  const createToken = async () => {
    if (!inviteEmail.trim()) {
      toast.error("Target email is required");
      return;
    }
    if (inviteAgents.length === 0) {
      toast.error("Select at least one agent access");
      return;
    }
    setCreatingInvite(true);
    try {
      const body: Record<string, unknown> = {
        targetEmail: inviteEmail.trim(),
        agentAccess: inviteAgents,
        expiresInHours: safeNumber(inviteExpiry, 24),
      };
      if (inviteProtocolId) body.protocolId = inviteProtocolId;

      const res = await fetch("/api/protocol/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedCode(safeText(data.inviteCode));
        setGeneratedExpiry(safeText(data.expiresAt));
        setInviteDialogOpen(false);
        setTokenDialogOpen(true);
        // Reset form
        setInviteEmail("");
        setInviteAgents([]);
        setInviteExpiry("24");
        setCopiedCode(false);
        await fetchInvites();
      } else {
        const data = await res.json();
        toast.error(safeText(data.error, "Failed to create token"));
      }
    } catch (err) {
      toast.error("Failed to create token");
    }
    setCreatingInvite(false);
  };

  const revokeInvite = async (inviteId: string) => {
    try {
      const res = await fetch("/api/protocol/invites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inviteId, status: "REVOKED" }),
      });
      if (res.ok) {
        toast.success("Token revoked");
        await fetchInvites();
      }
    } catch {
      toast.error("Failed to revoke token");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // ── Agent Access handlers ──
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
        await fetchUserProtocolAccess();
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
        await fetchUserProtocolAccess();
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Protocol Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create protocol versions, manage access tokens, and control agent permissions
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={createNewProtocol} size="sm">
            <Plus className="h-4 w-4 mr-1.5" /> New Version
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="editor" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Protocol
          </TabsTrigger>
          <TabsTrigger value="tokens" className="flex items-center gap-1.5">
            <Users className="h-4 w-4" /> Tokens
          </TabsTrigger>
          <TabsTrigger value="agent-access" className="flex items-center gap-1.5">
            <UserCog className="h-4 w-4" /> Agent Access
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1.5">
            <Shield className="h-4 w-4" /> Logs
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: Protocol Editor ── */}
        <TabsContent value="editor" className="space-y-6 mt-6">
          {/* Version Selector */}
          {!editingId && protocols.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Existing Versions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {protocols.map((p) => (
                    <div
                      key={safeText(p.id)}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                        p.isActive
                          ? "border-primary/50 bg-primary/5"
                          : "border-border hover:bg-accent/50"
                      )}
                      onClick={() => loadProtocolForEdit(p)}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">v{safeText(p.version)}</span>
                          {p.isActive && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Active</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {safeText(p.title)} &middot; {safeText(p.creator?.name)}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{safeDate(p.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Editor Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {editingId ? `Edit Protocol v${safeText(formVersion)}` : "Create New Protocol Version"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Version *</label>
                  <Input
                    placeholder="e.g., 5.0"
                    value={formVersion}
                    onChange={(e) => setFormVersion(e.target.value)}
                    disabled={!!editingId}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Title</label>
                  <Input
                    placeholder="Protocol title"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Protocol Content (Markdown)</label>
                <Textarea
                  placeholder="Full protocol content in markdown..."
                  className="min-h-[200px] font-mono text-sm"
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                />
              </div>

              {/* Stage Descriptions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Stage Descriptions</label>
                  <Button variant="outline" size="sm" onClick={addStage}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Stage
                  </Button>
                </div>
                <div className="space-y-2">
                  {formStages.map((stage, idx) => (
                    <div key={idx} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <button
                          type="button"
                          className="flex items-center gap-2 text-sm font-medium"
                          onClick={() => setExpandedStage(expandedStage === idx ? null : idx)}
                        >
                          <span className="text-primary font-bold">Stage {safeNumber(stage.stage)}</span>
                          <span className="text-muted-foreground">{safeText(stage.title) || "(untitled)"}</span>
                          {expandedStage === idx ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                        {formStages.length > 1 && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeStage(idx)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {expandedStage === idx && (
                        <div className="space-y-2 pt-1">
                          <Input placeholder="Stage title" value={stage.title} onChange={(e) => updateStage(idx, "title", e.target.value)} />
                          <Textarea placeholder="Description" rows={2} value={stage.description} onChange={(e) => updateStage(idx, "description", e.target.value)} />
                          <Input placeholder="Deliverables (comma-separated)" value={stage.deliverables} onChange={(e) => updateStage(idx, "deliverables", e.target.value)} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Agent Skills */}
              <div>
                <label className="text-sm font-medium mb-2 block">Agent Skills</label>
                <div className="space-y-2">
                  {formAgentSkills.map((agent, agentIdx) => (
                    <div key={safeText(agent.agentType)} className="border rounded-lg overflow-hidden">
                      <button
                        type="button"
                        className="flex items-center justify-between w-full p-3 hover:bg-accent/50 transition-colors"
                        onClick={() => setExpandedAgent(expandedAgent === agent.agentType ? null : agent.agentType)}
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">{safeText(agent.agentType)}</Badge>
                          <span className="text-sm font-medium">{safeText(agent.name)}</span>
                          <span className="text-xs text-muted-foreground">
                            ({safeNumber(agent.skills.filter((s) => s.trim()).length)} skills)
                          </span>
                        </div>
                        {expandedAgent === agent.agentType ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                      {expandedAgent === agent.agentType && (
                        <div className="p-3 pt-0 space-y-1.5 border-t">
                          {agent.skills.map((skill, skillIdx) => (
                            <div key={skillIdx} className="flex gap-2">
                              <Input placeholder="Skill description" className="text-sm" value={skill} onChange={(e) => updateSkill(agentIdx, skillIdx, e.target.value)} />
                              {agent.skills.length > 1 && (
                                <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0 text-destructive hover:text-destructive" onClick={() => removeSkill(agentIdx, skillIdx)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                          <Button variant="outline" size="sm" className="mt-1" onClick={() => addSkill(agentIdx)}>
                            <Plus className="h-3.5 w-3.5 mr-1" /> Add Skill
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={saveProtocol} disabled={saving} className="w-full sm:w-auto">
                {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
                {editingId ? "Update Protocol" : "Create Protocol"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: Access Tokens ── */}
        <TabsContent value="tokens" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Access Tokens</h2>
              <p className="text-sm text-muted-foreground">
                Generate tokens for users. When a user submits a token, an OTP is sent to your email.
              </p>
            </div>
            <Button onClick={() => setInviteDialogOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1.5" /> Generate Token
            </Button>
          </div>

          {invites.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No tokens created yet</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Token Code</TableHead>
                        <TableHead>Target Email</TableHead>
                        <TableHead>Agent Access</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invites.map((invite) => {
                        const agentAccessList = safeJsonParse<string[]>(invite.agentAccess, []);
                        return (
                          <TableRow key={safeText(invite.id)}>
                            <TableCell className="font-mono text-xs font-semibold">
                              {safeText(invite.inviteCode)}
                            </TableCell>
                            <TableCell className="text-sm">{safeText(invite.targetEmail)}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {agentAccessList.slice(0, 3).map((a) => (
                                  <Badge key={a} variant="outline" className="text-[10px] px-1.5">{safeText(a)}</Badge>
                                ))}
                                {agentAccessList.length > 3 && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5">+{agentAccessList.length - 3}</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn("text-[10px]", STATUS_COLORS[invite.status] || "")}>
                                {safeText(invite.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{safeDate(invite.createdAt)}</TableCell>
                            <TableCell className="text-right">
                              {invite.status === "PENDING" && (
                                <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive" onClick={() => revokeInvite(invite.id)}>
                                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Revoke
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB 3: Agent Access Control ── */}
        <TabsContent value="agent-access" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Agent Access Control</h2>
              <p className="text-sm text-muted-foreground">
                Manage which agents each verified user can access. Changes take effect immediately.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={fetchUserProtocolAccess}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
            </Button>
          </div>

          {userProtocolAccessList.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <UserCog className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No verified users yet</p>
                <p className="text-xs text-muted-foreground mt-1">Users will appear here after they verify their access token.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Protocol</TableHead>
                        <TableHead>Agent Access</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userProtocolAccessList.map((ua) => {
                        const currentAgents = editingUserAccess[ua.userId] || [];
                        return (
                          <TableRow key={safeText(ua.id)}>
                            <TableCell>
                              <div>
                                <p className="text-sm font-medium">{safeText(ua.userName) || safeText(ua.user?.name)}</p>
                                <p className="text-xs text-muted-foreground">{safeText(ua.userEmail) || safeText(ua.user?.email)}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">v{safeText(ua.protocol?.version)}</Badge>
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
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── TAB 4: Access Logs ── */}
        <TabsContent value="logs" className="space-y-6 mt-6">
          <div>
            <h2 className="text-lg font-semibold">Access Logs</h2>
            <p className="text-sm text-muted-foreground">Records of all protocol access events</p>
          </div>

          {accessLogs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Shield className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No access logs yet</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Protocol</TableHead>
                        <TableHead>Agent Access</TableHead>
                        <TableHead>Accessed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accessLogs.map((log) => {
                        const agentAccessList = safeJsonParse<string[]>(log.agentAccess, []);
                        return (
                          <TableRow key={safeText(log.id)}>
                            <TableCell className="text-sm">{safeText(log.userEmail)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">v{safeText(log.protocol?.version)}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {agentAccessList.map((a) => (
                                  <Badge key={a} variant="secondary" className="text-[10px] px-1.5">{safeText(a)}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{safeDate(log.createdAt)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Generate Token Dialog ── */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Access Token</DialogTitle>
            <DialogDescription>
              Create a token for a user. When they submit it, an OTP will be sent to your email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Target Email *</label>
              <Input
                type="email"
                placeholder="user@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Agent Access *</label>
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
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={inviteAgents.includes(agent.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setInviteAgents([...inviteAgents, agent.value]);
                        } else {
                          setInviteAgents(inviteAgents.filter((a) => a !== agent.value));
                        }
                      }}
                    />
                    {agent.label}
                  </label>
                ))}
              </div>
            </div>
            {protocols.length > 1 && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Protocol Version</label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={inviteProtocolId}
                  onChange={(e) => setInviteProtocolId(e.target.value)}
                >
                  <option value="">Active version (default)</option>
                  {protocols.map((p) => (
                    <option key={safeText(p.id)} value={p.id}>
                      v{safeText(p.version)} {p.isActive ? "(Active)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Expires In (hours)</label>
              <Input
                type="number"
                min="1"
                max="168"
                value={inviteExpiry}
                onChange={(e) => setInviteExpiry(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>Cancel</Button>
            <Button onClick={createToken} disabled={creatingInvite}>
              {creatingInvite ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Generate Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Token Created Dialog (just shows token code) ── */}
      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-500" /> Token Generated
            </DialogTitle>
            <DialogDescription>
              Share this token with the user. When they submit it, an OTP will be sent to your email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-4 bg-muted/50 rounded-lg border-2 border-dashed">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Access Token</p>
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-lg font-bold tracking-wider">{safeText(generatedCode)}</p>
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => copyToClipboard(generatedCode)}>
                  {copiedCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">Expires: {safeText(generatedExpiry)}</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setTokenDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
