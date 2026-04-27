"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plus, Trash2, Key, AlertTriangle, CheckCircle2, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  EXHAUSTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  ERROR: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
};

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
  const [keys, setKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state (needed because shadcn Select doesn't work with native FormData)
  const [formProvider, setFormProvider] = useState("OPENROUTER");
  const [formKeyName, setFormKeyName] = useState("");
  const [formKeyValue, setFormKeyValue] = useState("");
  const [formBudget, setFormBudget] = useState("18");
  const [formPriority, setFormPriority] = useState("1");

  const resetForm = () => {
    setFormProvider("OPENROUTER");
    setFormKeyName("");
    setFormKeyValue("");
    setFormBudget("18");
    setFormPriority("1");
  };

  const fetchKeys = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/api-keys", { credentials: 'include' });
      if (res.status === 401) {
        // Session expired, redirect to login
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const data = await res.json();
        // Ensure data is an array (API might return error object)
        if (Array.isArray(data)) {
          setKeys(data);
        } else {
          console.error("API returned non-array:", data);
          setKeys([]);
          setError(data.error || "Unexpected response from server");
        }
      } else {
        const errorData = await res.json().catch(() => ({ error: "Failed to fetch API keys" }));
        setKeys([]);
        setError(errorData.error || "Failed to fetch API keys");
      }
    } catch (err) {
      console.error(err);
      setKeys([]);
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
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
          assignedAgents: "[]",
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

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this API key?")) return;
    try {
      const res = await fetch(`/api/api-keys?id=${id}`, { method: "DELETE", credentials: 'include' });
      if (res.ok) {
        toast.success("API key deleted");
        fetchKeys();
      } else {
        const data = await res.json().catch(() => ({ error: "Failed to delete" }));
        toast.error(data.error || "Failed to delete");
      }
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleTestKey = async (id: string) => {
    setTestingKey(id);
    try {
      const res = await fetch(`/api/api-keys/test?id=${id}`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.valid) {
        toast.success("API key is valid and working!");
      } else {
        toast.error(data.error || "API key is invalid or not working");
      }
      fetchKeys();
    } catch {
      toast.error("Failed to test API key");
    } finally {
      setTestingKey(null);
    }
  };

  // Safe JSON parse for assignedAgents
  const parseAssignedAgents = (val: unknown): string[] => {
    try {
      if (typeof val === "string") {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch {
      return [];
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-48 rounded-lg" />)}
      </div>
    );
  }

  if (error && keys.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">API Keys</h1>
            <p className="text-muted-foreground text-sm">Manage API keys, budgets, and failover</p>
          </div>
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Key</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add API Key</DialogTitle></DialogHeader>
              <form onSubmit={handleAddKey} className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Provider *</Label>
                  <Select value={formProvider} onValueChange={setFormProvider}>
                    <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OPENROUTER">OpenRouter</SelectItem>
                      <SelectItem value="ZAI">ZAI</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Key Name *</Label>
                  <Input
                    value={formKeyName}
                    onChange={(e) => setFormKeyName(e.target.value)}
                    required
                    placeholder="e.g., OpenRouter Primary"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">API Key Value *</Label>
                  <Input
                    value={formKeyValue}
                    onChange={(e) => setFormKeyValue(e.target.value)}
                    required
                    type="password"
                    placeholder="sk-or-v1-..."
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
                    <Label className="text-xs">Priority</Label>
                    <Input
                      type="number"
                      value={formPriority}
                      onChange={(e) => setFormPriority(e.target.value)}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    "Add Key"
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-muted-foreground text-sm">Manage API keys, budgets, and failover</p>
        </div>
        <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Key</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add API Key</DialogTitle></DialogHeader>
            <form onSubmit={handleAddKey} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Provider *</Label>
                <Select value={formProvider} onValueChange={setFormProvider}>
                  <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPENROUTER">OpenRouter</SelectItem>
                    <SelectItem value="ZAI">ZAI</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Key Name *</Label>
                <Input
                  value={formKeyName}
                  onChange={(e) => setFormKeyName(e.target.value)}
                  required
                  placeholder="e.g., OpenRouter Primary"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">API Key Value *</Label>
                <Input
                  value={formKeyValue}
                  onChange={(e) => setFormKeyValue(e.target.value)}
                  required
                  type="password"
                  placeholder="sk-or-v1-..."
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
                  <Label className="text-xs">Priority</Label>
                  <Input
                    type="number"
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Key"
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Key Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {keys.map((key) => {
          try {
            const budget = Number(key.monthlyBudget) || 0;
            const spend = Number(key.currentSpend) || 0;
            const usagePercent = budget > 0 ? (spend / budget) * 100 : 0;
            const isWarning = usagePercent >= 75;
            const isCritical = usagePercent >= 90;
            const assignedAgents = parseAssignedAgents(key.assignedAgents);

            return (
              <Card key={key.id} className="relative">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-sm">{key.keyName || "Unnamed Key"}</CardTitle>
                    </div>
                    <Badge className={`text-[10px] ${statusColors[key.status] || ""}`}>{key.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Provider</span>
                    <Badge variant="secondary" className="text-[10px]">{key.provider}</Badge>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Budget Usage</span>
                      <span>${spend.toFixed(2)} / ${budget.toFixed(2)}</span>
                    </div>
                    <Progress value={Math.min(usagePercent, 100)} className={`h-2 ${isCritical ? "[&>div]:bg-red-500" : isWarning ? "[&>div]:bg-yellow-500" : ""}`} />
                    {isWarning && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-yellow-600">
                        <AlertTriangle className="h-3 w-3" />
                        <span>{usagePercent >= 90 ? "Critical: 90%+ used!" : "Warning: 75%+ used"}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Priority</span>
                    <span>{key.priority}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Assigned Agents</span>
                    <div className="flex gap-1">
                      {assignedAgents.length === 0 ? (
                        <span className="text-muted-foreground">All</span>
                      ) : (
                        assignedAgents.map((a) => (
                          <Badge key={a} variant="outline" className="text-[10px]">{a}</Badge>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Usage Logs</span>
                    <span>{key._count?.usageLogs ?? 0}</span>
                  </div>

                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-blue-500 h-7"
                      onClick={() => handleTestKey(key.id)}
                      disabled={testingKey === key.id}
                    >
                      {testingKey === key.id ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                      )}
                      Test
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-500 h-7" onClick={() => handleDelete(key.id)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          } catch (err) {
            console.error("Error rendering key card:", err);
            return (
              <Card key={key.id} className="border-yellow-300">
                <CardContent className="py-4">
                  <p className="text-sm text-yellow-600">Error displaying this key</p>
                  <p className="text-xs text-muted-foreground">{key.keyName || key.id}</p>
                </CardContent>
              </Card>
            );
          }
        })}
      </div>

      {keys.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Key className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No API Keys Added</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              Add your OpenRouter API key to start using AI agents. Get your key from{" "}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                openrouter.ai/keys
              </a>
            </p>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Your First Key
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
