"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Plus, Trash2, Key, AlertTriangle, CheckCircle2, Loader2,
  Edit2, Eye, EyeOff, RefreshCw, Shield, Zap, DollarSign,
  Activity, ArrowRightLeft, Copy, ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { AGENT_TYPES as AGENT_TYPE_CONFIG, type AgentType } from "@/lib/types";

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  EXHAUSTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  ERROR: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
};

const statusIcons: Record<string, string> = {
  ACTIVE: "text-green-500",
  EXHAUSTED: "text-red-500",
  ERROR: "text-yellow-500",
};

const providerInfo: Record<string, { name: string; color: string; url: string; icon: string }> = {
  ZAI: { name: "Z.ai", color: "bg-blue-500", url: "https://open.bigmodel.cn", icon: "🤖" },
  OPENROUTER: { name: "OpenRouter", color: "bg-purple-500", url: "https://openrouter.ai/keys", icon: "🔀" },
  GOOGLE_AI: { name: "Google AI", color: "bg-green-500", url: "https://aistudio.google.com/apikey", icon: "🧠" },
  NVIDIA: { name: "NVIDIA (Trishul AI)", color: "bg-emerald-500", url: "https://build.nvidia.com", icon: "🔱" },
  OTHER: { name: "Other", color: "bg-gray-500", url: "#", icon: "🔑" },
};

const agentTypeKeys = Object.keys(AGENT_TYPE_CONFIG) as AgentType[];

interface ApiKeyData {
  id: string;
  provider: string;
  keyName: string;
  keyValue: string;
  monthlyBudget: number;
  currentSpend: number;
  status: string;
  priority: number;
  assignedAgents: string;
  _count?: { usageLogs: number; agents: number };
}

