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

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [testingKey, setTestingKey] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/api-keys");
      if (res.ok) setKeys(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleAddKey = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data = {
      provider: form.get("provider") as string,
      keyName: form.get("keyName") as string,
      keyValue: form.get("keyValue") as string,
      monthlyBudget: parseFloat(form.get("monthlyBudget") as string) || 10,
      priority: parseInt(form.get("priority") as string) || 1,
      assignedAgents: form.get("assignedAgents") as string || "[]",
    };

    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success("API key added successfully");
        setAddOpen(false);
        fetchKeys();
      } else {
        const errorData = await res.json().catch(() => ({ error: "Failed to add API key" }));
        toast.error(errorData.error || "Failed to add API key");
      }
    } catch {
      toast.error("Failed to add API key");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/api-keys?id=${id}`, { method: "DELETE" });
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
      const res = await fetch(`/api/api-keys/test?id=${id}`);
      const data = await res.json();
      if (res.ok && data.valid) {
        toast.success("API key is valid and working!");
      } else {
        toast.error(data.error || "API key is invalid or not working");
      }
      fetchKeys(); // Refresh to show updated status
    } catch {
      toast.error("Failed to test API key");
    } finally {
      setTestingKey(null);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-muted-foreground text-sm">Manage API keys, budgets, and failover</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Key</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add API Key</DialogTitle></DialogHeader>
            <form onSubmit={handleAddKey} className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Provider *</Label>
                <Select name="provider" required>
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
                <Input name="keyName" required placeholder="e.g., OpenRouter Primary" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">API Key Value *</Label>
                <Input name="keyValue" required type="password" placeholder="sk-or-v1-..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Monthly Budget (USD)</Label>
                  <Input name="monthlyBudget" type="number" defaultValue="18" step="0.01" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Priority</Label>
                  <Input name="priority" type="number" defaultValue="1" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Assigned Agents (JSON array, or [] for all)</Label>
                <Input name="assignedAgents" defaultValue='[]' className="font-mono text-xs" />
              </div>
              <Button type="submit" className="w-full">Add Key</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Key Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(keys as {
          id: string; provider: string; keyName: string; keyValue: string;
          monthlyBudget: number; currentSpend: number; status: string;
          priority: number; assignedAgents: string; _count: { usageLogs: number; agents: number };
        }[]).map((key) => {
          const usagePercent = key.monthlyBudget > 0 ? (key.currentSpend / key.monthlyBudget) * 100 : 0;
          const isWarning = usagePercent >= 75;
          const isCritical = usagePercent >= 90;
          const assignedAgents = JSON.parse(key.assignedAgents || "[]") as string[];

          return (
            <Card key={key.id} className="relative">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm">{key.keyName}</CardTitle>
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
                    <span>${key.currentSpend.toFixed(2)} / ${key.monthlyBudget.toFixed(2)}</span>
                  </div>
                  <Progress value={usagePercent} className={`h-2 ${isCritical ? "[&>div]:bg-red-500" : isWarning ? "[&>div]:bg-yellow-500" : ""}`} />
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
                  <span>{key._count?.usageLogs || 0}</span>
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
