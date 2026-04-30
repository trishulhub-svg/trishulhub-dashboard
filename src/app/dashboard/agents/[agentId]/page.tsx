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
  Sparkles, ListChecks, CircleDot, CircleCheck, CircleX, Circle,
  Link2, Unlink, FileUp, Upload,
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
  lockedBy?: string | null;
  lockedAt?: string | null;
  lockedByName?: string | null;
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
  user?: { id: string; name: string };
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
  linkedChatId?: string;
  shareFullChat?: boolean;
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
  const [rightTab, setRightTab] = useState<"features" | "tasks" | "crossagent" | "live">("live");

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
  const [liveSteps, setLiveSteps] = useState<Array<{ type: string; content: string; toolName?: string; status: 'running' | 'done' | 'error' }>>([]);

  // Retry state - store last failed prompt for retry button
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [failedMsgId, setFailedMsgId] = useState<string | null>(null);

  // Chat locking state (Feature 4)
  const [chatLockInfo, setChatLockInfo] = useState<{ lockedBy: string | null; lockedByName: string | null; lockedAt: string | null }>({ lockedBy: null, lockedByName: null, lockedAt: null });

  // Plan steps for Tasks tab (Feature 2)
  const [planSteps, setPlanSteps] = useState<Array<{ step: number; title: string; description: string; status: 'completed' | 'running' | 'pending' }>>([]);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  // File upload state
  const [attachedFiles, setAttachedFiles] = useState<Array<{ url: string; name: string; type: string; isImage: boolean }>>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

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
      // Fetch both ACTIVE and ENDED chats so ended chats remain visible in sidebar
      const res = await fetch(`/api/chats?agentId=${agentId}&status=ACTIVE,ENDED`, { credentials: "include" });
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
  const fetchMessages = useCallback(async (chatId: string): Promise<ChatMessage[]> => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/chats/messages?chatId=${chatId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const msgs = (data.messages || data) as ChatMessage[];
        setMessages(msgs);
        return msgs;
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setMessagesLoading(false);
    }
    return [];
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

  // ── SessionStorage helpers for persisting agent processing state ──
  const getProcessingKey = useCallback((cId: string) => `agentProcessing_${agentId}_${cId}`, [agentId]);

  const markProcessingStart = useCallback((cId: string, msgCount: number) => {
    try {
      sessionStorage.setItem(getProcessingKey(cId), JSON.stringify({
        chatId: cId,
        agentId,
        startedAt: Date.now(),
        lastMessageCount: msgCount,
      }));
    } catch {}
  }, [getProcessingKey, agentId]);

  const markProcessingEnd = useCallback((cId: string) => {
    try {
      sessionStorage.removeItem(getProcessingKey(cId));
    } catch {}
  }, [getProcessingKey]);

  const getProcessingInfo = useCallback((cId: string): { chatId: string; agentId: string; startedAt: number; lastMessageCount: number } | null => {
    try {
      const raw = sessionStorage.getItem(getProcessingKey(cId));
      if (!raw) return null;
      const info = JSON.parse(raw);
      // Auto-expire after 10 minutes
      if (Date.now() - info.startedAt > 10 * 60 * 1000) {
        sessionStorage.removeItem(getProcessingKey(cId));
        return null;
      }
      return info;
    } catch { return null; }
  }, [getProcessingKey]);

  // ── Poll for completion when resuming after navigation ──
  const startPollingForCompletion = useCallback((cId: string, knownMsgCount: number) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    setSending(true);
    setIsAgentic(true);
    setLiveSteps([{ type: 'resuming', content: 'Agent is still working...', status: 'running' }]);

    let checkCount = 0;
    const MAX_CHECKS = 240; // 240 * 2.5s = 10 minutes max

    pollingRef.current = setInterval(async () => {
      checkCount++;
      if (checkCount > MAX_CHECKS) {
        // Timeout - stop polling
        setSending(false);
        setIsAgentic(false);
        setLiveSteps([]);
        markProcessingEnd(cId);
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        return;
      }

      try {
        const res = await fetch(`/api/chats/messages?chatId=${cId}`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const msgs = (data.messages || data) as ChatMessage[];

        // Update messages display in real-time
        setMessages(msgs);

        // Check if there's a new assistant message since we started processing
        const assistantMsgs = msgs.filter((m: ChatMessage) => m.role === 'assistant');
        if (assistantMsgs.length > 0 && msgs.length > knownMsgCount) {
          // Agent has responded - update messages and stop animation
          setSending(false);
          setIsAgentic(false);
          setLiveSteps([]);
          markProcessingEnd(cId);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          // Refresh chat list to reflect updated state
          fetchChats();
        }
      } catch {
        // Continue polling on error
      }
    }, 2500); // Poll every 2.5s
  }, [markProcessingEnd, fetchChats]);

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

  // ── Check for active processing on mount (navigation resume) ──
  useEffect(() => {
    // After chats are loaded, check if any chat has active processing
    if (chats.length === 0 || !agentId) return;

    for (const chat of chats) {
      const info = getProcessingInfo(chat.id);
      if (info) {
        // Found an active processing chat - first fetch messages to see if agent already finished
        setActiveChatId(chat.id);
        fetchMessages(chat.id).then((loadedMsgs) => {
          // Check if there's already an assistant response newer than our start time
          const assistantMsgs = loadedMsgs.filter((m: ChatMessage) => m.role === 'assistant');
          if (assistantMsgs.length > 0 && loadedMsgs.length > info.lastMessageCount) {
            // Agent already finished while we were away - no need to animate
            markProcessingEnd(chat.id);
          } else {
            // Agent is still working - resume animation and poll for completion
            startPollingForCompletion(chat.id, info.lastMessageCount);
          }
        });
        break;
      }
    }
  }, [chats, agentId, getProcessingInfo, fetchMessages, startPollingForCompletion, markProcessingEnd]);

  // ── Cleanup polling on unmount ──
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // ── Auto-release lock on unmount / navigation away ──
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (activeChatId) {
        navigator.sendBeacon(`/api/chat-lock?chatId=${activeChatId}`);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [activeChatId]);

  // ── Select chat ──
  const selectChat = useCallback(async (chatId: string) => {
    // Check lock status before selecting
    try {
      const lockRes = await fetch(`/api/chat-lock?chatId=${chatId}`, { credentials: "include" });
      if (lockRes.ok) {
        const lockData = await lockRes.json();
        setChatLockInfo({ lockedBy: lockData.lockedBy, lockedByName: lockData.lockedByName, lockedAt: lockData.lockedAt });
        
        // If locked by another user and not admin, show locked state
        const currentUserId = (session?.user as any)?.id;
        const currentUserRole = (session?.user as any)?.role;
        if (lockData.locked && lockData.lockedBy !== currentUserId && currentUserRole !== "SUPER_ADMIN" && currentUserRole !== "ADMIN") {
          setActiveChatId(chatId);
          fetchMessages(chatId);
          if (isMobile) setMobileTab("messages");
          return;
        }
      }
    } catch {
      // Continue even if lock check fails
    }

    // Release previous chat lock if switching chats
    if (activeChatId && activeChatId !== chatId) {
      try {
        await fetch(`/api/chat-lock?chatId=${activeChatId}`, { method: "DELETE", credentials: "include" });
      } catch {}
    }

    setActiveChatId(chatId);
    fetchMessages(chatId).then(() => {
      // After loading messages, check if this chat has active processing
      const procInfo = getProcessingInfo(chatId);
      if (procInfo) {
        startPollingForCompletion(chatId, procInfo.lastMessageCount);
      }
    });
    if (isMobile) setMobileTab("messages");
  }, [fetchMessages, isMobile, activeChatId, session, getProcessingInfo, startPollingForCompletion]);

  // ── Release chat lock ──
  const releaseChatLock = useCallback(async () => {
    if (!activeChatId) return;
    try {
      await fetch(`/api/chat-lock?chatId=${activeChatId}`, { method: "DELETE", credentials: "include" });
      setChatLockInfo({ lockedBy: null, lockedByName: null, lockedAt: null });
    } catch {}
  }, [activeChatId]);

  // ── End Chat (release lock + set status to ENDED) ──
  const endChat = useCallback(async () => {
    if (!activeChatId) return;
    try {
      // Release lock
      await fetch(`/api/chat-lock?chatId=${activeChatId}`, { method: "DELETE", credentials: "include" });
      // Set chat status to ENDED
      await fetch("/api/chats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: activeChatId, status: "ENDED" }),
      });
      setChatLockInfo({ lockedBy: null, lockedByName: null, lockedAt: null });
      // Keep the chat selected so user can see messages, just update the chat list
      await fetchChats();
      toast.success("Chat ended — you can still view messages");
    } catch {
      toast.error("Failed to end chat");
    }
  }, [activeChatId, fetchChats]);

  // ── Resume Chat (set status back to ACTIVE so user can continue) ──
  const resumeChat = useCallback(async (chatId?: string) => {
    const targetId = chatId || activeChatId;
    if (!targetId) return;
    try {
      await fetch("/api/chats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: targetId, status: "ACTIVE" }),
      });
      await fetchChats();
      // Make sure the resumed chat is the active one
      if (targetId !== activeChatId) {
        setActiveChatId(targetId);
        fetchMessages(targetId);
        if (isMobile) setMobileTab("messages");
      }
      toast.success("Chat resumed — continue where you left off!");
    } catch {
      toast.error("Failed to resume chat");
    }
  }, [activeChatId, fetchChats, fetchMessages, isMobile]);

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

  // ── File upload handler ──
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Support agent doesn't get file upload
    if (agent?.type === "SUPPORT") return;

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_EXTENSIONS = ["png","jpg","jpeg","gif","webp","svg","pdf","doc","docx","xls","xlsx","txt","csv","json","md","js","ts","tsx","jsx","html","css","zip"];
    const IMAGE_EXTENSIONS = ["png","jpg","jpeg","gif","webp","svg"];

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        // Check file size
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`File "${file.name}" is too large. Maximum size is 10MB.`);
          continue;
        }

        // Check file extension
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          toast.error(`File type "${ext}" not allowed for "${file.name}".`);
          continue;
        }

        // Read file as base64 data URL on the client side (no server upload needed)
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error(`Failed to read file "${file.name}"`));
          reader.readAsDataURL(file);
        });

        const isImage = IMAGE_EXTENSIONS.includes(ext);

        setAttachedFiles((prev) => [...prev, {
          url: dataUrl,
          name: file.name,
          type: file.type || `application/${ext}`,
          isImage,
        }]);
      }
    } catch (err: any) {
      toast.error("File processing failed: " + err.message);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [agentId, agent?.type]);

  const removeAttachment = useCallback((url: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.url !== url));
  }, []);

  // ── Send message ──
  const handleSend = useCallback(async () => {
    // Allow sending with just text, just attachments, or both
    if ((!input.trim() && attachedFiles.length === 0) || sending || uploading) return;

    const userContent = input.trim() || "Please analyze the attached file(s).";
    const currentAttachments = [...attachedFiles];
    setInput("");
    setAttachedFiles([]);

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      chatId: activeChatId || "",
      role: "user",
      content: userContent + (currentAttachments.length > 0 ? `\n\n📎 Attached: ${currentAttachments.map(f => f.name).join(", ")}` : ""),
      createdAt: new Date().toISOString(),
      metadata: currentAttachments.length > 0 ? JSON.stringify({ attachments: currentAttachments.map(f => ({ name: f.name, type: f.isImage ? "image" : "file", stored: false })) }) : undefined,
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setSending(true);

    // Use agentic endpoint for agents with agentic feature enabled
    const useAgentic = features?.agentic !== false; // All agents are agentic by default
    if (useAgentic) {
      setAgentSteps([]);
      setIsAgentic(true);
      setLiveSteps([]);
    }

    // Mark agent as processing in sessionStorage (persists across navigation)
    const currentMsgCount = messages.length + 1; // +1 for the temp user msg
    
    // If no active chat, create one on the server FIRST so we have a chatId
    // This ensures chat is saved even if user navigates away mid-processing
    let resolvedChatId = activeChatId;
    if (!resolvedChatId) {
      try {
        const chatRes = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ agentId, title: userContent.substring(0, 50) + (userContent.length > 50 ? "..." : "") }),
        });
        if (chatRes.ok) {
          const chatData = await chatRes.json();
          resolvedChatId = chatData.id;
          setActiveChatId(resolvedChatId);
          await fetchChats();
        }
      } catch {
        // Continue even if pre-creation fails - API will create chat as fallback
      }
    }
    
    if (resolvedChatId) {
      markProcessingStart(resolvedChatId, currentMsgCount);
    }

    try {
      const endpoint = useAgentic ? "/api/agents/agent-chat" : "/api/agents/chat";

      // Use streaming for agentic mode
      if (useAgentic) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            agentId,
            message: userContent,
            chatId: resolvedChatId || undefined,
            stream: true,
            fileUrls: currentAttachments.length > 0 ? currentAttachments.map(f => f.url) : undefined,
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          const errorMsg = error.error || "Failed to get response";
          if (error.steps) setAgentSteps(error.steps);
          toast.error(errorMsg, { duration: 6000 });
          // Keep the user message but add error system message + enable retry
          setLastFailedPrompt(userContent);
          setFailedMsgId(tempUserMsg.id);
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              chatId: activeChatId || "",
              role: "system",
              content: errorMsg.includes("API key") || errorMsg.includes("No active API key") || errorMsg.includes("Z.ai API key")
                ? "No valid Z.ai API key found. Add one in Settings > API Keys."
                : `Error: ${errorMsg}`,
              createdAt: new Date().toISOString(),
              metadata: JSON.stringify({ isError: true, retryPrompt: userContent }),
            },
          ]);
          if (error.chatId && !resolvedChatId) {
            resolvedChatId = error.chatId;
            setActiveChatId(error.chatId);
            await fetchChats();
          }
          return;
        }

        // Parse SSE stream for real-time step updates
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream body");

        const decoder = new TextDecoder();
        let buffer = "";
        let finalData: any = null;
        const collectedSteps: Array<{ type: string; content: string; toolName?: string; stepNumber: number }> = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);

              if (event.type === "step") {
                // Real-time step update
                const step = event.step;
                collectedSteps.push(step);
                setAgentSteps([...collectedSteps]);

                // Check for plan_task steps (Feature 2)
                if (step.type === "tool_call" && step.toolName === "plan_task") {
                  try {
                    const argsStr = step.content || "";
                    const stepsMatch = argsStr.match(/"steps":\s*\[([\s\S]*?)\]/);
                    if (stepsMatch) {
                      const stepsData = JSON.parse(`[${stepsMatch[1]}]`);
                      setPlanSteps(stepsData.map((s: any, idx: number) => ({
                        step: s.step || idx + 1,
                        title: s.title || `Step ${idx + 1}`,
                        description: s.description || "",
                        status: idx === 0 ? 'running' as const : 'pending' as const,
                      })));
                    }
                  } catch {}
                }

                // Update plan step status as tools execute
                if (step.type === "tool_result" && planSteps.length > 0) {
                  setPlanSteps(prev => {
                    const updated = [...prev];
                    const runningIdx = updated.findIndex(s => s.status === 'running');
                    if (runningIdx >= 0) {
                      updated[runningIdx] = { ...updated[runningIdx], status: 'completed' as const };
                      if (runningIdx + 1 < updated.length) {
                        updated[runningIdx + 1] = { ...updated[runningIdx + 1], status: 'running' as const };
                      }
                    }
                    return updated;
                  });
                }

                // Update live steps with status
                setLiveSteps((prev) => {
                  const updated = [...prev];
                  // Mark previous steps as done
                  if (updated.length > 0) {
                    updated[updated.length - 1] = { ...updated[updated.length - 1], status: 'done' };
                  }
                  updated.push({
                    type: step.type,
                    content: step.type === "thinking" ? "Thinking..." :
                             step.type === "tool_call" ? `Using ${step.toolName || 'tool'}...` :
                             step.type === "tool_result" ? `${step.toolName || 'Tool'} completed` :
                             step.type === "plan" ? "Planning approach..." :
                             step.type === "error" ? "Error occurred" :
                             "Preparing response...",
                    toolName: step.toolName,
                    status: 'running',
                  });
                  return updated;
                });
              } else if (event.type === "complete") {
                finalData = event;
              } else if (event.type === "error") {
                toast.error(event.message || "Agent execution error", { duration: 6000 });
              }
            } catch {
              // Ignore non-JSON lines
            }
          }
        }

        // Handle final response (fallback if no streaming events)
        if (!finalData) {
          // Non-streaming fallback — parse as regular JSON
          setLiveSteps([]);
          setAgentSteps([]);
          const textRes = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              agentId,
              message: userContent,
              chatId: activeChatId || undefined,
            }),
          });
          if (textRes.ok) {
            finalData = await textRes.json();
            if (finalData.steps) setAgentSteps(finalData.steps);
          }
        }

        if (finalData) {
          if (finalData.steps) setAgentSteps(finalData.steps);

          const assistantMsg: ChatMessage = {
            id: finalData.messageId || `temp-assistant-${Date.now()}`,
            chatId: finalData.chatId || activeChatId || "",
            role: "assistant",
            content: finalData.content || "No response",
            metadata: JSON.stringify({
              agentic: finalData.agentic,
              totalSteps: finalData.totalSteps,
              usedTools: finalData.usedTools,
              steps: finalData.steps,
              thinkingPreview: finalData.thinkingPreview,
            }),
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, assistantMsg]);

          if (!resolvedChatId && finalData.chatId) {
            resolvedChatId = finalData.chatId;
            setActiveChatId(finalData.chatId);
            await fetchChats();
          }
        }
      } else {
        // Simple chat (non-agentic) - standard request
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            agentId,
            message: userContent,
            chatId: resolvedChatId || undefined,
          }),
        });

        if (res.ok) {
          const data = await res.json();
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

          if (!resolvedChatId && data.chatId) {
            resolvedChatId = data.chatId;
            setActiveChatId(data.chatId);
            await fetchChats();
          }
        } else {
          const errorData = await res.json();
          toast.error(errorData.error || "Failed to get response", { duration: 6000 });
          // Keep user message, add error with retry
          setLastFailedPrompt(userContent);
          setFailedMsgId(tempUserMsg.id);
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              chatId: activeChatId || "",
              role: "system",
              content: `Error: ${errorData.error || "Failed to get response"}`,
              createdAt: new Date().toISOString(),
              metadata: JSON.stringify({ isError: true, retryPrompt: userContent }),
            },
          ]);
          if (errorData.chatId && !activeChatId) {
            setActiveChatId(errorData.chatId);
            await fetchChats();
          }
        }
      }
    } catch {
      toast.error("Network error. Please try again.");
      // Keep user message, add error with retry instead of removing it
      setLastFailedPrompt(userContent);
      setFailedMsgId(tempUserMsg.id);
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          chatId: activeChatId || "",
          role: "system",
          content: "Network error. Check your connection and try again.",
          createdAt: new Date().toISOString(),
          metadata: JSON.stringify({ isError: true, retryPrompt: userContent }),
        },
      ]);
    } finally {
      setSending(false);
      setIsAgentic(false);
      setLiveSteps([]);
      // Clear processing marker from sessionStorage
      if (resolvedChatId) {
        markProcessingEnd(resolvedChatId);
      }
      // Also stop any polling if running
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      // Mark all plan steps as completed when done
      if (planSteps.length > 0) {
        setPlanSteps(prev => prev.map(s => ({ ...s, status: 'completed' as const })));
      }
    }
  }, [input, sending, uploading, attachedFiles, agentId, activeChatId, fetchChats, agent?.type, features?.agentic, planSteps, markProcessingStart, markProcessingEnd]);

  // ── Retry failed prompt ──
  const handleRetry = useCallback((prompt: string) => {
    // Remove the error message and the failed assistant message from chat
    setMessages((prev) => prev.filter((m) => {
      try {
        const meta = JSON.parse(m.metadata || "{}");
        return !meta.isError;
      } catch { return true; }
    }));
    setLastFailedPrompt(null);
    setFailedMsgId(null);
    // Set the prompt and auto-send after a tick
    setInput(prompt);
    // Use setTimeout to ensure state update before sending
    setTimeout(() => {
      // Directly call the send logic instead of relying on input state
      // since setInput is async
      if (chatInputRef.current) chatInputRef.current.focus();
    }, 100);
  }, []);

  // ── Key handler ──
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Block sending while uploading
      if (uploading) return;
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
  const currentUserId = (session?.user as { id?: string })?.id;

  // Is the current chat locked by someone else?
  const isChatLockedByOther = !!(activeChatId && chatLockInfo.lockedBy && chatLockInfo.lockedBy !== currentUserId && userRole !== "SUPER_ADMIN" && userRole !== "ADMIN");

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
  const handleCreateTask = async (data: { title: string; description: string; dueDate: string; priority: string; attachments?: any[]; crossAgentAccess?: string[] }) => {
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
  const handleCrossAgentSend = async (toAgentId: string, message: string, type: string, linkedChatId?: string, shareFullChat?: boolean) => {
    try {
      const res = await fetch("/api/cross-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fromAgentId: agentId, toAgentId, message, type, chatId: activeChatId || undefined, linkedChatId, shareFullChat }),
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
              onResumeChat={resumeChat}
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
              liveSteps={liveSteps}
              agentSteps={agentSteps}
              attachedFiles={attachedFiles}
              uploading={uploading}
              onFileUpload={handleFileUpload}
              onRemoveAttachment={removeAttachment}
              fileInputRef={fileInputRef}
              Paperclip={Paperclip}
              Send={Send}
              Loader2={Loader2}
              isChatLockedByOther={isChatLockedByOther}
              chatLockInfo={chatLockInfo}
              onEndChat={endChat}
              onReleaseLock={releaseChatLock}
              onRetry={handleRetry}
              onResumeChat={resumeChat}
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
              liveSteps={liveSteps}
              agentSteps={agentSteps}
              planSteps={planSteps}
              expandedSteps={expandedSteps}
              setExpandedSteps={setExpandedSteps}
              sending={sending}
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
        <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} onSubmit={handleCreateTask} allAgents={allAgents} currentAgentId={agentId} />
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
              onResumeChat={resumeChat}
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Chat Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
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
          liveSteps={liveSteps}
          agentSteps={agentSteps}
          attachedFiles={attachedFiles}
          uploading={uploading}
          onFileUpload={handleFileUpload}
          onRemoveAttachment={removeAttachment}
          fileInputRef={fileInputRef}
          Paperclip={Paperclip}
          Send={Send}
          Loader2={Loader2}
          isChatLockedByOther={isChatLockedByOther}
          chatLockInfo={chatLockInfo}
          onEndChat={endChat}
          onReleaseLock={releaseChatLock}
          onRetry={handleRetry}
          onResumeChat={resumeChat}
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
            liveSteps={liveSteps}
            agentSteps={agentSteps}
            planSteps={planSteps}
            expandedSteps={expandedSteps}
            setExpandedSteps={setExpandedSteps}
            sending={sending}
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
      <NewTaskDialog open={newTaskOpen} onOpenChange={setNewTaskOpen} onSubmit={handleCreateTask} allAgents={allAgents} currentAgentId={agentId} />
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
  onResumeChat,
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
  onResumeChat?: (chatId: string) => void;
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

  // Separate active and ended chats for sidebar display
  const activeChats = chats.filter(c => c.status === "ACTIVE");
  const endedChats = chats.filter(c => c.status === "ENDED");

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
          <>
            {activeChats.map((chat) => (
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
                        {chat.lockedByName && (
                          <Badge variant="secondary" className="text-[8px] h-3 px-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 gap-0.5">
                            🔒 {chat.lockedByName}
                          </Badge>
                        )}
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
            ))}
            {endedChats.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-2 pt-3 pb-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Ended</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {endedChats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`group flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors opacity-60 hover:opacity-80 ${
                      activeChatId === chat.id
                        ? "bg-accent text-accent-foreground opacity-100"
                        : "hover:bg-accent/50"
                    }`}
                    onClick={() => onSelect(chat.id)}
                  >
                    <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-medium truncate">{chat.title}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 text-[9px] px-1.5 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              onResumeChat?.(chat.id);
                            }}
                          >
                            <Zap className="h-2.5 w-2.5 mr-0.5" /> Resume
                          </Button>
                          <Badge variant="outline" className="text-[8px] h-3 px-1 text-muted-foreground">ENDED</Badge>
                        </div>
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
                ))}
              </>
            )}
          </>
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
  liveSteps,
  agentSteps,
  attachedFiles,
  uploading,
  onFileUpload,
  onRemoveAttachment,
  fileInputRef,
  Paperclip: PaperclipIcon,
  Send: SendIcon,
  Loader2: Loader2Icon,
  isChatLockedByOther,
  chatLockInfo,
  onEndChat,
  onReleaseLock,
  onRetry,
  onResumeChat,
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
  liveSteps: Array<{ type: string; content: string; toolName?: string; status: 'running' | 'done' | 'error' }>;
  agentSteps: Array<{ type: string; content: string; toolName?: string; stepNumber: number }>;
  attachedFiles: Array<{ url: string; name: string; type: string; isImage: boolean }>;
  uploading: boolean;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (url: string) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  Paperclip: React.ComponentType<{ className?: string }>;
  Send: React.ComponentType<{ className?: string }>;
  Loader2: React.ComponentType<{ className?: string }>;
  isChatLockedByOther: boolean | null;
  chatLockInfo: { lockedBy: string | null; lockedByName: string | null; lockedAt: string | null };
  onEndChat: () => void;
  onReleaseLock: () => void;
  onRetry: (prompt: string) => void;
  onResumeChat: (chatId?: string) => void;
}) {
  const [expandedMsgSteps, setExpandedMsgSteps] = useState<Set<string>>(new Set());

  const toggleMsgSteps = (msgId: string) => {
    setExpandedMsgSteps((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
      {/* Feature 4: Chat Locked Overlay */}
      {isChatLockedByOther && (
        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center p-6 max-w-sm">
            <div className="h-16 w-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="h-8 w-8 text-orange-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Chat Locked</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {chatLockInfo.lockedByName || 'Another user'} is currently working on this chat. You cannot send messages until they release it.
            </p>
            <Button variant="outline" onClick={onReleaseLock} className="text-sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Go Back
            </Button>
          </div>
        </div>
      )}
      {/* Agent is thinking indicator - subtle gradient line */}
      {sending && (
        <div className="h-0.5 bg-gradient-to-r from-transparent via-purple-500 to-transparent animate-pulse shrink-0" />
      )}
      {/* Feature 4: End Chat / Resume Chat button in header */}
      {activeChat && !isChatLockedByOther && (
        <div className="px-4 py-1.5 border-b bg-card flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] h-4">
              {activeChat.status}
            </Badge>
            {chatLockInfo.lockedByName && (
              <Badge variant="secondary" className="text-[9px] h-4 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                🔒 {chatLockInfo.lockedByName}
              </Badge>
            )}
          </div>
          {activeChat.status === "ENDED" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
              onClick={() => onResumeChat()}
            >
              <Zap className="h-3 w-3 mr-1" /> Resume Chat
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              onClick={onEndChat}
            >
              <X className="h-3 w-3 mr-1" /> End Chat
            </Button>
          )}
        </div>
      )}
      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
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
          <div className="space-y-6 p-4 max-w-3xl mx-auto">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] p-3.5 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md"
                      : msg.role === "system"
                      ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl"
                      : "bg-card border border-border/50 rounded-2xl rounded-bl-md"
                  }`}
                >
                  {msg.role === "system" ? (
                    (() => {
                      let isError = false;
                      let retryPrompt: string | undefined;
                      try {
                        const meta = JSON.parse(msg.metadata || "{}");
                        isError = meta.isError;
                        retryPrompt = meta.retryPrompt;
                      } catch {}
                      return (
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            {isError ? (
                              <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                            )}
                            <p className={`text-sm whitespace-pre-wrap break-words ${isError ? "text-red-700 dark:text-red-300" : "text-yellow-800 dark:text-yellow-200"}`}>
                              {msg.content}
                            </p>
                          </div>
                          {isError && retryPrompt && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1.5 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={() => onRetry(retryPrompt)}
                            >
                              <Zap className="h-3 w-3" /> Retry
                            </Button>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <>
                      {/* Z.ai-style agent header */}
                      {msg.role === "assistant" && (
                        <div className="flex items-center gap-2 mb-2">
                          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shrink-0">
                            <Icon className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="text-xs font-semibold text-foreground/80">{agent.name}</span>
                          {(() => {
                            try {
                              const meta = JSON.parse(msg.metadata || "{}");
                              if (meta.agentic) return (
                                <Badge variant="secondary" className="text-[9px] h-4 gap-0.5 px-1.5 bg-gradient-to-r from-purple-500/10 to-blue-500/10 text-purple-600 dark:text-purple-400 border border-purple-200/50 dark:border-purple-800/50">
                                  <Sparkles className="h-2.5 w-2.5" /> Agentic
                                </Badge>
                              );
                            } catch {}
                            return null;
                          })()}
                        </div>
                      )}
                      {/* Z.ai Todo-style agentic steps checklist */}
                      {msg.role === "assistant" && (() => {
                        try {
                          const meta = JSON.parse(msg.metadata || "{}");
                          if (meta.agentic && meta.steps && meta.steps.length > 0) {
                            const isExpanded = expandedMsgSteps.has(msg.id);
                            const hasError = meta.steps.some((s: any) => s.type === 'error');
                            // Deduplicate steps: merge tool_call + tool_result pairs
                            const dedupedSteps: any[] = [];
                            for (const step of meta.steps) {
                              if (step.type === 'thinking' && dedupedSteps.length > 0 && dedupedSteps[dedupedSteps.length - 1].type === 'thinking') {
                                // Skip duplicate thinking steps
                                continue;
                              }
                              dedupedSteps.push(step);
                            }
                            return (
                              <div className="mb-3 rounded-lg border border-border/40 overflow-hidden bg-muted/20 dark:bg-black/10">
                                {/* Todo Header */}
                                <button 
                                  onClick={() => toggleMsgSteps(msg.id)}
                                  className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/40 transition-colors text-left"
                                >
                                  {hasError ? (
                                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                                  ) : (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                  )}
                                  <span className="text-xs font-medium text-foreground/80">
                                    {meta.totalSteps || meta.steps.length} steps
                                  </span>
                                  {meta.usedTools && meta.usedTools.length > 0 && (
                                    <div className="flex items-center gap-1 ml-1 flex-wrap">
                                      {meta.usedTools.slice(0, 5).map((tool: string) => (
                                        <span key={tool} className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono">
                                          {tool}
                                        </span>
                                      ))}
                                      {meta.usedTools.length > 5 && (
                                        <span className="text-[8px] text-muted-foreground">+{meta.usedTools.length - 5}</span>
                                      )}
                                    </div>
                                  )}
                                  <ChevronRight className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                                </button>
                                
                                {/* Todo Checklist with content */}
                                {isExpanded && (
                                  <div className="px-3 pb-2.5 space-y-1 border-t border-border/20">
                                    {dedupedSteps.map((step: any, idx: number) => {
                                      const isThinking = step.type === "thinking";
                                      const isToolCall = step.type === "tool_call";
                                      const isToolResult = step.type === "tool_result";
                                      const isPlan = step.type === "plan";
                                      const isError = step.type === "error";
                                      const isResponse = step.type === "response";
                                      const stepLabel = isThinking ? "Thinking" :
                                                       isToolCall ? (step.toolName || "Tool call") :
                                                       isToolResult ? `${step.toolName || 'Tool'} completed` :
                                                       isPlan ? "Planning" :
                                                       isResponse ? "Response" :
                                                       isError ? "Error" : step.type;
                                      
                                      // Get actual content to show
                                      const stepContent = step.toolResult || step.content || "";
                                      const isCodeContent = stepContent.includes('\n') && stepContent.length > 100;
                                      const isFileContent = isToolResult && (step.toolName === 'read_file' || step.toolName === 'write_file' || step.toolName === 'edit_file');
                                      const isCommandResult = isToolResult && step.toolName === 'run_command';
                                      
                                      return (
                                        <div key={idx} className="py-1.5 group">
                                          <div className="flex items-start gap-2">
                                            {/* Checkbox */}
                                            <div className="mt-0.5 shrink-0">
                                              {isThinking ? (
                                                <div className="h-4 w-4 rounded border-2 border-purple-400 flex items-center justify-center bg-purple-50 dark:bg-purple-900/30">
                                                  <Brain className="h-2.5 w-2.5 text-purple-500" />
                                                </div>
                                              ) : isToolCall ? (
                                                <div className="h-4 w-4 rounded border-2 border-blue-400 flex items-center justify-center bg-blue-50 dark:bg-blue-900/30">
                                                  <Wrench className="h-2.5 w-2.5 text-blue-500" />
                                                </div>
                                              ) : isToolResult ? (
                                                <div className="h-4 w-4 rounded border-2 border-emerald-400 flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/30">
                                                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                                                </div>
                                              ) : isPlan ? (
                                                <div className="h-4 w-4 rounded border-2 border-amber-400 flex items-center justify-center bg-amber-50 dark:bg-amber-900/30">
                                                  <ListChecks className="h-2.5 w-2.5 text-amber-500" />
                                                </div>
                                              ) : isError ? (
                                                <div className="h-4 w-4 rounded border-2 border-red-400 flex items-center justify-center bg-red-50 dark:bg-red-900/30">
                                                  <XCircle className="h-2.5 w-2.5 text-red-500" />
                                                </div>
                                              ) : (
                                                <div className="h-4 w-4 rounded border-2 border-emerald-400 flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/30">
                                                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                                                </div>
                                              )}
                                            </div>
                                            {/* Label */}
                                            <div className="flex-1 min-w-0">
                                              <span className={`text-[11px] font-medium ${isError ? 'text-red-600 dark:text-red-400' : 'text-foreground/70'}`}>
                                                {stepLabel}
                                              </span>
                                            </div>
                                          </div>
                                          
                                          {/* Show actual content for tool results */}
                                          {isToolResult && stepContent && !isResponse && (
                                            <div className="ml-6 mt-1">
                                              {isFileContent ? (
                                                <div className="rounded-md border border-border/30 overflow-hidden bg-black/5 dark:bg-black/20">
                                                                                  <div className="px-2 py-1 text-[8px] font-mono text-muted-foreground/60 bg-muted/30 flex items-center gap-1">
                                                  <FileCode className="h-2.5 w-2.5" />
                                                  {step.toolName === 'read_file' ? 'File contents' : step.toolName === 'write_file' ? 'Written file' : 'Edited file'}
                                                </div>
                                                  <pre className="text-[9px] font-mono text-emerald-700 dark:text-emerald-300 p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all leading-tight">
                                                  {stepContent.substring(0, 1500)}
                                                  {stepContent.length > 1500 && <span className="text-muted-foreground/40">... ({stepContent.length} chars total)</span>}
                                                </pre>
                                                </div>
                                              ) : isCommandResult ? (
                                                <div className="rounded-md border border-border/30 overflow-hidden bg-black/5 dark:bg-black/20">
                                                  <div className="px-2 py-1 text-[8px] font-mono text-muted-foreground/60 bg-muted/30 flex items-center gap-1">
                                                    <Terminal className="h-2.5 w-2.5" />
                                                    Command output
                                                  </div>
                                                  <pre className="text-[9px] font-mono text-foreground/60 p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all leading-tight">
                                                    {stepContent.substring(0, 1500)}
                                                    {stepContent.length > 1500 && <span className="text-muted-foreground/40">... ({stepContent.length} chars total)</span>}
                                                  </pre>
                                                </div>
                                              ) : (
                                                <p className="text-[9px] text-muted-foreground/60 font-mono line-clamp-3 leading-tight">
                                                  {stepContent.substring(0, 300)}
                                                </p>
                                              )}
                                            </div>
                                          )}
                                          
                                          {/* Show tool call args for write/edit_file */}
                                          {isToolCall && (step.toolName === 'write_file' || step.toolName === 'edit_file') && step.toolArgs && (
                                            <div className="ml-6 mt-1">
                                              <div className="rounded-md border border-blue-200/30 dark:border-blue-800/30 overflow-hidden bg-blue-50/30 dark:bg-blue-900/10">
                                                <div className="px-2 py-1 text-[8px] font-mono text-blue-600/60 dark:text-blue-400/60 bg-blue-100/30 dark:bg-blue-900/20 flex items-center gap-1">
                                                  <Code2 className="h-2.5 w-2.5" />
                                                  {step.toolName === 'write_file' ? 'Writing' : 'Editing'}: {step.toolArgs?.path || step.toolArgs?.file_path || ''}
                                                </div>
                                                {step.toolArgs?.content && (
                                                  <pre className="text-[9px] font-mono text-blue-700 dark:text-blue-300 p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all leading-tight">
                                                    {step.toolArgs.content.substring(0, 1500)}
                                                    {step.toolArgs.content.length > 1500 && <span className="text-muted-foreground/40">... ({step.toolArgs.content.length} chars total)</span>}
                                                  </pre>
                                                )}
                                              </div>
                                            </div>
                                          )}
                                          
                                          {/* Show args for other tool calls */}
                                          {isToolCall && step.toolName !== 'write_file' && step.toolName !== 'edit_file' && step.content && (
                                            <p className="ml-6 text-[9px] text-muted-foreground/50 font-mono line-clamp-2 leading-tight mt-0.5">
                                              {step.content.substring(0, 200)}
                                            </p>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          }
                        } catch {}
                        return null;
                      })()}
                      {/* File attachments for user messages */}
                      {msg.role === "user" && (() => {
                        try {
                          const meta = JSON.parse(msg.metadata || "{}");
                          if (meta.attachments && meta.attachments.length > 0) {
                            return (
                              <div className="flex flex-wrap gap-1.5 mb-1.5">
                                {meta.attachments.map((att: { url: string; name?: string; type: string }, idx: number) => (
                                  att.type === "image" ? (
                                    <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer">
                                      <img
                                        src={att.url}
                                        alt={att.name || "Attached image"}
                                        className="max-h-40 rounded-lg border border-primary-foreground/20 cursor-pointer hover:opacity-90 transition-opacity"
                                      />
                                    </a>
                                  ) : (
                                    <a
                                      key={idx}
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs bg-primary-foreground/10 rounded px-2 py-1 hover:bg-primary-foreground/20 transition-colors"
                                    >
                                      <FileCode className="h-3 w-3" />
                                      {att.name || "File"}
                                    </a>
                                  )
                                ))}
                              </div>
                            );
                          }
                        } catch {}
                        return null;
                      })()}
                      <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.content}</div>
                    </>
                  )}
                  {msg.role === "assistant" && (
                    <div className="flex gap-1 mt-2 pt-1.5 border-t border-border/20">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
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
                      {/* Retry button - shows when agent hit step limit or errored */}
                      {(() => {
                        try {
                          const meta = JSON.parse(msg.metadata || "{}");
                          const hitLimit = msg.content?.includes("maximum number of steps");
                          const hasError = meta.steps?.some((s: any) => s.type === 'error');
                          if (hitLimit || hasError) {
                            // Find the user message that preceded this assistant message
                            const msgIdx = messages.findIndex(m => m.id === msg.id);
                            const prevUserMsg = msgIdx > 0 ? messages[msgIdx - 1] : null;
                            const retryPrompt = prevUserMsg?.role === 'user' ? prevUserMsg.content : null;
                            if (retryPrompt) {
                              return (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground hover:text-amber-500"
                                        onClick={() => onRetry(retryPrompt)}
                                      >
                                        <Zap className="h-3 w-3" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Retry</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              );
                            }
                          }
                        } catch {}
                        return null;
                      })()}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-emerald-600"
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
                              className="h-6 w-6 text-muted-foreground hover:text-red-500"
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
                <div className="max-w-[85%] w-full rounded-2xl rounded-bl-md overflow-hidden border border-border/50 bg-card">
                  {/* Agent header */}
                  <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border/30 bg-muted/20">
                    <div className="relative">
                      <div className="h-7 w-7 rounded-md bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping" />
                    </div>
                    <span className="text-sm font-semibold">{agent.name}</span>
                    <Badge variant="secondary" className={`text-[9px] h-4 gap-0.5 px-1.5 animate-pulse ${
                      liveSteps.some(s => s.type === 'resuming')
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/50'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-800/50'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        liveSteps.some(s => s.type === 'resuming') ? 'bg-amber-500' : 'bg-emerald-500'
                      }`} />
                      {liveSteps.some(s => s.type === 'resuming') ? 'Resuming' : 'Working'}
                    </Badge>
                    {liveSteps.length > 0 && (
                      <span className="text-[10px] text-muted-foreground ml-auto font-mono">
                        {liveSteps.filter(s => s.status === 'done').length}/{liveSteps.length}
                      </span>
                    )}
                  </div>
                  
                  {/* Steps - Z.ai Todo-style checklist */}
                  <div className="px-3.5 py-3 space-y-1">
                    {liveSteps.length > 0 ? (
                      liveSteps.map((step, idx) => {
                        const isRunning = step.status === 'running';
                        const isDone = step.status === 'done';
                        const isThinking = step.type === 'thinking';
                        const isToolCall = step.type === 'tool_call';
                        const isResuming = step.type === 'resuming';
                        return (
                          <div key={idx} className="flex items-start gap-2.5 py-0.5">
                            {/* Checkbox icon */}
                            <div className="mt-0.5 shrink-0">
                              {isRunning && isThinking ? (
                                <div className="h-4 w-4 rounded border-2 border-purple-400 flex items-center justify-center bg-purple-50 dark:bg-purple-900/30 animate-pulse">
                                  <Brain className="h-2.5 w-2.5 text-purple-500" />
                                </div>
                              ) : isRunning && isToolCall ? (
                                <div className="h-4 w-4 rounded border-2 border-blue-400 flex items-center justify-center bg-blue-50 dark:bg-blue-900/30 animate-pulse">
                                  <Wrench className="h-2.5 w-2.5 text-blue-500" />
                                </div>
                              ) : isRunning && isResuming ? (
                                <div className="h-4 w-4 rounded border-2 border-amber-400 flex items-center justify-center bg-amber-50 dark:bg-amber-900/30 animate-pulse">
                                  <Loader2 className="h-2.5 w-2.5 text-amber-500 animate-spin" />
                                </div>
                              ) : isRunning ? (
                                <div className="h-4 w-4 rounded border-2 border-yellow-400 flex items-center justify-center bg-yellow-50 dark:bg-yellow-900/30 animate-pulse">
                                  <CircleDot className="h-2.5 w-2.5 text-yellow-500" />
                                </div>
                              ) : isDone ? (
                                <div className="h-4 w-4 rounded border-2 border-emerald-400 flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/30">
                                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                                </div>
                              ) : (
                                <div className="h-4 w-4 rounded border-2 border-red-400 flex items-center justify-center bg-red-50 dark:bg-red-900/30">
                                  <XCircle className="h-2.5 w-2.5 text-red-500" />
                                </div>
                              )}
                            </div>
                            {/* Step text */}
                            <span className={`text-[11px] leading-4 mt-0.5 ${
                              isRunning ? 'text-foreground/80 font-medium' : 
                              isDone ? 'text-foreground/50' : 'text-red-500'
                            }`}>
                              {step.content}
                            </span>
                          </div>
                        );
                      })
                    ) : agentSteps.length > 0 ? (
                      agentSteps.slice(-5).map((step, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 py-0.5">
                          <div className="mt-0.5 shrink-0">
                            <div className="h-4 w-4 rounded border-2 border-emerald-400 flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/30">
                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                            </div>
                          </div>
                          <span className="text-[11px] text-foreground/50 mt-0.5">
                            {step.type === "tool_call" ? `Using ${step.toolName || 'tool'}...` :
                             step.type === "thinking" ? "Thinking..." :
                             step.type === "tool_result" ? `${step.toolName || 'Tool'} completed` :
                             step.content?.substring(0, 60)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center gap-2.5">
                        <div className="h-4 w-4 rounded border-2 border-purple-400 flex items-center justify-center bg-purple-50 dark:bg-purple-900/30 animate-pulse">
                          <Brain className="h-2.5 w-2.5 text-purple-500" />
                        </div>
                        <span className="text-[11px] text-foreground/60 animate-pulse">Thinking...</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Progress bar */}
                  {liveSteps.length > 1 && (
                    <div className="h-0.5 bg-muted">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-500 via-blue-500 to-emerald-500 transition-all duration-500"
                        style={{ width: `${Math.min((liveSteps.filter(s => s.status === 'done').length / Math.max(liveSteps.length, 1)) * 100, 95)}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input Area - or "Chat Ended" banner with Resume option for ended chats */}
      {activeChat?.status === "ENDED" ? (
        <div className="p-3 border-t bg-muted/30 shrink-0">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground flex-wrap">
            <Badge variant="outline" className="text-[9px] h-4">ENDED</Badge>
            <span>This chat has ended.</span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] gap-1 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 border-green-200 dark:border-green-800"
              onClick={() => onResumeChat()}
            >
              <Zap className="h-3 w-3" /> Resume Chat
            </Button>
          </div>
        </div>
      ) : (
      <div className="p-3 border-t bg-card shrink-0">
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
        {/* Upload progress indicator */}
        {uploading && (
          <div className="flex items-center gap-2 mb-2 max-w-3xl mx-auto px-1">
            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-1.5 text-xs text-blue-400 animate-pulse">
              <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              <span>Uploading file{attachedFiles.length > 0 ? `s (${attachedFiles.length} ready)` : ''}...</span>
            </div>
          </div>
        )}
        {/* Attached files preview */}
        {(attachedFiles.length > 0 || uploading) && (
          <div className="flex flex-wrap gap-2 mb-2 max-w-3xl mx-auto">
            {attachedFiles.map((file) => (
              <div key={file.url} className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1 text-xs relative">
                {file.isImage ? (
                  <img src={file.url} alt={file.name} className="h-8 w-8 rounded object-cover" />
                ) : (
                  <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="max-w-[100px] truncate">{file.name}</span>
                {uploading ? (
                  <Loader2Icon className="h-3 w-3 animate-spin text-blue-400 shrink-0" />
                ) : (
                  <button
                    onClick={() => onRemoveAttachment(file.url)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {uploading && (
              <div className="flex items-center gap-1.5 bg-muted/30 rounded-lg px-2 py-1 text-xs text-muted-foreground animate-pulse">
                <Loader2Icon className="h-3 w-3 animate-spin" />
                <span>Processing...</span>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2 max-w-3xl mx-auto">
          {/* File upload button - hidden for SUPPORT agent */}
          {agent.type !== "SUPPORT" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.json,.md,.js,.ts,.tsx,.jsx,.html,.css,.zip"
                onChange={onFileUpload}
                disabled={sending}
              />
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                disabled={uploading || sending}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <PaperclipIcon className="h-4 w-4" />}
              </Button>
            </>
          )}
          <Textarea
            ref={chatInputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={uploading ? "Uploading files... please wait" : sending ? "Agent is working... please wait" : `Message ${agent.name}${agent.type !== "SUPPORT" ? " (attach files with 📎)" : ""}...`}
            className="min-h-[44px] max-h-32 resize-none"
            rows={1}
            disabled={sending || uploading}
          />
          <Button onClick={handleSend} disabled={(!input.trim() && attachedFiles.length === 0) || sending || uploading} className="shrink-0">
            {sending ? <Loader2Icon className="h-4 w-4 animate-spin" /> : uploading ? <Loader2Icon className="h-4 w-4 animate-spin" /> : <SendIcon className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      )}
    </div>
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
  liveSteps,
  agentSteps,
  planSteps,
  expandedSteps,
  setExpandedSteps,
  sending,
}: {
  rightTab: string;
  setRightTab: (tab: "features" | "tasks" | "crossagent" | "live") => void;
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
  liveSteps: Array<{ type: string; content: string; toolName?: string; status: 'running' | 'done' | 'error' }>;
  agentSteps: Array<{ type: string; content: string; toolName?: string; stepNumber: number }>;
  planSteps: Array<{ step: number; title: string; description: string; status: 'completed' | 'running' | 'pending' }>;
  expandedSteps: Set<number>;
  setExpandedSteps: (steps: Set<number>) => void;
  sending: boolean;
}) {
  return (
    <>
      {/* Panel header */}
      <div className="p-3 border-b">
        <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as "features" | "tasks" | "crossagent" | "live")}>
          <TabsList className="w-full h-8">
            <TabsTrigger value="live" className="text-xs flex-1">
              <Terminal className="h-3 w-3 mr-1" /> Live
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-xs flex-1">
              <ListChecks className="h-3 w-3 mr-1" /> Tasks
            </TabsTrigger>
            <TabsTrigger value="features" className="text-xs flex-1">
              <Zap className="h-3 w-3 mr-1" /> Info
            </TabsTrigger>
            <TabsTrigger value="crossagent" className="text-xs flex-1">
              <ArrowRightLeft className="h-3 w-3 mr-1" /> Cross
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1">
        {rightTab === "live" && (
          <LiveTab
            liveSteps={liveSteps}
            agentSteps={agentSteps}
            sending={sending}
            agent={agent}
            Icon={Icon}
            agentConfig={agentConfig}
            expandedSteps={expandedSteps}
            setExpandedSteps={setExpandedSteps}
          />
        )}
        {rightTab === "tasks" && (
          <TasksTab
            tasks={scheduledTasks}
            loading={tasksLoading}
            onNewTask={onNewTask}
            onStatusUpdate={onTaskStatusUpdate}
            onRefresh={onRefreshTasks}
            planSteps={planSteps}
          />
        )}
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
// LIVE TAB (Feature 2: Z.ai-style terminal view)
// ──────────────────────────────────────────────────────────────────
function LiveTab({
  liveSteps,
  agentSteps,
  sending,
  agent,
  Icon,
  agentConfig,
  expandedSteps,
  setExpandedSteps,
}: {
  liveSteps: Array<{ type: string; content: string; toolName?: string; status: 'running' | 'done' | 'error' }>;
  agentSteps: Array<{ type: string; content: string; toolName?: string; stepNumber: number }>;
  sending: boolean;
  agent: AgentData;
  Icon: React.ComponentType<{ className?: string }>;
  agentConfig: { color: string; label: string } | null;
  expandedSteps: Set<number>;
  setExpandedSteps: (steps: Set<number>) => void;
}) {
  const liveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (liveRef.current) {
      liveRef.current.scrollTop = liveRef.current.scrollHeight;
    }
  }, [liveSteps, agentSteps]);

  const allSteps = liveSteps.length > 0 ? liveSteps : agentSteps.map(s => ({
    type: s.type,
    content: s.content,
    toolName: s.toolName,
    status: 'done' as const,
  }));

  const completedSteps = allSteps.filter(s => s.status === 'done').length;
  const totalSteps = allSteps.length;
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {/* Terminal Title Bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-full bg-[#f85149] opacity-80" />
          <div className="h-3 w-3 rounded-full bg-[#d29922] opacity-80" />
          <div className="h-3 w-3 rounded-full bg-[#3fb950] opacity-80" />
        </div>
        <span className="text-[10px] text-[#8b949e] font-mono ml-1">agent — bash</span>
        {sending && (
          <Badge className="text-[8px] h-3.5 px-1.5 bg-[#3fb950]/20 text-[#3fb950] border border-[#3fb950]/30 animate-pulse font-mono">
            ● LIVE
          </Badge>
        )}
        <span className="text-[9px] text-[#484f58] font-mono ml-auto">
          {completedSteps}/{totalSteps}
        </span>
      </div>
      
      {/* Progress bar */}
      {(totalSteps > 0) && (
        <div className="h-0.5 bg-[#21262d]">
          <div 
            className="h-full bg-gradient-to-r from-[#8957e5] via-[#58a6ff] to-[#3fb950] transition-all duration-500"
            style={{ width: `${sending ? Math.min(progressPct, 95) : progressPct}%` }}
          />
        </div>
      )}
      
      {/* Terminal Content */}
      <div ref={liveRef} className="flex-1 overflow-y-auto p-3 font-mono text-[11px] space-y-1 max-h-96" style={{ scrollbarWidth: 'thin', scrollbarColor: '#30363d #0d1117' }}>
        {!sending && allSteps.length === 0 && (
          <div className="text-center py-8">
            <Terminal className="h-8 w-8 mx-auto text-[#30363d] mb-2" />
            <p className="text-[11px] text-[#484f58] font-mono">$ agent --status</p>
            <p className="text-[10px] text-[#484f58] mt-1">No activity yet. Send a message to start.</p>
          </div>
        )}
        {allSteps.map((step, idx) => (
          <div key={idx} className="group">
            {step.status === 'running' ? (
              <div className="flex items-start gap-2 py-0.5">
                <span className="text-[#484f58] shrink-0 w-4 text-right select-none">{idx + 1}</span>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  {step.type === 'thinking' ? (
                    <span className="text-[#d2a8ff] animate-pulse shrink-0">◈</span>
                  ) : step.type === 'tool_call' ? (
                    <span className="text-[#79c0ff] animate-pulse shrink-0">▸</span>
                  ) : step.type === 'tool_result' ? (
                    <span className="text-[#7ee787] shrink-0">✓</span>
                  ) : step.type === 'plan' ? (
                    <span className="text-[#ffa657] animate-pulse shrink-0">◆</span>
                  ) : step.type === 'error' ? (
                    <span className="text-[#f85149] shrink-0">✗</span>
                  ) : (
                    <span className="text-[#8b949e] animate-pulse shrink-0">○</span>
                  )}
                  <span className="text-[#c9d1d9] truncate">
                    {step.type === 'thinking' ? 'Thinking...' :
                     step.type === 'tool_call' ? `Calling ${step.toolName || 'tool'}()` :
                     step.type === 'tool_result' ? `${step.toolName || 'Tool'} → done` :
                     step.type === 'plan' ? 'Planning...' :
                     step.type === 'error' ? 'Error occurred' :
                     step.content?.substring(0, 60)}
                  </span>
                  <span className="text-[#484f58] text-[9px] animate-pulse shrink-0">running</span>
                </div>
              </div>
            ) : step.status === 'done' ? (
              <div>
                <div 
                  className="flex items-start gap-2 py-0.5 cursor-pointer hover:bg-[#161b22] -mx-1 px-1 rounded"
                  onClick={() => {
                    const next = new Set(expandedSteps);
                    if (next.has(idx)) next.delete(idx);
                    else next.add(idx);
                    setExpandedSteps(next);
                  }}
                >
                  <span className="text-[#484f58] shrink-0 w-4 text-right select-none">{idx + 1}</span>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    {step.type === 'thinking' ? (
                      <span className="text-[#d2a8ff] shrink-0">◈</span>
                    ) : step.type === 'tool_call' ? (
                      <span className="text-[#79c0ff] shrink-0">▸</span>
                    ) : step.type === 'tool_result' ? (
                      <span className="text-[#7ee787] shrink-0">✓</span>
                    ) : step.type === 'plan' ? (
                      <span className="text-[#ffa657] shrink-0">◆</span>
                    ) : step.type === 'error' ? (
                      <span className="text-[#f85149] shrink-0">✗</span>
                    ) : (
                      <span className="text-[#8b949e] shrink-0">○</span>
                    )}
                    <span className="text-[#8b949e] truncate">
                      {step.type === 'thinking' ? 'Thinking' :
                       step.type === 'tool_call' ? `${step.toolName || 'tool'}()` :
                       step.type === 'tool_result' ? `${step.toolName || 'Tool'} result` :
                       step.type === 'plan' ? 'Planning' :
                       step.type === 'error' ? 'Error' :
                       step.content?.substring(0, 60)}
                    </span>
                    <ChevronRight className={`h-3 w-3 text-[#484f58] shrink-0 transition-transform ${expandedSteps.has(idx) ? 'rotate-90' : ''}`} />
                  </div>
                </div>
                {expandedSteps.has(idx) && step.content && (
                  <div className="ml-6 mb-1 p-2 rounded bg-[#161b22] border border-[#30363d]">
                    <pre className="text-[10px] text-[#8b949e] whitespace-pre-wrap break-words font-mono line-clamp-8">
                      {step.content.substring(0, 800)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 py-0.5">
                <span className="text-[#484f58] shrink-0 w-4 text-right select-none">{idx + 1}</span>
                <span className="text-[#f85149] shrink-0">✗</span>
                <span className="text-[#f85149]">{step.content?.substring(0, 60)}</span>
              </div>
            )}
          </div>
        ))}
        {sending && allSteps.length === 0 && (
          <div className="flex items-center gap-2 text-[#8b949e]">
            <span className="text-[#3fb950] animate-pulse">▋</span>
            <span className="font-mono">Initializing agent...</span>
          </div>
        )}
        {sending && allSteps.length > 0 && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[#484f58] shrink-0 w-4 text-right select-none font-mono">_</span>
            <span className="text-[#3fb950] animate-pulse font-mono">▋</span>
          </div>
        )}
      </div>
    </div>
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
  planSteps,
}: {
  tasks: ScheduledTask[];
  loading: boolean;
  onNewTask: () => void;
  onStatusUpdate: () => void;
  onRefresh: () => void;
  planSteps: Array<{ step: number; title: string; description: string; status: 'completed' | 'running' | 'pending' }>;
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
      {/* Feature 2: Plan Steps Todo Checklist */}
      {planSteps.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            <ListChecks className="h-3 w-3 inline mr-1" /> Agent Plan Progress
          </h4>
          <div className="space-y-1.5">
            {planSteps.map((step) => (
              <div key={step.step} className={`flex items-start gap-2 p-2 rounded-md border transition-colors ${
                step.status === 'completed' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' :
                step.status === 'running' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' :
                'bg-muted/30 border-border'
              }`}>
                {step.status === 'completed' ? (
                  <CircleCheck className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                ) : step.status === 'running' ? (
                  <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0 mt-0.5" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <span className={`text-xs font-medium ${step.status === 'pending' ? 'text-muted-foreground' : ''}`}>
                    {step.step}. {step.title}
                  </span>
                  {step.description && step.status !== 'pending' && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{step.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feature 5: Execute Now button */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scheduled Tasks</h4>
        <div className="flex gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={async () => {
                  try {
                    const res = await fetch("/api/cron/execute-tasks", { credentials: "include" });
                    if (res.ok) {
                      const data = await res.json();
                      toast.success(`Executed ${data.executed || 0} tasks`);
                      onRefresh();
                    } else {
                      toast.error("Failed to execute tasks");
                    }
                  } catch {
                    toast.error("Failed to execute tasks");
                  }
                }}>
                  <Zap className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Execute Tasks Now</TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
            <Card key={task.id} className={`p-3 ${task.status === "COMPLETED" ? "border-green-200 dark:border-green-800/50 bg-green-50/30 dark:bg-green-900/10" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {task.status === "COMPLETED" && <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />}
                    <h5 className={`text-xs font-medium truncate ${task.status === "COMPLETED" ? "line-through text-green-600 dark:text-green-400" : ""}`}>{task.title}</h5>
                  </div>
                  {task.description && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                  )}
                  {task.user?.name && (
                    <p className="text-[9px] text-muted-foreground mt-0.5">Scheduled by {task.user.name}</p>
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
                    {task.completedAt && (
                      <span className="text-green-600 dark:text-green-400 ml-1">• Completed {new Date(task.completedAt).toLocaleDateString()}</span>
                    )}
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (msgId: string) => {
    setDeletingId(msgId);
    try {
      const res = await fetch(`/api/cross-agent?id=${msgId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast.success("Message deleted");
        onRefresh();
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to delete message");
      }
    } catch {
      toast.error("Failed to delete message");
    } finally {
      setDeletingId(null);
    }
  };

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
              <Card key={msg.id} className="p-2.5 group relative">
                <div className="flex items-start gap-2">
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 ${isIncoming ? "bg-blue-100 dark:bg-blue-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                    {isIncoming ? (
                      <ArrowLeft className="h-2.5 w-2.5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Send className="h-2.5 w-2.5 text-green-600 dark:text-green-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-[10px] font-medium">
                        {isIncoming ? msg.fromAgent?.name : msg.toAgent?.name}
                      </span>
                      <Badge variant="outline" className="text-[8px] h-3 px-1">
                        {msg.type}
                      </Badge>
                      {msg.linkedChatId && (
                        <Badge variant="secondary" className="text-[8px] h-3 px-1 gap-0.5">
                          <Link2 className="h-2 w-2" /> Shared chat context
                        </Badge>
                      )}
                      {msg.shareFullChat && (
                        <Badge className="text-[8px] h-3 px-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          Full context
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{msg.message}</p>
                    <span className="text-[8px] text-muted-foreground mt-0.5 block">
                      {formatRelativeTime(msg.createdAt)}
                    </span>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                          onClick={() => handleDelete(msg.id)}
                          disabled={deletingId === msg.id}
                        >
                          {deletingId === msg.id ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-2.5 w-2.5" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete message</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
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
  allAgents,
  currentAgentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { title: string; description: string; dueDate: string; priority: string; attachments?: any[]; crossAgentAccess?: string[] }) => void;
  allAgents?: AgentData[];
  currentAgentId?: string;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [attachments, setAttachments] = useState<Array<{ name: string; size: number; type: string }>>([]);
  const [crossAgentAccess, setCrossAgentAccess] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const otherAgents = (allAgents || []).filter((a) => a.id !== currentAgentId);

  const handleSubmit = () => {
    if (!title.trim() || !dueDate) {
      toast.error("Title and due date are required");
      return;
    }
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      dueDate,
      priority,
      attachments: attachments.length > 0 ? attachments : undefined,
      crossAgentAccess: crossAgentAccess.length > 0 ? crossAgentAccess : undefined,
    });
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("MEDIUM");
    setAttachments([]);
    setCrossAgentAccess([]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments = Array.from(files).map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleAgentAccess = (agentId: string) => {
    setCrossAgentAccess((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
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

          {/* File Attachments */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5" /> File Attachments
            </Label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Attach Files
            </Button>
            {attachments.length > 0 && (
              <div className="space-y-1">
                {attachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 p-1.5 rounded-md bg-muted text-xs">
                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1 min-w-0">{att.name}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {att.size < 1024 ? `${att.size} B` : att.size < 1048576 ? `${(att.size / 1024).toFixed(1)} KB` : `${(att.size / 1048576).toFixed(1)} MB`}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 shrink-0"
                      onClick={() => removeAttachment(i)}
                    >
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cross-Agent Access */}
          {otherAgents.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> Cross-Agent Access
              </Label>
              <p className="text-[10px] text-muted-foreground">Select agents that can view/execute this task.</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {otherAgents.map((a) => (
                  <label
                    key={a.id}
                    className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={crossAgentAccess.includes(a.id)}
                      onChange={() => toggleAgentAccess(a.id)}
                      className="rounded border-gray-300"
                    />
                    <span>{a.name}</span>
                    <Badge variant="outline" className="text-[8px] h-3 px-1 ml-auto">
                      {a.type}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>
          )}
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
  onSend: (toAgentId: string, message: string, type: string, linkedChatId?: string, shareFullChat?: boolean) => void;
  fromAgentName: string;
}) {
  const [toAgentId, setToAgentId] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("INFO");
  const [linkedChatId, setLinkedChatId] = useState("");
  const [shareFullChat, setShareFullChat] = useState(false);
  const [targetChats, setTargetChats] = useState<Chat[]>([]);
  const [targetChatsLoading, setTargetChatsLoading] = useState(false);

  // Fetch target agent's chats when selected
  const handleAgentChange = async (agentId: string) => {
    setToAgentId(agentId);
    setLinkedChatId("");
    setTargetChats([]);
    if (!agentId) return;
    setTargetChatsLoading(true);
    try {
      const res = await fetch(`/api/chats?agentId=${agentId}&status=ACTIVE`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTargetChats(data as Chat[]);
      }
    } catch (err) {
      console.error("Failed to fetch target agent chats:", err);
    } finally {
      setTargetChatsLoading(false);
    }
  };

  const handleSend = () => {
    if (!toAgentId || !message.trim()) {
      toast.error("Select an agent and type a message");
      return;
    }
    onSend(toAgentId, message.trim(), type, linkedChatId || undefined, linkedChatId ? shareFullChat : undefined);
    setToAgentId("");
    setMessage("");
    setType("INFO");
    setLinkedChatId("");
    setShareFullChat(false);
    setTargetChats([]);
  };

  // Reset state when dialog closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setToAgentId("");
      setMessage("");
      setType("INFO");
      setLinkedChatId("");
      setShareFullChat(false);
      setTargetChats([]);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
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
            <Select value={toAgentId} onValueChange={handleAgentChange}>
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

          {/* Linked Chat from Target Agent */}
          {toAgentId && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" /> Link Chat (Optional)
              </Label>
              <p className="text-[10px] text-muted-foreground">Connect a specific chat from the target agent.</p>
              <Select value={linkedChatId} onValueChange={setLinkedChatId}>
                <SelectTrigger>
                  <SelectValue placeholder={targetChatsLoading ? "Loading chats..." : "Select a chat..."} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {targetChats.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title} ({c._count?.messages || 0} messages)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Share Full Chat Context Toggle */}
          {linkedChatId && linkedChatId !== "none" && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50">
              <div className="space-y-0.5">
                <Label className="text-xs">Share full chat context</Label>
                <p className="text-[10px] text-muted-foreground">
                  The receiving agent will get all messages from the linked chat.
                </p>
              </div>
              <Switch checked={shareFullChat} onCheckedChange={setShareFullChat} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
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
