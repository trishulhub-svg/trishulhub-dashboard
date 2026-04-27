"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Send, ArrowLeft, Settings, Paperclip, CheckCircle2, XCircle,
  Code2, Crosshair, DollarSign, ClipboardList, Users, PenTool, HeadphonesIcon,
  Bot, Loader2, Copy, RotateCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { STATUS_COLORS, AGENT_TYPES } from "@/lib/types";
import type { AgentStatus, AgentType } from "@/lib/types";

const agentIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  DEV: Code2, CLIENT_HUNTER: Crosshair, FINANCE: DollarSign,
  PROJECT_MANAGER: ClipboardList, HR: Users, CONTENT: PenTool, SUPPORT: HeadphonesIcon,
};

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: string;
}

export default function AgentChatPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const agentId = params.agentId as string;

  const [agent, setAgent] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchAgent = useCallback(async () => {
    try {
      const res = await fetch("/api/agents", { credentials: 'include' });
      if (res.ok) {
        const agents = await res.json();
        const found = (agents as Record<string, unknown>[]).find((a) => a.id === agentId);
        if (found) setAgent(found);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;

    const userMessage: Message = { role: "user", content: input.trim(), timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({
          agentId,
          message: userMessage.content,
          conversationId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const assistantMessage: Message = {
          role: "assistant",
          content: data.content || data.message || "No response",
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        if (data.conversationId) setConversationId(data.conversationId);
      } else {
        const error = await res.json();
        const errorMsg = error.error || "Failed to get response";
        toast.error(errorMsg, { duration: 6000 });
        // If it's an API key error, add a system message
        if (errorMsg.includes("API key") || errorMsg.includes("No active API key")) {
          setMessages((prev) => [
            ...prev.slice(0, -1),
            {
              role: "system" as const,
              content: "⚠️ No valid API key found. Please go to Settings > API Keys and add a valid OpenRouter API key to use this agent.",
              timestamp: new Date().toISOString(),
            },
          ]);
        } else {
          setMessages((prev) => prev.slice(0, -1));
        }
      }
    } catch {
      toast.error("Network error. Please try again.");
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleUpdateAgent = async (data: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ id: agentId, ...data }),
      });
      if (res.ok) {
        toast.success("Agent updated");
        fetchAgent();
        setSettingsOpen(false);
      }
    } catch {
      toast.error("Failed to update agent");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Agent not found</p>
      </div>
    );
  }

  const Icon = agentIcons[agent.type as string] || Bot;
  const agentConfig = AGENT_TYPES[agent.type as AgentType];
  const statusColor = STATUS_COLORS[agent.status as AgentStatus] || "bg-gray-400";

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/agents")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <Icon className={`h-5 w-5 ${agentConfig?.color || "text-muted-foreground"}`} />
          </div>
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              {agent.name as string}
              <div className={`h-2 w-2 rounded-full ${statusColor}`} />
            </h1>
            <p className="text-xs text-muted-foreground">{agent.model as string} • {agent.status as string}</p>
          </div>
        </div>
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-1" /> Settings
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agent Settings</DialogTitle>
            </DialogHeader>
            <AgentSettings
              agent={agent}
              onSave={handleUpdateAgent}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Chat Area */}
      <ScrollArea className="flex-1 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <Icon className={`h-12 w-12 mb-4 ${agentConfig?.color || "text-muted-foreground"} opacity-50`} />
            <h3 className="text-lg font-semibold mb-2">Chat with {agent.name as string}</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Give {agent.name as string} a task or ask a question. The agent will process your request and respond.
            </p>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setInput("Build a responsive landing page with a hero section")}>
                Sample task: Landing page
              </Button>
              <Button variant="outline" size="sm" onClick={() => setInput("Write a cold email for a potential client")}>
                Sample task: Cold email
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-center"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-3 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : msg.role === "system"
                      ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
                      : "bg-muted"
                  }`}
                >
                  {msg.role === "system" ? (
                    <div className="text-sm text-yellow-800 dark:text-yellow-200 whitespace-pre-wrap break-words">
                      {msg.content}
                    </div>
                  ) : (
                    <>
                  {msg.role !== "user" && (
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`h-3.5 w-3.5 ${agentConfig?.color}`} />
                      <span className="text-xs font-medium">{agent.name as string}</span>
                    </div>
                  )}
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {msg.content}
                  </div>
                  </>
                  )}
                  {msg.role === "assistant" && (
                    <div className="flex gap-1 mt-2 pt-2 border-t border-border/50">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(msg.content); toast.success("Copied!"); }}>
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600" onClick={() => toast.success("Approved!")}>
                        <CheckCircle2 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => toast.error("Rejected")}>
                        <XCircle className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">{agent.name as string} is thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="pt-4 border-t">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => toast.info("File upload coming soon!")}>
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Give ${agent.name as string} a task or ask a question...`}
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
          />
          <Button onClick={handleSend} disabled={!input.trim() || sending} className="shrink-0">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AgentSettings({ agent, onSave }: { agent: Record<string, unknown>; onSave: (data: Record<string, unknown>) => void }) {
  const [model, setModel] = useState(agent.model as string);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt as string);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Model</Label>
        <Select value={model} onValueChange={setModel}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai/gpt-4o-mini">GPT-4o Mini</SelectItem>
            <SelectItem value="openai/gpt-4o">GPT-4o</SelectItem>
            <SelectItem value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B (Free)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>System Prompt</Label>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={6}
          className="text-xs"
        />
      </div>
      <Button onClick={() => onSave({ model, systemPrompt })}>Save Changes</Button>
    </div>
  );
}