export default function ApiKeysPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isSessionLoading = status === "loading";
  const userRole = session?.user?.role || "DEVELOPER";
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKeyData | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { valid: boolean; error?: string; hint?: string } | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [showKeyValues, setShowKeyValues] = useState<Record<string, boolean>>({});

  // Form state
  const [formProvider, setFormProvider] = useState("ZAI");
  const [formKeyName, setFormKeyName] = useState("");
  const [formKeyValue, setFormKeyValue] = useState("");
  const [formBudget, setFormBudget] = useState("18");
  const [formPriority, setFormPriority] = useState("1");
  const [formAssignedAgents, setFormAssignedAgents] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const resetForm = () => {
    setFormProvider("ZAI");
    setFormKeyName("");
    setFormKeyValue("");
    setFormBudget("18");
    setFormPriority("1");
    setFormAssignedAgents([]);
  };

  const fetchKeys = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/api-keys", { credentials: 'include' });
      if (res.status === 401) {
        setKeys([]);
        setError("Your session has expired. Please sign in again.");
        setTimeout(() => { window.location.href = "/login"; }, 1500);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setKeys(data);
        } else {
          setKeys([]);
          setError(data.error || "Unexpected response from server");
        }
      } else {
        let errorMsg = "Failed to fetch API keys";
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg;
        } catch {
          errorMsg = `Server error (${res.status}). Please try again.`;
        }
        setKeys([]);
        setError(errorMsg);
      }
    } catch {
      setKeys([]);
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
    return () => { fetchAbortRef.current?.abort(); };
  }, [fetchKeys]);

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formKeyName.trim() || !formKeyValue.trim()) {
      toast.error("Key Name and API Key Value are required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        credentials: 'include',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: formProvider,
          keyName: formKeyName.trim(),
          keyValue: formKeyValue.trim(),
          monthlyBudget: parseFloat(formBudget) || 18,
          priority: parseInt(formPriority) || 1,
          assignedAgents: JSON.stringify(formAssignedAgents),
          status: "ACTIVE",
        }),
      });
      if (res.ok) {
        toast.success("API key added successfully");
        setAddOpen(false);
        resetForm();
        fetchKeys();
      } else {
        const errorData = await res.json().catch(() => ({ error: "Failed to add API key" }));
        toast.error(errorData.error || "Failed to add API key");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKey) return;
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        id: editingKey.id,
        keyName: formKeyName.trim(),
        monthlyBudget: parseFloat(formBudget) || 18,
        priority: parseInt(formPriority) || 1,
        assignedAgents: JSON.stringify(formAssignedAgents),
        status: formProvider === editingKey.provider ? editingKey.status : "ACTIVE",
      };
      // Only update key value if it was changed
      if (formKeyValue.trim() && formKeyValue.trim() !== "••••••••") {
        updateData.keyValue = formKeyValue.trim();
      }
      const res = await fetch("/api/api-keys", {
        method: "PUT",
        credentials: 'include',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });
      if (res.ok) {
        toast.success("API key updated successfully");
        setEditOpen(false);
        setEditingKey(null);
        fetchKeys();
      } else {
        const errorData = await res.json().catch(() => ({ error: "Failed to update API key" }));
        toast.error(errorData.error || "Failed to update API key");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/api-keys?id=${deleteTarget}`, { method: "DELETE", credentials: 'include' });
      if (res.ok) {
        toast.success("API key deleted");
        fetchKeys();
      } else {
        const data = await res.json().catch(() => ({ error: "Failed to delete" }));
        toast.error(data.error || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleTestKey = async (id: string) => {
    setTestingKey(id);
    setTestResult(prev => ({ ...prev, [id]: undefined }));
    try {
      const res = await fetch(`/api/api-keys/test?id=${id}`, { credentials: 'include' });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Test request failed" }));
        toast.error(errData.error || "API key test failed");
        setTestResult(prev => ({ ...prev, [id]: { valid: false, error: errData.error || "Test request failed" } }));
        return;
      }
      const data = await res.json();
      setTestResult(prev => ({ ...prev, [id]: data }));
      if (data.valid) {
        toast.success("API key is valid and working!");
      } else {
        toast.error(data.hint || data.error || "API key is not working");
      }
      fetchKeys();
    } catch {
      toast.error("Failed to test API key");
      setTestResult(prev => ({ ...prev, [id]: { valid: false, error: "Network error" } }));
    } finally {
      setTestingKey(null);
    }
  };

  const handleReactivateKey = async (key: ApiKeyData) => {
    try {
      const res = await fetch("/api/api-keys", {
        method: "PUT",
        credentials: 'include',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: key.id, status: "ACTIVE", currentSpend: 0 }),
      });
      if (res.ok) {
        toast.success("API key reactivated (budget reset)");
        fetchKeys();
      } else {
        const errData = await res.json().catch(() => ({ error: "Failed to reactivate" }));
        toast.error(errData.error || "Failed to reactivate key");
      }
    } catch {
      toast.error("Failed to reactivate key");
    }
  };

  const openEditDialog = (key: ApiKeyData) => {
    setEditingKey(key);
    setFormProvider(key.provider);
    setFormKeyName(key.keyName);
    setFormKeyValue("••••••••");
    setFormBudget(String(key.monthlyBudget));
    setFormPriority(String(key.priority));
    try {
      const assigned = JSON.parse(key.assignedAgents || "[]");
      setFormAssignedAgents(Array.isArray(assigned) ? assigned : []);
    } catch {
      setFormAssignedAgents([]);
    }
    setEditOpen(true);
  };

  const toggleAgentAssignment = (agentType: string) => {
    setFormAssignedAgents(prev =>
      prev.includes(agentType)
        ? prev.filter(a => a !== agentType)
        : [...prev, agentType]
    );
  };

  const maskKeyValue = (key: string) => {
    if (key.length <= 8) return "••••••••";
    return key.substring(0, 4) + "••••" + key.substring(key.length - 4);
  };

  // Summary stats
  const totalSpend = keys.reduce((sum, k) => sum + (Number(k.currentSpend) || 0), 0);
  const totalBudget = keys.reduce((sum, k) => sum + (Number(k.monthlyBudget) || 0), 0);
  const activeKeys = keys.filter(k => k.status === "ACTIVE").length;
  const exhaustedKeys = keys.filter(k => k.status === "EXHAUSTED").length;
  const errorKeys = keys.filter(k => k.status === "ERROR").length;

  // Session loading guard — must be BEFORE role guard
  if (isSessionLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  // Role guard
  if (userRole !== "SUPER_ADMIN") { router.push("/dashboard"); return null; }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        {[1, 2].map(i => <Skeleton key={i} className="h-48 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="h-6 w-6 text-primary" />
            API Keys
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage API keys, budgets, failover, and health monitoring</p>
        </div>
        <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Add Key</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add API Key</DialogTitle>
              <DialogDescription>Add a new API key from any supported provider</DialogDescription>
            </DialogHeader>
            <KeyForm
              formProvider={formProvider}
              setFormProvider={setFormProvider}
              formKeyName={formKeyName}
              setFormKeyName={setFormKeyName}
              formKeyValue={formKeyValue}
              setFormKeyValue={setFormKeyValue}
              formBudget={formBudget}
              setFormBudget={setFormBudget}
              formPriority={formPriority}
              setFormPriority={setFormPriority}
              formAssignedAgents={formAssignedAgents}
              toggleAgentAssignment={toggleAgentAssignment}
              onSubmit={handleAddKey}
              saving={saving}
              submitLabel="Add Key"
              isEdit={false}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Keys</p>
                <p className="text-xl font-bold">{activeKeys}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Exhausted</p>
                <p className="text-xl font-bold">{exhaustedKeys}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                <Shield className="h-4 w-4 text-yellow-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Error Keys</p>
                <p className="text-xl font-bold">{errorKeys}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Budget Used</p>
                <p className="text-xl font-bold">${totalSpend.toFixed(2)}<span className="text-sm text-muted-foreground">/${totalBudget.toFixed(2)}</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Failover Info Banner */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="py-3">
          <div className="flex items-start gap-3">
            <ArrowRightLeft className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Automatic Key Failover Enabled</p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                When an API key fails (429 rate limit, balance exhausted, or invalid), the system automatically tries the next available key by priority.
                Add keys from multiple providers (Z.ai, OpenRouter, Google AI) for maximum reliability.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && keys.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Error Loading API Keys</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">{error}</p>
            <Button size="sm" onClick={fetchKeys}>
              <Loader2 className="h-4 w-4 mr-1" /> Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Key Cards */}
      <div className="space-y-4">
        {keys.map((key) => {
          const budget = Number(key.monthlyBudget) || 0;
          const spend = Number(key.currentSpend) || 0;
          const usagePercent = budget > 0 ? (spend / budget) * 100 : 0;
          const isWarning = usagePercent >= 75;
          const isCritical = usagePercent >= 90;
          const provider = providerInfo[key.provider] || providerInfo.OTHER;
          const assignedAgents = (() => {
            try {
              const parsed = JSON.parse(key.assignedAgents || "[]");
              return Array.isArray(parsed) ? parsed : [];
            } catch { return []; }
          })();

          const testRes = testResult[key.id];

          return (
            <Card key={key.id} className={key.status === "EXHAUSTED" ? "border-red-200 dark:border-red-800" : key.status === "ERROR" ? "border-yellow-200 dark:border-yellow-800" : ""}>
              <CardContent className="pt-5 pb-4">
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* Left: Provider + Name */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className={`h-10 w-10 rounded-lg ${provider.color} text-white flex items-center justify-center text-lg shrink-0`}>
                      {provider.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm">{key.keyName || "Unnamed Key"}</h3>
                        <Badge className={`text-[10px] ${statusColors[key.status] || ""}`}>{key.status}</Badge>
                        <Badge variant="outline" className="text-[10px]">{provider.name}</Badge>
                        <Badge variant="secondary" className="text-[10px]">P{key.priority}</Badge>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-xs text-muted-foreground font-mono">
                          {showKeyValues[key.id] ? key.keyValue : maskKeyValue(key.keyValue)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => setShowKeyValues(prev => ({ ...prev, [key.id]: !prev[key.id] }))}
                          aria-label="Toggle API key visibility"
                        >
                          {showKeyValues[key.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => {
                            try {
                              navigator.clipboard.writeText(key.keyValue);
                              toast.success("Key copied to clipboard");
                            } catch {
                              toast.error("Failed to copy to clipboard");
                            }
                          }}
                          aria-label="Copy API key"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>

                      {/* Test Result */}
                      {testRes && (
                        <div className={`mt-2 p-2 rounded text-xs ${testRes.valid ? "bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300"}`}>
                          {testRes.valid ? (
                            <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Key is working</span>
                          ) : (
                            <span>
                              <AlertTriangle className="h-3 w-3 inline mr-1" />
                              {testRes.error}
                              {testRes.hint && <span className="block mt-1 text-[10px] opacity-80">{testRes.hint}</span>}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Exhausted key warning */}
                      {key.status === "EXHAUSTED" && (
                        <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-950/20 text-xs text-red-700 dark:text-red-300">
                          <DollarSign className="h-3 w-3 inline mr-1" />
                          This key has reached its budget limit (${spend.toFixed(2)} / ${budget.toFixed(2)}).
                          {key.provider === "ZAI" && (
                            <a href="https://open.bigmodel.cn" target="_blank" rel="noopener noreferrer" className="ml-1 underline inline-flex items-center">
                              Recharge at Z.ai <ExternalLink className="h-2 w-2 ml-0.5" />
                            </a>
                          )}
                          {key.provider === "OPENROUTER" && (
                            <a href="https://openrouter.ai/credits" target="_blank" rel="noopener noreferrer" className="ml-1 underline inline-flex items-center">
                              Add credits at OpenRouter <ExternalLink className="h-2 w-2 ml-0.5" />
                            </a>
                          )}
                        </div>
                      )}

                      {key.status === "ERROR" && (
                        <div className="mt-2 p-2 rounded bg-yellow-50 dark:bg-yellow-950/20 text-xs text-yellow-700 dark:text-yellow-300">
                          <Shield className="h-3 w-3 inline mr-1" />
                          This key returned an authentication error. Please verify the key value is correct.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Budget + Stats + Actions */}
                  <div className="md:w-72 space-y-3">
                    {/* Budget */}
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Budget</span>
                        <span className={isCritical ? "text-red-600 font-semibold" : isWarning ? "text-yellow-600 font-semibold" : ""}>
                          ${spend.toFixed(2)} / ${budget.toFixed(2)}
                        </span>
                      </div>
                      <Progress value={Math.min(usagePercent, 100)} className={`h-2 ${isCritical ? "[&>div]:bg-red-500" : isWarning ? "[&>div]:bg-yellow-500" : "[&>div]:bg-green-500"}`} />
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="text-center p-1.5 rounded bg-muted/50">
                        <Activity className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" />
                        <p className="text-muted-foreground">Logs</p>
                        <p className="font-semibold">{key._count?.usageLogs ?? 0}</p>
                      </div>
                      <div className="text-center p-1.5 rounded bg-muted/50">
                        <Zap className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" />
                        <p className="text-muted-foreground">Agents</p>
                        <p className="font-semibold">{key._count?.agents ?? 0}</p>
                      </div>
                      <div className="text-center p-1.5 rounded bg-muted/50">
                        <Key className="h-3 w-3 mx-auto text-muted-foreground mb-0.5" />
                        <p className="text-muted-foreground">Priority</p>
                        <p className="font-semibold">{key.priority}</p>
                      </div>
                    </div>

                    {/* Assigned agents */}
                    <div className="text-xs">
                      <span className="text-muted-foreground">Assigned: </span>
                      {assignedAgents.length === 0 ? (
                        <Badge variant="outline" className="text-[10px]">All Agents</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {assignedAgents.map(a => (
                            <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1.5">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 text-xs flex-1" onClick={() => handleTestKey(key.id)} disabled={testingKey === key.id}>
                              {testingKey === key.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                              Test
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Test this API key by making a small AI call</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openEditDialog(key)}>
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      {(key.status === "EXHAUSTED" || key.status === "ERROR") && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleReactivateKey(key)}>
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="h-7 text-xs text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(key.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Empty State */}
      {keys.length === 0 && !error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Key className="h-16 w-16 text-muted-foreground mb-4 opacity-30" />
            <h3 className="text-xl font-semibold mb-2">No API Keys Added</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
              Add an API key from any supported provider to power the AI workspace. Keys are tried in priority order with automatic failover.
            </p>
            <div className="grid grid-cols-3 gap-4 mb-6">
              {Object.entries(providerInfo).filter(([k]) => k !== "OTHER").map(([key, info]) => (
                <a key={key} href={info.url} target="_blank" rel="noopener noreferrer" className="text-center p-3 rounded-lg border hover:bg-accent transition-colors">
                  <span className="text-2xl">{info.icon}</span>
                  <p className="text-xs font-medium mt-1">{info.name}</p>
                  <p className="text-[10px] text-muted-foreground">Get API Key →</p>
                </a>
              ))}
            </div>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Your First Key
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditingKey(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit API Key</DialogTitle>
            <DialogDescription>Update key settings, budget, and agent assignments</DialogDescription>
          </DialogHeader>
          <KeyForm
            formProvider={formProvider}
            setFormProvider={setFormProvider}
            formKeyName={formKeyName}
            setFormKeyName={setFormKeyName}
            formKeyValue={formKeyValue}
            setFormKeyValue={setFormKeyValue}
            formBudget={formBudget}
            setFormBudget={setFormBudget}
            formPriority={formPriority}
            setFormPriority={setFormPriority}
            formAssignedAgents={formAssignedAgents}
            toggleAgentAssignment={toggleAgentAssignment}
            onSubmit={handleEditKey}
            saving={saving}
            submitLabel="Save Changes"
            isEdit={true}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this API key? Agents using this key will need to be reassigned. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ━━ Reusable Key Form Component ━━
function KeyForm({
  formProvider, setFormProvider,
  formKeyName, setFormKeyName,
  formKeyValue, setFormKeyValue,
  formBudget, setFormBudget,
  formPriority, setFormPriority,
  formAssignedAgents, toggleAgentAssignment,
  onSubmit, saving, submitLabel, isEdit,
}: {
  formProvider: string;
  setFormProvider: (v: string) => void;
  formKeyName: string;
  setFormKeyName: (v: string) => void;
  formKeyValue: string;
  setFormKeyValue: (v: string) => void;
  formBudget: string;
  setFormBudget: (v: string) => void;
  formPriority: string;
  setFormPriority: (v: string) => void;
  formAssignedAgents: string[];
  toggleAgentAssignment: (a: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  submitLabel: string;
  isEdit: boolean;
}) {
  const provider = providerInfo[formProvider] || providerInfo.OTHER;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Provider *</Label>
        <Select value={formProvider} onValueChange={setFormProvider}>
          <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ZAI">🤖 Z.ai — GLM models</SelectItem>
            <SelectItem value="OPENROUTER">🔀 OpenRouter — Multi-model access</SelectItem>
            <SelectItem value="GOOGLE_AI">🧠 Google AI — Gemini models</SelectItem>
            <SelectItem value="NVIDIA">🔱 NVIDIA (Trishul AI) — GLM 5.1 Reasoning</SelectItem>
            <SelectItem value="OTHER">🔑 Other — Custom API</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-muted-foreground">
          Get your key:{" "}
          <a href={provider.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            {provider.name} <ExternalLink className="h-2 w-2 inline" />
          </a>
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Key Name *</Label>
        <Input
          value={formKeyName}
          onChange={(e) => setFormKeyName(e.target.value)}
          required
          placeholder={`e.g., ${provider.name} Primary`}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">API Key Value {isEdit ? "(leave as •••••••• to keep current)" : "*"}</Label>
        <Input
          value={formKeyValue}
          onChange={(e) => setFormKeyValue(e.target.value)}
          required={!isEdit}
          type="password"
          placeholder={formProvider === "ZAI" ? "Your Z.ai API key..." : formProvider === "OPENROUTER" ? "sk-or-v1-..." : formProvider === "GOOGLE_AI" ? "AIza..." : formProvider === "NVIDIA" ? "nvapi-..." : "Your API key..."}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Monthly Budget (USD)</Label>
          <Input
            type="number"
            value={formBudget}
            onChange={(e) => setFormBudget(e.target.value)}
            step="0.01"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Priority (1 = highest)</Label>
          <Input
            type="number"
            value={formPriority}
            onChange={(e) => setFormPriority(e.target.value)}
            min="1"
            max="10"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Assigned Agents (empty = all agents)</Label>
        <div className="flex flex-wrap gap-1.5">
          {agentTypeKeys.map(agentType => (
            <Badge
              key={agentType}
              variant={formAssignedAgents.includes(agentType) ? "default" : "outline"}
              className="cursor-pointer text-[10px] select-none"
              onClick={() => toggleAgentAssignment(agentType)}
            >
              {agentType}
            </Badge>
          ))}
        </div>
        {formAssignedAgents.length === 0 && (
          <p className="text-[10px] text-muted-foreground">All agents will use this key</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}
