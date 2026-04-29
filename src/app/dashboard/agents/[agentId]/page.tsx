"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Send, ArrowLeft, Settings, Paperclip, CheckCircle2, XCircle,
  Code2, Crosshair, DollarSign, ClipboardList, Users, PenTool, HeadphonesIcon,
  Bot, Loader2, Copy, Plus, MessageSquare, Trash2, Archive,
  Pencil, Check, X, ChevronRight, ChevronLeft, Zap, Command,
  Lightbulb, Calendar, Clock, AlertTriangle, ArrowRightLeft,
  PanelRightOpen, PanelRightClose, PanelLeftOpen, PanelLeftClose,
  MoreVertical, Search, SendHorizontal, ShieldAlert,
  Wrench, Brain, Eye, FileCode, Globe, Terminal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { STATUS_COLORS, AGENT_TYPES, MODEL_OPTIONS } from "@/lib/types";
import type { AgentStatus, AgentType } from "@/lib/types";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── Icon Map ───────────────────────────────────────────────────
const agentIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  DEV: Code2,
  CLIENT_HUNTER: Crosshair,
  FINANCE: DollarSign,
  PROJECT_MANAGER: ClipboardList,
  HR: Users,
  CONTENT: PenTool,
  SUPPORT: HeadphonesIcon,
};

// ─── Types ──────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: string | null;
  createdAt: string;
}

interface Chat {
  id: string;
  agentId: string;
  userId: string;
  title: string;
  isShared: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  agent?: { id: string; name: string; type: string; status: string };
  messages?: { id: string; role: string; content: string; createdAt: string }[];
  _count?: { messages: number };
}

interface ScheduledTask {
  id: string;
  agentId: string;
  userId: string;
  title: string;
  description: string | null;
  dueDate: string;
  status: string;
  progress: number;
  priority: string;
  result: string | null;
  completedAt: string | null;
  createdAt: string;
  agent?: { id: string; name: string; type: string };
}

interface CrossAgentMsg {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  message: string;
  type: string;
  status: string;
  createdAt: string;
  fromAgent?: { id: string; name: string; type: string };
  toAgent?: { id: string; name: string; type: string };
  aiResponse?: string;
}

interface QuickAction {
  id: string;
  label: string;
  prompt: string;
}

interface SpecialCommand {
  id: string;
  label: string;
  prompt: string;
  icon: string;
}

interface SuggestedPrompt {
  id: string;
  label: string;
  prompt: string;
}

interface AgentData {
  id: string;
  name: string;
  type: string;
  description: string;
  model: string;
  systemPrompt: string;
  status: string;
  apiKeyId?: string | null;
  roleConfig?: {
    id: string;
    agentId: string;
    rolePrompt: string;
    quickActions: string;
    specialCommands: string;
    features: string;
    autoWorkflows: string;
    suggestedPrompts: string;
  } | null;
  _count?: { conversations: number; chats: number };
}

// ─── Helpers ────────────────────────────────────────────────────
function parseJSONSafe<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.substring(0, len) + "...";
}

const priorityColors: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  URGENT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const taskStatusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  OVERDUE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  CANCELLED: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

// ─── Main Component ─────────────────────────────────────────────
export default function AgentChatPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const isMobile = useIsMobile();
  const agentId = params.agentId as string;

  // Core state
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);

  // Chat list state
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatsLoading, setChatsLoading] = useState(false);

  // Messages state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // Panel visibility
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  // Mobile tab
  const [mobileTab, setMobileTab] = useState<"chats" | "messages" | "features">("messages");

  // Right panel tab
  const [rightTab, setRightTab] = useState<"features" | "tasks" | "crossagent">("features");

  // Dialogs
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [crossAgentOpen, setCrossAgentOpen] = useState(false);

  // Inline rename
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Delete confirmation dialog
  const [deleteDialogChatId, setDeleteDialogChatId] = useState<string | null>(null);

  // Agentic steps for Dev Agent
  const [agentSteps, setAgentSteps] = useState<Array<{ type: string; content: string; toolName?: string; stepNumber: number }>>([]);
  const [isAgentic, setIsAgentic] = useState(false);

  // Scheduled tasks
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Cross-agent messages
  const [crossAgentMsgs, setCrossAgentMsgs] = useState<CrossAgentMsg[]>([]);
  const [crossAgentLoading, setCrossAgentLoading] = useState(false);

  // All agents (for cross-agent dialog)
  const [allAgents, setAllAgents] = useState<AgentData[]>([]);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // ── Parsed role config ──
  const quickActions = useMemo<QuickAction[]>(
    () => parseJSONSafe(agent?.roleConfig?.quickActions, []),
    [agent?.roleConfig?.quickActions]
  );
  const specialCommands = useMemo<SpecialCommand[]>(
    () => parseJSONSafe(agent?.roleConfig?.specialCommands, []),
    [agent?.roleConfig?.specialCommands]
  );
  const features = useMemo<Record<string, boolean>>(
    () => parseJSONSafe(agent?.roleConfig?.features, {}),
    [agent?.roleConfig?.features]
  );
  const suggestedPrompts = useMemo<SuggestedPrompt[]>(
    () => parseJSONSafe(agent?.roleConfig?.suggestedPrompts, []),
    [agent?.roleConfig?.suggestedPrompts]
  );

  const Icon = agent ? (agentIcons[agent.type] || Bot) : Bot;
  const agentConfig = agent ? AGENT_TYPES[agent.type as AgentType] : null;
  const statusColor = agent ? (STATUS_COLORS[agent.status as AgentStatus] || "bg-gray-400") : "bg-gray-400";

  // ── Fetch Agent ──
  const fetchAgent = useCallback(async () => {
    try {
      const res = await fetch("/api/agents", { credentials: "include" });
      if (res.ok) {
        const agents = await res.json();
        const found = (agents as AgentData[]).find((a) => a.id === agentId);
        if (found) {
          setAgent(found);
          setAllAgents(agents);
        }
      }
    } catch (err) {
      console.error("Failed to fetch agent:", err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  // ── Fetch Chats ──
  const fetchChats = useCallback(async () => {
    if (!agentId) return;
    setChatsLoading(true);
    try {
      const res = await fetch(`/api/chats?agentId=${agentId}&status=ACTIVE`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setChats(data as Chat[]);
      }
    } catch (err) {
      console.error("Failed to fetch chats:", err);
    } finally {
      setChatsLoading(false);
    }
  }, [agentId]);

  // ── Fetch Messages ──
  const fetchMessages = useCallback(async (chatId: string) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/chats/messages?chatId=${chatId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMessages((data.messages || data) as ChatMessage[]);
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // ── Fetch Scheduled Tasks ──
  const fetchTasks = useCallback(async () => {
    if (!agentId) return;
    setTasksLoading(true);
    try {
      const res = await fetch(`/api/scheduled-tasks?agentId=${agentId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setScheduledTasks(data as ScheduledTask[]);
      }
    } catch (err) {
      console.error("Failed to fetch scheduled tasks:", err);
    } finally {
      setTasksLoading(false);
    }
  }, [agentId]);

  // ── Fetch Cross-Agent Messages ──
  const fetchCrossAgent = useCallback(async () => {
    if (!agentId) return;
    setCrossAgentLoading(true);
    try {
      const [incoming, outgoing] = await Promise.all([
        fetch(`/api/cross-agent?agentId=${agentId}&direction=incoming`, { credentials: "include" }),
        fetch(`/api/cross-agent?agentId=${agentId}&direction=outgoing`, { credentials: "include" }),
      ]);
      const inData = incoming.ok ? await incoming.json() : [];
      const outData = outgoing.ok ? await outgoing.json() : [];
      setCrossAgentMsgs([...(inData as CrossAgentMsg[]), ...(outData as CrossAgentMsg[])].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch (err) {
      console.error("Failed to fetch cross-agent messages:", err);
    } finally {
      setCrossAgentLoading(false);
    }
  }, [agentId]);

  // ── Init ──
  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  useEffect(() => {
    if (agent) {
      fetchChats();
      fetchTasks();
      fetchCrossAgent();
    }
  }, [agent, fetchChats, fetchTasks, fetchCrossAgent]);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // ── Select chat ──
  const selectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    fetchMessages(chatId);
    if (isMobile) setMobileTab("messages");
  }, [fetchMessages, isMobile]);

  // ── Create new chat ──
  const createNewChat = useCallback(async () => {
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agentId, title: "New Chat" }),
      });
      if (res.ok) {
        const chat = await res.json();
        await fetchChats();
        selectChat(chat.id);
        toast.success("New chat created");
      }
    } catch {
      toast.error("Failed to create chat");
    }
  }, [agentId, fetchChats, selectChat]);

  // ── Send message ──
  const handleSend = useCallback(async () => {
    if (!input.trim() || sending) return;

    const userContent = input.trim();
    setInput("");

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      chatId: activeChatId || "",
      role: "user",
      content: userContent,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setSending(true);

    // Use agentic endpoint for agents with agentic feature enabled
    const useAgentic = features?.agentic !== false; // All agents are agentic by default
    if (useAgentic) {
      setAgentSteps([]);
      setIsAgentic(true);
    }

    try {
      const endpoint = useAgentic ? "/api/agents/agent-chat" : "/api/agents/chat";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          agentId,
          message: userContent,
          chatId: activeChatId || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();

        // Show agentic steps for all agentic agents
        if (useAgentic && data.steps) {
          setAgentSteps(data.steps);
        }

        const assistantMsg: ChatMessage = {
          id: data.messageId || `temp-assistant-${Date.now()}`,
          chatId: data.chatId || activeChatId || "",
          role: "assistant",
          content: data.content || "No response",
          metadata: JSON.stringify({
            agentic: data.agentic,
            totalSteps: data.totalSteps,
            usedTools: data.usedTools,
            steps: data.steps,
            thinkingPreview: data.thinkingPreview,
          }),
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);

        if (!activeChatId && data.chatId) {
          setActiveChatId(data.chatId);
          await fetchChats();
        }
      } else {
        const error = await res.json();
        const errorMsg = error.error || "Failed to get response";

        // Show partial steps even on error
        if (useAgentic && error.steps) {
          setAgentSteps(error.steps);
        }

        toast.error(errorMsg, { duration: 6000 });
        if (errorMsg.includes("API key") || errorMsg.includes("No active API key") || errorMsg.includes("Z.ai API key")) {
          setMessages((prev) => [
            ...prev,
            {
              id: `sys-${Date.now()}`,
              chatId: activeChatId || "",
              role: "system",
              content: "⚠️ No valid Z.ai API key found for agentic mode. Agentic agents require a Z.ai API key. Go to Settings > API Keys and add a Z.ai key.",
              createdAt: new Date().toISOString(),
            },
          ]);
        } else {
          setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        }
        if (error.chatId && !activeChatId) {
          setActiveChatId(error.chatId);
          await fetchChats();
        }
      }
    } catch {
      toast.error("Network error. Please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setSending(false);
      setIsAgentic(false);
    }
  }, [input, sending, agentId, activeChatId, fetchChats, agent?.type]);

  // ── Key handler ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Chat CRUD ──
  const renameChat = async (chatId: string, title: string) => {
    try {
      const res = await fetch("/api/chats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: chatId, title }),
      });
      if (res.ok) {
        await fetchChats();
        toast.success("Chat renamed");
      }
    } catch {
      toast.error("Failed to rename chat");
    }
    setRenamingChatId(null);
  };

  const archiveChat = async (chatId: string) => {
    try {
      const res = await fetch("/api/chats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: chatId, status: "ARCHIVED" }),
      });
      if (res.ok) {
        if (activeChatId === chatId) {
          setActiveChatId(null);
          setMessages([]);
        }
        await fetchChats();
        toast.success("Chat archived");
      }
    } catch {
      toast.error("Failed to archive chat");
    }
  };

  const userRole = (session?.user as { role?: string })?.role || "DEVELOPER";

  const deleteChat = async (chatId: string) => {
    try {
      const res = await fetch(`/api/chats?id=${chatId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pendingApproval) {
          toast.success(data.message || "Deletion request sent for approval");
        } else {
          if (activeChatId === chatId) {
            setActiveChatId(null);
            setMessages([]);
          }
          await fetchChats();
          toast.success("Chat deleted");
        }
      }
    } catch {
      toast.error("Failed to delete chat");
    }
  };

  // ── Agent settings ──
  const handleUpdateAgent = async (data: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
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

  // ── Quick action / command click ──
  const handleQuickAction = (prompt: string) => {
    setInput(prompt);
    chatInputRef.current?.focus();
  };

  const handleSpecialCommand = (prompt: string) => {
    setInput(prompt);
    chatInputRef.current?.focus();
  };

  const handleSuggestedPrompt = (prompt: string) => {
    setInput(prompt);
    chatInputRef.current?.focus();
  };

  // ── Create scheduled task ──
  const handleCreateTask = async (data: { title: string; description: string; dueDate: string; priority: string }) => {
    try {
      const res = await fetch("/api/scheduled-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agentId, ...data }),
      });
      if (res.ok) {
        toast.success("Task created");
        fetchTasks();
        setNewTaskOpen(false);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to create task");
      }
    } catch {
      toast.error("Failed to create task");
    }
  };

  // ── Send cross-agent message ──
  const handleCrossAgentSend = async (toAgentId: string, message: string, type: string) => {
    try {
      const res = await fetch("/api/cross-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fromAgentId: agentId, toAgentId, message, type }),
      });
      if (res.ok) {
        toast.success("Message sent to agent");
        fetchCrossAgent();
        setCrossAgentOpen(false);
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to send message");
      }
    } catch {
      toast.error("Failed to send message");
    }
  };

  // ── Session guard ──
  if (sessionStatus === "loading") {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <div className="flex gap-4">
          <Skeleton className="h-96 w-64 rounded-lg" />
          <Skeleton className="h-96 flex-1 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Bot className="h-12 w-12 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">Agent not found</p>
        <Button variant="outline" onClick={() => router.push("/dashboard/agents")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Agents
        </Button>
      </div>
    );
  }

  // ── Active chat ──
  const activeChat = chats.find((c) => c.id === activeChatId);

  // ────────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────────

  // ── Mobile Layout ──
  if (isMobile) {
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Mobile Header */}
        <div className="flex items-center justify-between pb-3 border-b">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push("/dashboard/agents")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className={`h-4 w-4 ${agentConfig?.color || "text-muted-foreground"}`} />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold flex items-center gap-1.5 truncate">
                {agent.name}
                <div className={`h-1.5 w-1.5 rounded-full ${statusColor} shrink-0`} />
              </h1>
              <p className="text-[10px] text-muted-foreground truncate">{agent.model}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {activeChat && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => { setRenamingChatId(activeChat.id); setRenameValue(activeChat.title); }}>
                    <Pencil className="h-4 w-4 mr-2" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => archiveChat(activeChat.id)}>
                    <Archive className="h-4 w-4 mr-2" /> Archive
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {userRole === "DEVELOPER" || userRole === "CLIENT" ? (
                    <DropdownMenuItem className="text-orange-600" onClick={() => setDeleteDialogChatId(activeChat.id)}>
                      <ShieldAlert className="h-4 w-4 mr-2" /> Request Deletion
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem className="text-red-600" onClick={() => setDeleteDialogChatId(activeChat.id)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSettingsOpen(true)}>
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Mobile Tabs */}
        <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as typeof mobileTab)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3 shrink-0">
            <TabsTrigger value="chats" className="text-xs">
              <MessageSquare className="h-3 w-3 mr-1" /> Chats
            </TabsTrigger>
            <TabsTrigger value="messages" className="text-xs">
              Chat
            </TabsTrigger>
            <TabsTrigger value="features" className="text-xs">
              <Zap className="h-3 w-3 mr-1" /> More
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chats" className="flex-1 min-h-0 mt-0">
            <ChatSidebar
              chats={chats}
              activeChatId={activeChatId}
              loading={chatsLoading}
              onSelect={selectChat}
              onNewChat={createNewChat}
              onRename={renameChat}
              onArchive={archiveChat}
              onDelete={deleteChat}
              renamingChatId={renamingChatId}
              renameValue={renameValue}
              setRenamingChatId={setRenamingChatId}
              setRenameValue={setRenameValue}
              userRole={userRole}
              isMobile
              onDeleteDialog={(id) => setDeleteDialogChatId(id)}
            />
          </TabsContent>

          <TabsContent value="messages" className="flex-1 flex flex-col min-h-0 mt-0">
            <ChatArea
              messages={messages}
              sending={sending}
              input={input}
              setInput={setInput}
              handleSend={handleSend}
              handleKeyDown={handleKeyDown}
              messagesEndRef={messagesEndRef}
              messagesLoading={messagesLoading}
              agent={agent}
              Icon={Icon}
              agentConfig={agentConfig}
              activeChat={activeChat}
              chatInputRef={chatInputRef}
              suggestedPrompts={suggestedPrompts}
              onSuggestedPrompt={handleSuggestedPrompt}
              features={features}
              Paperclip={Paperclip}
              Send={Send}
              Loader2={Loader2}
            />
          </TabsContent>

          <TabsContent value="features" className="flex-1 min-h-0 mt-0 overflow-auto">
            <RightPanel
              rightTab={rightTab}
              setRightTab={setRightTab}
              agent={agent}
              quickActions={quickActions}
              specialCommands={specialCommands}
              features={features}
              scheduledTasks={scheduledTasks}
              tasksLoading={tasksLoading}
              crossAgentMsgs={crossAgentMsgs}
              crossAgentLoading={crossAgentLoading}
              allAgents={allAgents}
              agentId={agentId}
              onQuickAction={handleQuickAction}
              onSpecialCommand={handleSpecialCommand}
              onNewTask={() => setNewTaskOpen(true)}
              onCrossAgentSend={() => setCrossAgentOpen(true)}
              onTaskStatusUpdate={fetchTasks}
              onRefreshTasks={fetchTasks}
              onRefreshCrossAgent={fetchCrossAgent}
              Icon={Icon}
              agentConfig={agentConfig}
            />
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <AgentSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          agent={agent}
          onSave={handleUpdateAgent}
          quickActions={quickActions}
          specialCommands={specialCommands}
          features={features}
          suggestedPrompts={suggestedPrompts}
        />
        <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} onSubmit={handleCreateTask} />
        <CrossAgentDialog
          open={crossAgentOpen}
          onOpenChange={setCrossAgentOpen}
          agents={allAgents.filter((a) => a.id !== agentId)}
          onSend={handleCrossAgentSend}
          fromAgentName={agent.name}
        />
        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteDialogChatId} onOpenChange={(open) => { if (!open) setDeleteDialogChatId(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {userRole === "DEVELOPER" || userRole === "CLIENT" ? (
                  <><ShieldAlert className="h-5 w-5 text-orange-500" /> Request Chat Deletion</>
                ) : (
                  <><Trash2 className="h-5 w-5 text-red-500" /> Delete Chat</>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="py-3">
              {userRole === "DEVELOPER" || userRole === "CLIENT" ? (
                <p className="text-sm text-muted-foreground">
                  Your deletion request will be sent to admins (Taroon and Pruthvi) for review. 
                  The chat will only be deleted after one of them approves it.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This action cannot be undone. The chat and all its messages will be permanently deleted.
                </p>
              )}
              {deleteDialogChatId && (
                <div className="mt-3 p-2 rounded-lg bg-muted">
                  <p className="text-sm font-medium">
                    {chats.find(c => c.id === deleteDialogChatId)?.title || "Untitled Chat"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {chats.find(c => c.id === deleteDialogChatId)?._count?.messages || 0} messages
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDeleteDialogChatId(null)}>Cancel</Button>
              {userRole === "DEVELOPER" || userRole === "CLIENT" ? (
                <Button 
                  variant="outline" 
                  className="bg-orange-500 hover:bg-orange-600 text-white hover:text-white"
                  onClick={() => {
                    if (deleteDialogChatId) deleteChat(deleteDialogChatId);
                    setDeleteDialogChatId(null);
                  }}
                >
                  <ShieldAlert className="h-4 w-4 mr-2" /> Send Deletion Request
                </Button>
              ) : (
                <Button 
                  variant="destructive"
                  onClick={() => {
                    if (deleteDialogChatId) deleteChat(deleteDialogChatId);
                    setDeleteDialogChatId(null);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete Chat
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── Desktop Layout ──
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 -m-4 md:-m-6">
      {/* Left Panel: Chat Sidebar */}
      <div
        className={`border-r border-border flex flex-col bg-card transition-all duration-300 shrink-0 ${
          leftPanelOpen ? "w-64" : "w-10"
        }`}
      >
        {leftPanelOpen ? (
          <>
            <div className="flex items-center justify-between p-3 border-b">
              <h2 className="text-sm font-semibold">Chats</h2>
              <div className="flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={createNewChat}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>New Chat</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLeftPanelOpen(false)}>
                        <PanelLeftClose className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Close sidebar</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <ChatSidebar
              chats={chats}
              activeChatId={activeChatId}
              loading={chatsLoading}
              onSelect={selectChat}
              onNewChat={createNewChat}
              onRename={renameChat}
              onArchive={archiveChat}
              onDelete={deleteChat}
              renamingChatId={renamingChatId}
              renameValue={renameValue}
              setRenamingChatId={setRenamingChatId}
              setRenameValue={setRenameValue}
              userRole={userRole}
              onDeleteDialog={(id) => setDeleteDialogChatId(id)}
            />
          </>
        ) : (
          <div className="flex flex-col items-center pt-2 gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLeftPanelOpen(true)}>
                    <PanelLeftOpen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open sidebar</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={createNewChat}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New Chat</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>

      {/* Center: Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className={`h-5 w-5 ${agentConfig?.color || "text-muted-foreground"}`} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold flex items-center gap-2">
                {activeChat ? truncate(activeChat.title, 30) : agent.name}
                <div className={`h-2 w-2 rounded-full ${statusColor} shrink-0`} />
              </h1>
              <p className="text-xs text-muted-foreground">
                {activeChat ? `${messages.length} messages` : `${agent.model} • ${agent.status}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {activeChat && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => { setRenamingChatId(activeChat.id); setRenameValue(activeChat.title); }}>
                    <Pencil className="h-4 w-4 mr-2" /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => archiveChat(activeChat.id)}>
                    <Archive className="h-4 w-4 mr-2" /> Archive
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {userRole === "DEVELOPER" || userRole === "CLIENT" ? (
                    <DropdownMenuItem className="text-orange-600" onClick={() => setDeleteDialogChatId(activeChat.id)}>
                      <ShieldAlert className="h-4 w-4 mr-2" /> Request Deletion
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem className="text-red-600" onClick={() => setDeleteDialogChatId(activeChat.id)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setRightPanelOpen(!rightPanelOpen)}
                  >
                    {rightPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{rightPanelOpen ? "Close panel" : "Open panel"}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSettingsOpen(true)}>
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Agent Settings</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Chat Messages */}
        <ChatArea
          messages={messages}
          sending={sending}
          input={input}
          setInput={setInput}
          handleSend={handleSend}
          handleKeyDown={handleKeyDown}
          messagesEndRef={messagesEndRef}
          messagesLoading={messagesLoading}
          agent={agent}
          Icon={Icon}
          agentConfig={agentConfig}
          activeChat={activeChat}
          chatInputRef={chatInputRef}
          suggestedPrompts={suggestedPrompts}
          onSuggestedPrompt={handleSuggestedPrompt}
          features={features}
          Paperclip={Paperclip}
          Send={Send}
          Loader2={Loader2}
        />
      </div>

      {/* Right Panel: Agent Features */}
      {rightPanelOpen && (
        <div className="w-80 border-l border-border flex flex-col bg-card shrink-0">
          <RightPanel
            rightTab={rightTab}
            setRightTab={setRightTab}
            agent={agent}
            quickActions={quickActions}
            specialCommands={specialCommands}
            features={features}
            scheduledTasks={scheduledTasks}
            tasksLoading={tasksLoading}
            crossAgentMsgs={crossAgentMsgs}
            crossAgentLoading={crossAgentLoading}
            allAgents={allAgents}
            agentId={agentId}
            onQuickAction={handleQuickAction}
            onSpecialCommand={handleSpecialCommand}
            onNewTask={() => setNewTaskOpen(true)}
            onCrossAgentSend={() => setCrossAgentOpen(true)}
            onTaskStatusUpdate={fetchTasks}
            onRefreshTasks={fetchTasks}
            onRefreshCrossAgent={fetchCrossAgent}
            Icon={Icon}
            agentConfig={agentConfig}
          />
        </div>
      )}

      {/* Dialogs */}
      <AgentSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        agent={agent}
        onSave={handleUpdateAgent}
        quickActions={quickActions}
        specialCommands={specialCommands}
        features={features}
        suggestedPrompts={suggestedPrompts}
      />
      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} onSubmit={handleCreateTask} />
      <CrossAgentDialog
        open={crossAgentOpen}
        onOpenChange={setCrossAgentOpen}
        agents={allAgents.filter((a) => a.id !== agentId)}
        onSend={handleCrossAgentSend}
        fromAgentName={agent.name}
      />
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteDialogChatId} onOpenChange={(open) => { if (!open) setDeleteDialogChatId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {userRole === "DEVELOPER" || userRole === "CLIENT" ? (
                <><ShieldAlert className="h-5 w-5 text-orange-500" /> Request Chat Deletion</>
              ) : (
                <><Trash2 className="h-5 w-5 text-red-500" /> Delete Chat</>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            {userRole === "DEVELOPER" || userRole === "CLIENT" ? (
              <p className="text-sm text-muted-foreground">
                Your deletion request will be sent to admins (Taroon and Pruthvi) for review. 
                The chat will only be deleted after one of them approves it.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                This action cannot be undone. The chat and all its messages will be permanently deleted.
              </p>
            )}
            {deleteDialogChatId && (
              <div className="mt-3 p-2 rounded-lg bg-muted">
                <p className="text-sm font-medium">
                  {chats.find(c => c.id === deleteDialogChatId)?.title || "Untitled Chat"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {chats.find(c => c.id === deleteDialogChatId)?._count?.messages || 0} messages
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogChatId(null)}>Cancel</Button>
            {userRole === "DEVELOPER" || userRole === "CLIENT" ? (
              <Button 
                variant="outline" 
                className="bg-orange-500 hover:bg-orange-600 text-white hover:text-white"
                onClick={() => {
                  if (deleteDialogChatId) deleteChat(deleteDialogChatId);
                  setDeleteDialogChatId(null);
                }}
              >
                <ShieldAlert className="h-4 w-4 mr-2" /> Send Deletion Request
              </Button>
            ) : (
              <Button 
                variant="destructive"
                onClick={() => {
                  if (deleteDialogChatId) deleteChat(deleteDialogChatId);
                  setDeleteDialogChatId(null);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete Chat
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// CHAT SIDEBAR COMPONENT
// ──────────────────────────────────────────────────────────────────
function ChatSidebar({
  chats,
  activeChatId,
  loading,
  onSelect,
  onNewChat,
  onRename,
  onArchive,
  onDelete,
  renamingChatId,
  renameValue,
  setRenamingChatId,
  setRenameValue,
  userRole,
  isMobile,
  onDeleteDialog,
}: {
  chats: Chat[];
  activeChatId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  renamingChatId: string | null;
  renameValue: string;
  setRenamingChatId: (id: string | null) => void;
  setRenameValue: (val: string) => void;
  userRole?: string;
  isMobile?: boolean;
  onDeleteDialog?: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="p-3 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className={`space-y-0.5 p-2 ${isMobile ? "pb-20" : ""}`}>
        {chats.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground opacity-50 mb-2" />
            <p className="text-xs text-muted-foreground">No chats yet</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onNewChat}>
              <Plus className="h-3 w-3 mr-1" /> New Chat
            </Button>
          </div>
        ) : (
          chats.map((chat) => (
            <div key={chat.id}>
              {renamingChatId === chat.id ? (
                <div className="flex items-center gap-1 p-2 rounded-lg bg-accent">
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onRename(chat.id, renameValue);
                      if (e.key === "Escape") setRenamingChatId(null);
                    }}
                    className="h-7 text-xs"
                    autoFocus
                  />
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => onRename(chat.id, renameValue)}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setRenamingChatId(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <div
                  className={`group flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                    activeChatId === chat.id
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50"
                  }`}
                  onClick={() => onSelect(chat.id)}
                >
                  <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-medium truncate">{chat.title}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-60 hover:opacity-100 transition-opacity shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingChatId(chat.id);
                              setRenameValue(chat.title);
                            }}
                          >
                            <Pencil className="h-3 w-3 mr-2" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              onArchive(chat.id);
                            }}
                          >
                            <Archive className="h-3 w-3 mr-2" /> Archive
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {userRole === "DEVELOPER" || userRole === "CLIENT" ? (
                            <DropdownMenuItem
                              className="text-orange-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onDeleteDialog) onDeleteDialog(chat.id);
                                else onDelete(chat.id);
                              }}
                            >
                              <ShieldAlert className="h-3 w-3 mr-2" /> Request Deletion
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onDeleteDialog) onDeleteDialog(chat.id);
                                else onDelete(chat.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3 mr-2" /> Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {chat.messages && chat.messages.length > 0 && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {truncate(chat.messages[0].content, 30)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {chat._count?.messages || 0} msgs
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatRelativeTime(chat.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );
}

// ──────────────────────────────────────────────────────────────────
// CHAT AREA COMPONENT
// ──────────────────────────────────────────────────────────────────
function ChatArea({
  messages,
  sending,
  input,
  setInput,
  handleSend,
  handleKeyDown,
  messagesEndRef,
  messagesLoading,
  agent,
  Icon,
  agentConfig,
  activeChat,
  chatInputRef,
  suggestedPrompts,
  onSuggestedPrompt,
  features,
  Paperclip: PaperclipIcon,
  Send: SendIcon,
  Loader2: Loader2Icon,
}: {
  messages: ChatMessage[];
  sending: boolean;
  input: string;
  setInput: (val: string) => void;
  handleSend: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  messagesLoading: boolean;
  agent: AgentData;
  Icon: React.ComponentType<{ className?: string }>;
  agentConfig: { color: string; label: string } | null;
  activeChat: Chat | undefined;
  chatInputRef: React.RefObject<HTMLTextAreaElement | null>;
  suggestedPrompts: SuggestedPrompt[];
  onSuggestedPrompt: (prompt: string) => void;
  features: Record<string, boolean>;
  Paperclip: React.ComponentType<{ className?: string }>;
  Send: React.ComponentType<{ className?: string }>;
  Loader2: React.ComponentType<{ className?: string }>;
}) {
  return (
    <>
      {/* Messages */}
      <ScrollArea className="flex-1">
        {messagesLoading ? (
          <div className="p-6 space-y-4 max-w-3xl mx-auto">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <Skeleton className="h-20 flex-1 rounded-lg" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
            <Icon className={`h-16 w-16 mb-4 ${agentConfig?.color || "text-muted-foreground"} opacity-30`} />
            <h3 className="text-lg font-semibold mb-2">Chat with {agent.name}</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              {features?.agentic !== false
                ? `${agent.name} works autonomously — it can plan, use tools, search the web, and iterate until your task is complete. Give it a complex task and watch it go!`
                : `Give ${agent.name} a task or ask a question. The agent will process your request and respond.`}
            </p>
            {suggestedPrompts.length > 0 && (
              <div className="flex flex-wrap gap-2 max-w-lg justify-center">
                {suggestedPrompts.map((sp) => (
                  <Button
                    key={sp.id}
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => onSuggestedPrompt(sp.prompt)}
                  >
                    <Lightbulb className="h-3 w-3 mr-1" />
                    {sp.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 p-4 max-w-3xl mx-auto">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl p-3 ${
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
                      {msg.role === "assistant" && (
                        <div className="flex items-center gap-2 mb-1.5">
                          <Icon className={`h-3.5 w-3.5 ${agentConfig?.color}`} />
                          <span className="text-xs font-medium">{agent.name}</span>
                          {(() => {
                            try {
                              const meta = JSON.parse(msg.metadata || "{}");
                              if (meta.agentic) return (
                                <Badge variant="secondary" className="text-[9px] h-4 gap-0.5 px-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                  <Zap className="h-2.5 w-2.5" /> Autonomous
                                </Badge>
                              );
                            } catch {}
                            return null;
                          })()}
                        </div>
                      )}
                      {/* Agentic Steps Preview */}
                      {msg.role === "assistant" && (() => {
                        try {
                          const meta = JSON.parse(msg.metadata || "{}");
                          if (meta.agentic && meta.steps && meta.steps.length > 0) {
                            return (
                              <div className="mb-2 p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/40">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                  <Brain className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                                  <span className="text-[10px] font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider">
                                    Agent Execution ({meta.totalSteps || meta.steps.length} steps)
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {meta.steps.slice(0, 8).map((step: any, idx: number) => (
                                    <div key={idx} className="flex items-start gap-1.5 text-[10px]">
                                      {step.type === "thinking" ? (
                                        <Brain className="h-2.5 w-2.5 mt-0.5 text-purple-500 shrink-0" />
                                      ) : step.type === "tool_call" ? (
                                        <Wrench className="h-2.5 w-2.5 mt-0.5 text-blue-500 shrink-0" />
                                      ) : step.type === "tool_result" ? (
                                        <CheckCircle2 className="h-2.5 w-2.5 mt-0.5 text-green-500 shrink-0" />
                                      ) : step.type === "plan" ? (
                                        <Lightbulb className="h-2.5 w-2.5 mt-0.5 text-amber-500 shrink-0" />
                                      ) : step.type === "error" ? (
                                        <AlertTriangle className="h-2.5 w-2.5 mt-0.5 text-red-500 shrink-0" />
                                      ) : (
                                        <Eye className="h-2.5 w-2.5 mt-0.5 text-gray-400 shrink-0" />
                                      )}
                                      <span className="text-muted-foreground break-all">
                                        {step.type === "tool_call"
                                          ? `${step.toolName || "tool"}(${step.content?.replace(/.*?\(/, "").replace(/\)$/, "") || ""})`
                                          : step.type === "tool_result"
                                            ? step.content
                                            : step.content?.substring(0, 120)}
                                      </span>
                                    </div>
                                  ))}
                                  {meta.steps.length > 8 && (
                                    <span className="text-[9px] text-muted-foreground ml-4">
                                      +{meta.steps.length - 8} more steps...
                                    </span>
                                  )}
                                </div>
                                {meta.usedTools && meta.usedTools.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-purple-100 dark:border-purple-800/40">
                                    {meta.usedTools.map((tool: string) => (
                                      <Badge key={tool} variant="outline" className="text-[8px] h-3.5 px-1">
                                        {tool === "web_search" ? <Globe className="h-2 w-2 mr-0.5" /> :
                                         tool === "read_file" ? <FileCode className="h-2 w-2 mr-0.5" /> :
                                         tool === "run_command" ? <Terminal className="h-2 w-2 mr-0.5" /> :
                                         <Wrench className="h-2 w-2 mr-0.5" />}
                                        {tool}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          }
                        } catch {}
                        return null;
                      })()}
                      <div className="text-sm whitespace-pre-wrap break-words">{msg.content}</div>
                    </>
                  )}
                  {msg.role === "assistant" && (
                    <div className="flex gap-1 mt-2 pt-1.5 border-t border-border/30">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                navigator.clipboard.writeText(msg.content);
                                toast.success("Copied!");
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-green-600 hover:text-green-700"
                              onClick={() => toast.success("Approved!")}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Approve</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-500 hover:text-red-600"
                              onClick={() => toast.error("Rejected")}
                            >
                              <XCircle className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Reject</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-xl p-3 flex items-center gap-2">
                  {features?.agentic !== false ? (
                    <>
                      <Brain className="h-4 w-4 animate-pulse text-purple-500" />
                      <span className="text-sm text-muted-foreground">{agent.name} is working autonomously...</span>
                      <Badge variant="secondary" className="text-[9px] h-4 gap-0.5 px-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                        <Zap className="h-2.5 w-2.5" /> Agent Mode
                      </Badge>
                    </>
                  ) : (
                    <>
                      <Loader2Icon className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">{agent.name} is thinking...</span>
                    </>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="p-3 border-t bg-card">
        {/* Suggested prompts for empty chats */}
        {messages.length === 0 && suggestedPrompts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {suggestedPrompts.slice(0, 3).map((sp) => (
              <Button
                key={sp.id}
                variant="outline"
                size="sm"
                className="text-[10px] h-6"
                onClick={() => onSuggestedPrompt(sp.prompt)}
              >
                <Lightbulb className="h-2.5 w-2.5 mr-1" />
                {sp.label}
              </Button>
            ))}
          </div>
        )}
        <div className="flex gap-2 max-w-3xl mx-auto">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => toast.info("File upload coming soon!")}
          >
            <PaperclipIcon className="h-4 w-4" />
          </Button>
          <Textarea
            ref={chatInputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${agent.name}...`}
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
          />
          <Button onClick={handleSend} disabled={!input.trim() || sending} className="shrink-0">
            {sending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <SendIcon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// RIGHT PANEL COMPONENT
// ──────────────────────────────────────────────────────────────────
function RightPanel({
  rightTab,
  setRightTab,
  agent,
  quickActions,
  specialCommands,
  features,
  scheduledTasks,
  tasksLoading,
  crossAgentMsgs,
  crossAgentLoading,
  allAgents,
  agentId,
  onQuickAction,
  onSpecialCommand,
  onNewTask,
  onCrossAgentSend,
  onTaskStatusUpdate,
  onRefreshTasks,
  onRefreshCrossAgent,
  Icon,
  agentConfig,
}: {
  rightTab: string;
  setRightTab: (tab: "features" | "tasks" | "crossagent") => void;
  agent: AgentData;
  quickActions: QuickAction[];
  specialCommands: SpecialCommand[];
  features: Record<string, boolean>;
  scheduledTasks: ScheduledTask[];
  tasksLoading: boolean;
  crossAgentMsgs: CrossAgentMsg[];
  crossAgentLoading: boolean;
  allAgents: AgentData[];
  agentId: string;
  onQuickAction: (prompt: string) => void;
  onSpecialCommand: (prompt: string) => void;
  onNewTask: () => void;
  onCrossAgentSend: () => void;
  onTaskStatusUpdate: () => void;
  onRefreshTasks: () => void;
  onRefreshCrossAgent: () => void;
  Icon: React.ComponentType<{ className?: string }>;
  agentConfig: { color: string; label: string } | null;
}) {
  return (
    <>
      {/* Panel header */}
      <div className="p-3 border-b">
        <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as "features" | "tasks" | "crossagent")}>
          <TabsList className="w-full h-8">
            <TabsTrigger value="features" className="text-xs flex-1">
              <Zap className="h-3 w-3 mr-1" /> Features
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs flex-1">
              <Calendar className="h-3 w-3 mr-1" /> Tasks
            </TabsTrigger>
            <TabsTrigger value="crossagent" className="text-xs flex-1">
              <ArrowRightLeft className="h-3 w-3 mr-1" /> Cross
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1">
        {rightTab === "features" && (
          <FeaturesTab
            agent={agent}
            quickActions={quickActions}
            specialCommands={specialCommands}
            features={features}
            onQuickAction={onQuickAction}
            onSpecialCommand={onSpecialCommand}
            Icon={Icon}
            agentConfig={agentConfig}
          />
        )}
        {rightTab === "tasks" && (
          <TasksTab
            tasks={scheduledTasks}
            loading={tasksLoading}
            onNewTask={onNewTask}
            onStatusUpdate={onTaskStatusUpdate}
            onRefresh={onRefreshTasks}
          />
        )}
        {rightTab === "crossagent" && (
          <CrossAgentTab
            messages={crossAgentMsgs}
            loading={crossAgentLoading}
            agentId={agentId}
            onSend={onCrossAgentSend}
            onRefresh={onRefreshCrossAgent}
            allAgents={allAgents}
          />
        )}
      </ScrollArea>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// FEATURES TAB
// ──────────────────────────────────────────────────────────────────
function FeaturesTab({
  agent,
  quickActions,
  specialCommands,
  features,
  onQuickAction,
  onSpecialCommand,
  Icon,
  agentConfig,
}: {
  agent: AgentData;
  quickActions: QuickAction[];
  specialCommands: SpecialCommand[];
  features: Record<string, boolean>;
  onQuickAction: (prompt: string) => void;
  onSpecialCommand: (prompt: string) => void;
  Icon: React.ComponentType<{ className?: string }>;
  agentConfig: { color: string; label: string } | null;
}) {
  return (
    <div className="p-3 space-y-4">
      {/* Agent Info Card */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50">
        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Icon className={`h-5 w-5 ${agentConfig?.color || "text-muted-foreground"}`} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate">{agent.name}</h3>
          <p className="text-[10px] text-muted-foreground">{agent.model}</p>
        </div>
      </div>

      {/* Features Toggle */}
      {Object.keys(features).length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Features</h4>
          <div className="space-y-2">
            {Object.entries(features).map(([key, enabled]) => {
              const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
              return (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="text-xs">{label}</span>
                  <Badge variant={enabled ? "default" : "secondary"} className="text-[10px]">
                    {enabled ? "ON" : "OFF"}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {quickActions.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <Zap className="h-3 w-3 inline mr-1" /> Quick Actions
          </h4>
          <div className="space-y-1">
            {quickActions.map((qa) => (
              <Button
                key={qa.id}
                variant="outline"
                size="sm"
                className="w-full justify-start text-xs h-8"
                onClick={() => onQuickAction(qa.prompt)}
              >
                <SendHorizontal className="h-3 w-3 mr-2 shrink-0" />
                <span className="truncate">{qa.label}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Special Commands */}
      {specialCommands.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <Command className="h-3 w-3 inline mr-1" /> Special Commands
          </h4>
          <div className="space-y-1">
            {specialCommands.map((sc) => (
              <Button
                key={sc.id}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs h-8 bg-accent/50"
                onClick={() => onSpecialCommand(sc.prompt)}
              >
                <ChevronRight className="h-3 w-3 mr-2 shrink-0" />
                <span className="truncate">{sc.label}</span>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// TASKS TAB
// ──────────────────────────────────────────────────────────────────
function TasksTab({
  tasks,
  loading,
  onNewTask,
  onStatusUpdate,
  onRefresh,
}: {
  tasks: ScheduledTask[];
  loading: boolean;
  onNewTask: () => void;
  onStatusUpdate: () => void;
  onRefresh: () => void;
}) {
  const handleUpdateStatus = async (taskId: string, status: string) => {
    try {
      const res = await fetch("/api/scheduled-tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: taskId, status }),
      });
      if (res.ok) {
        toast.success(`Task marked as ${status}`);
        onStatusUpdate();
      }
    } catch {
      toast.error("Failed to update task");
    }
  };

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scheduled Tasks</h4>
        <div className="flex gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRefresh}>
                  <Loader2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onNewTask}>
                  <Plus className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New Task</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-8">
          <Calendar className="h-8 w-8 mx-auto text-muted-foreground opacity-50 mb-2" />
          <p className="text-xs text-muted-foreground mb-2">No scheduled tasks</p>
          <Button variant="outline" size="sm" onClick={onNewTask}>
            <Plus className="h-3 w-3 mr-1" /> Create Task
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <Card key={task.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h5 className="text-xs font-medium truncate">{task.title}</h5>
                  {task.description && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge className={`text-[9px] h-4 ${priorityColors[task.priority] || ""}`}>
                      {task.priority}
                    </Badge>
                    <Badge className={`text-[9px] h-4 ${taskStatusColors[task.status] || ""}`}>
                      {task.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(task.dueDate).toLocaleDateString()}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    {task.status === "PENDING" && (
                      <DropdownMenuItem onClick={() => handleUpdateStatus(task.id, "IN_PROGRESS")}>
                        Start Task
                      </DropdownMenuItem>
                    )}
                    {task.status === "IN_PROGRESS" && (
                      <DropdownMenuItem onClick={() => handleUpdateStatus(task.id, "COMPLETED")}>
                        Complete Task
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleUpdateStatus(task.id, "CANCELLED")}>
                      Cancel Task
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {task.progress > 0 && (
                <div className="mt-2">
                  <div className="h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${task.progress}%` }} />
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// CROSS-AGENT TAB
// ──────────────────────────────────────────────────────────────────
function CrossAgentTab({
  messages,
  loading,
  agentId,
  onSend,
  onRefresh,
  allAgents,
}: {
  messages: CrossAgentMsg[];
  loading: boolean;
  agentId: string;
  onSend: () => void;
  onRefresh: () => void;
  allAgents: AgentData[];
}) {
  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cross-Agent Messages</h4>
        <div className="flex gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRefresh}>
                  <Loader2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onSend}>
                  <Send className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Send to Agent</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-8">
          <ArrowRightLeft className="h-8 w-8 mx-auto text-muted-foreground opacity-50 mb-2" />
          <p className="text-xs text-muted-foreground mb-2">No cross-agent messages</p>
          <Button variant="outline" size="sm" onClick={onSend}>
            <Send className="h-3 w-3 mr-1" /> Send Message
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.slice(0, 10).map((msg) => {
            const isIncoming = msg.toAgentId === agentId;
            return (
              <Card key={msg.id} className="p-2.5">
                <div className="flex items-start gap-2">
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${isIncoming ? "bg-blue-100 dark:bg-blue-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                    {isIncoming ? (
                      <ArrowLeft className="h-2.5 w-2.5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Send className="h-2.5 w-2.5 text-green-600 dark:text-green-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-medium">
                        {isIncoming ? msg.fromAgent?.name : msg.toAgent?.name}
                      </span>
                      <Badge variant="outline" className="text-[8px] h-3 px-1">
                        {msg.type}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{msg.message}</p>
                    <span className="text-[8px] text-muted-foreground mt-0.5 block">
                      {formatRelativeTime(msg.createdAt)}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// AGENT SETTINGS DIALOG
// ──────────────────────────────────────────────────────────────────
function AgentSettingsDialog({
  open,
  onOpenChange,
  agent,
  onSave,
  quickActions,
  specialCommands,
  features,
  suggestedPrompts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AgentData;
  onSave: (data: Record<string, unknown>) => void;
  quickActions: QuickAction[];
  specialCommands: SpecialCommand[];
  features: Record<string, boolean>;
  suggestedPrompts: SuggestedPrompt[];
}) {
  // Increment key when dialog opens to force form remount with fresh props
  const [formKey, setFormKey] = useState(0);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <AgentSettingsForm
          key={formKey}
          agent={agent}
          onSave={onSave}
          onClose={() => onOpenChange(false)}
          quickActions={quickActions}
          specialCommands={specialCommands}
          features={features}
          suggestedPrompts={suggestedPrompts}
        />
      </DialogContent>
    </Dialog>
  );
}

function AgentSettingsForm({
  agent,
  onSave,
  onClose,
  quickActions,
  specialCommands,
  features,
  suggestedPrompts,
}: {
  agent: AgentData;
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
  quickActions: QuickAction[];
  specialCommands: SpecialCommand[];
  features: Record<string, boolean>;
  suggestedPrompts: SuggestedPrompt[];
}) {
  const [model, setModel] = useState(agent.model);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const [rolePrompt, setRolePrompt] = useState(agent.roleConfig?.rolePrompt || agent.systemPrompt);
  const [editedFeatures, setEditedFeatures] = useState<Record<string, boolean>>(features);

  const handleSave = () => {
    onSave({
      model,
      systemPrompt,
      roleConfig: {
        rolePrompt,
        quickActions,
        specialCommands,
        features: editedFeatures,
        suggestedPrompts,
      },
    });
  };

  const modelOptions = [...(MODEL_OPTIONS.openrouter || []), ...(MODEL_OPTIONS.zai || [])];

  return (
    <>
      <DialogHeader>
        <DialogTitle>Agent Settings</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Model</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label} <span className="text-xs text-muted-foreground ml-1">({opt.cost})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>System Prompt</Label>
          <Textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4}
            className="text-xs"
          />
        </div>
        <Separator />
        <div className="space-y-2">
          <Label>Role Prompt (Enhanced)</Label>
          <Textarea
            value={rolePrompt}
            onChange={(e) => setRolePrompt(e.target.value)}
            rows={6}
            className="text-xs"
          />
        </div>
        {Object.keys(editedFeatures).length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <Label>Feature Toggles</Label>
              <div className="space-y-2">
                {Object.entries(editedFeatures).map(([key, enabled]) => {
                  const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm">{label}</span>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(checked) =>
                          setEditedFeatures((prev) => ({ ...prev, [key]: checked }))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save Changes</Button>
      </DialogFooter>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// NEW TASK DIALOG
// ──────────────────────────────────────────────────────────────────
function NewTaskDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { title: string; description: string; dueDate: string; priority: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("MEDIUM");

  const handleSubmit = () => {
    if (!title.trim() || !dueDate) {
      toast.error("Title and due date are required");
      return;
    }
    onSubmit({ title: title.trim(), description: description.trim(), dueDate, priority });
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("MEDIUM");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Scheduled Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Task description"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Due Date *</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="URGENT">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Create Task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────
// CROSS-AGENT DIALOG
// ──────────────────────────────────────────────────────────────────
function CrossAgentDialog({
  open,
  onOpenChange,
  agents,
  onSend,
  fromAgentName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: AgentData[];
  onSend: (toAgentId: string, message: string, type: string) => void;
  fromAgentName: string;
}) {
  const [toAgentId, setToAgentId] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("INFO");

  const handleSend = () => {
    if (!toAgentId || !message.trim()) {
      toast.error("Select an agent and type a message");
      return;
    }
    onSend(toAgentId, message.trim(), type);
    setToAgentId("");
    setMessage("");
    setType("INFO");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send to Another Agent</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>From</Label>
            <Input value={fromAgentName} disabled className="bg-muted" />
          </div>
          <div className="space-y-2">
            <Label>To Agent *</Label>
            <Select value={toAgentId} onValueChange={setToAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select agent..." />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} ({a.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Message Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INFO">Info</SelectItem>
                <SelectItem value="REQUEST">Request</SelectItem>
                <SelectItem value="RESULT">Result</SelectItem>
                <SelectItem value="ALERT">Alert</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Message *</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message to the other agent..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSend}>
            <Send className="h-4 w-4 mr-1" /> Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
