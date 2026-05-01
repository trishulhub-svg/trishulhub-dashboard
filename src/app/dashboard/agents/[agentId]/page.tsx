"use client";

import { useEffect, useState, useCallback, useRef, useMemo, startTransition } from "react";
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
  Link2, Unlink, FileUp, Upload, RotateCw,
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
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

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
  todoItems?: string;       // JSON string of TODO items
  isProcessing?: boolean;   // Whether agent is currently processing
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

function truncate(str: string | null | undefined, len: number): string {
  if (!str) return "";
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

// ─── Safe Markdown Renderer ─────────────────────────────────────
// Wraps ReactMarkdown + SyntaxHighlighter in error boundary
// so malformed AI output doesn't crash the entire page
function SafeMarkdown({ content }: { content: string }) {
  try {
    return (
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const codeStr = String(children).replace(/\n$/, "");
            const isInline = !match && !codeStr.includes("\n");
            if (isInline) {
              return <code className="bg-muted px-1.5 py-0.5 rounded text-[12px] font-mono text-purple-600 dark:text-purple-400" {...props}>{children}</code>;
            }
            try {
              return (
                <div className="relative group my-2">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e2e] border border-border/30 border-b-0 rounded-t-lg text-[10px] text-muted-foreground/60">
                    <span>{match ? match[1] : "code"}</span>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        navigator.clipboard.writeText(codeStr);
                        toast.success("Code copied!");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <SyntaxHighlighter
                    style={oneDark}
                    language={match ? match[1] : "typescript"}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      borderRadius: "0 0 0.5rem 0.5rem",
                      fontSize: "12px",
                    }}
                  >
                    {codeStr}
                  </SyntaxHighlighter>
                </div>
              );
            } catch {
              return <pre className="bg-muted p-2 rounded text-xs overflow-auto">{codeStr}</pre>;
            }
          },
        }}
      >
        {content || ""}
      </ReactMarkdown>
    );
  } catch {
    return <pre className="whitespace-pre-wrap text-sm">{content}</pre>;
  }
}

// ─── Main Component ─────────────────────────────────────────────
export default function AgentChatPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const isMobile = useIsMobile();
  const agentId = (params?.agentId as string) || "";

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

  // TODO items for plan-then-execute workflow (Z.ai-style)
  const [todoItems, setTodoItems] = useState<Array<{
    id: string;
    step: number;
    title: string;
    description: string;
    prompt: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    result?: string;
    messageId?: string;
  }>>([]);
  const [activatingStepId, setActivatingStepId] = useState<string | null>(null);
  // Track auto-generated TODO items from live tool calls (not from plan_task)
  const autoTodoCounterRef = useRef(0);
  // Ref to access current todoItems in the stream completion handler
  const todoItemsRef = useRef<typeof todoItems>([]);
  // Keep ref in sync with state
  useEffect(() => { todoItemsRef.current = todoItems; }, [todoItems]);

  // Ref to access current messages without adding them to useEffect dependency arrays
  // This prevents React error #185 (cannot update component while rendering another)
  const messagesRef = useRef<typeof messages>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Ref to access current planSteps inside SSE stream processing (avoids stale closure)
  const planStepsRef = useRef<typeof planSteps>([]);
  useEffect(() => { planStepsRef.current = planSteps; }, [planSteps]);

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
  const directMessageRef = useRef<string | null>(null); // For sending messages programmatically (e.g., TODO activation)
  const activeTodoIdRef = useRef<string | null>(null); // Track which TODO item is being activated

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
    if (!agentId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/agents", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        // Handle API error responses that return objects instead of arrays
        // Also handle cases where data is null/undefined
        const agents = Array.isArray(data) ? data : [];
        const found = agents.find((a) => a && a.id === agentId);
        if (found) {
          // Ensure roleConfig fields are properly initialized to prevent null access errors
          if (!found.roleConfig) {
            found.roleConfig = null;
          }
          setAgent(found);
          setAllAgents(agents);
        } else {
          console.warn("[AgentChat] Agent not found in API response. agentId:", agentId);
        }
      } else {
        console.error("[AgentChat] Failed to fetch agents, status:", res.status);
        try {
          const errData = await res.json();
          console.error("[AgentChat] API error:", errData.error || errData.message);
        } catch {}
      }
    } catch (err: any) {
      console.error("[AgentChat] Failed to fetch agent:", err?.message || err);
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
        setChats(Array.isArray(data) ? data as Chat[] : []);
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
        const msgs = (Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : []) as ChatMessage[];
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
        setScheduledTasks(Array.isArray(data) ? data : []);
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
      setCrossAgentMsgs([...(Array.isArray(inData) ? inData : []), ...(Array.isArray(outData) ? outData : [])].sort(
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

        // BUG FIX: Also check isProcessing flag from chat data
        // If backend set isProcessing=false but there's no new assistant message,
        // it means the agent errored without saving a response
        if (checkCount % 4 === 0) { // Check every 10 seconds (4 * 2.5s)
          try {
            const chatRes = await fetch(`/api/chats?agentId=${agentId}&status=ACTIVE,ENDED`, { credentials: "include" });
            if (chatRes.ok) {
              const chatList = await chatRes.json();
              const chatArray = Array.isArray(chatList) ? chatList : [];
              const currentChat = chatArray.find((c: Chat) => c.id === cId);
              if (currentChat && !currentChat.isProcessing) {
                // Backend says not processing anymore - check if there's a new assistant message
                const assistantMsgs = msgs.filter((m: ChatMessage) => m.role === 'assistant');
                if (assistantMsgs.length > 0 && msgs.length > knownMsgCount) {
                  // Found the response - proceed with completion
                } else {
                  // Backend finished but no new assistant message - agent errored
                  setSending(false);
                  setTimeout(() => {
                    setIsAgentic(false);
                    setLiveSteps([]);
                  }, 300);
                  markProcessingEnd(cId);
                  if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                  }
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: `info-${Date.now()}`,
                      chatId: cId,
                      role: "system",
                      content: "Agent processing has ended but no response was saved. The agent may have encountered an error. Please try again.",
                      createdAt: new Date().toISOString(),
                    },
                  ]);
                  fetchChats();
                  return;
                }
              }
            }
          } catch {}
        }

        // Check if there's a new assistant message since we started processing
        const assistantMsgs = msgs.filter((m: ChatMessage) => m.role === 'assistant');
        if (assistantMsgs.length > 0 && msgs.length > knownMsgCount) {
          // Mark last live step as done before clearing
          setLiveSteps((prev) => {
            if (prev.length > 0) {
              const updated = [...prev];
              updated[updated.length - 1] = { ...updated[updated.length - 1], status: 'done' };
              return updated;
            }
            return prev;
          });
          // Agent has responded - update messages and stop animation
          setSending(false);
          // Delay clearing animation state so message renders first
          setTimeout(() => {
            setIsAgentic(false);
            setLiveSteps([]);
          }, 300);
          markProcessingEnd(cId);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          // Restore todoItems from the last assistant message
          // and infer status from conversation history
          const lastAssistantMsg = [...msgs].reverse().find(m => m.role === 'assistant');
          if (lastAssistantMsg?.metadata) {
            try {
              const meta = JSON.parse(lastAssistantMsg.metadata);
              // Check for plan_task-based todoItems first, then auto-generated autoTodoItems
              const items = meta.todoItems || meta.autoTodoItems;
              if (items && items.length > 0) {
                const executedSteps = new Set<number>();
                for (const msg of msgs) {
                  if (msg.role === 'user') {
                    const match = msg.content.match(/^\[Executing Plan Step (\d+):/);
                    if (match) executedSteps.add(parseInt(match[1]));
                  }
                }
                const restoredItems = items.map((item: any) => ({
                  ...item,
                  status: executedSteps.has(item.step) ? 'completed' as const : item.status,
                  result: executedSteps.has(item.step) ? 'Step executed' : item.result,
                }));
                setTodoItems(restoredItems);
              }
            } catch {}
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
  // FIX: Wrap cascading setState calls inside startTransition to prevent React error #185.
  // This effect calls setActiveChatId() + setTodoItems() in response to `chats` changing,
  // which can conflict with renders already in progress from the chats update.
  useEffect(() => {
    // After chats are loaded, check if any chat has active processing
    if (chats.length === 0 || !agentId) return;

    for (const chat of chats) {
      const info = getProcessingInfo(chat.id);
      if (info) {
        // Found an active processing chat - first fetch messages to see if agent already finished
        startTransition(() => { setActiveChatId(chat.id); });
        fetchMessages(chat.id).then((loadedMsgs) => {
          // Check if there's already an assistant response newer than our start time
          const assistantMsgs = loadedMsgs.filter((m: ChatMessage) => m.role === 'assistant');
          if (assistantMsgs.length > 0 && loadedMsgs.length > info.lastMessageCount) {
            // Agent already finished while we were away - no need to animate
            markProcessingEnd(chat.id);
            // Restore todoItems from the last assistant message with status inference
            const lastAssistantMsg = [...loadedMsgs].reverse().find(m => m.role === 'assistant');
            if (lastAssistantMsg?.metadata) {
              try {
                const meta = JSON.parse(lastAssistantMsg.metadata);
                // Check for plan_task-based todoItems first, then auto-generated autoTodoItems
                const items = meta.todoItems || meta.autoTodoItems;
                if (items && items.length > 0) {
                  const executedSteps = new Set<number>();
                  for (const msg of loadedMsgs) {
                    if (msg.role === 'user') {
                      const match = msg.content.match(/^\[Executing Plan Step (\d+):/);
                      if (match) executedSteps.add(parseInt(match[1]));
                    }
                  }
                  const restoredItems = items.map((item: any) => ({
                    ...item,
                    status: executedSteps.has(item.step) ? 'completed' as const : item.status,
                    result: executedSteps.has(item.step) ? 'Step executed' : item.result,
                  }));
                  startTransition(() => { setTodoItems(restoredItems); });
                }
              } catch {}
            }
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

  // ── Poll for task completion notifications ──
  const shownNotifIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!agentId) return;
    const pollNotifications = async () => {
      try {
        const res = await fetch("/api/notifications?unread=true", { credentials: "include" });
        if (res.ok) {
          const notifications = await res.json();
          const notifArray = Array.isArray(notifications) ? notifications : [];
          const taskNotifs = notifArray.filter(
            (n: any) => n.type === "SUCCESS" && n.metadata && (() => {
              try { const meta = JSON.parse(n.metadata || "{}"); return meta.taskId; } catch { return false; }
            })()
          );
          for (const notif of taskNotifs) {
            if (!shownNotifIdsRef.current.has(notif.id)) {
              shownNotifIdsRef.current.add(notif.id);
              toast.success(notif.message, { duration: 5000 });
              // Mark as read
              fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ id: notif.id, isRead: true }),
              }).catch(() => {});
            }
          }
          // If any new task completion notifications found, refresh the tasks list
          if (taskNotifs.length > 0) {
            fetchTasks();
          }
        }
      } catch {
        // Silently ignore polling errors
      }
    };
    // Initial poll
    pollNotifications();
    const interval = setInterval(pollNotifications, 30000);
    return () => clearInterval(interval);
  }, [agentId, fetchTasks]);

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
    // Clear existing todoItems when switching chats
    setTodoItems([]);
    autoTodoCounterRef.current = 0;

    // Find the chat object to check persistent todoItems and isProcessing
    const chatData = chats.find(c => c.id === chatId);

    // Restore TODO items from the Chat model's todoItems field (persists across navigation)
    if (chatData?.todoItems) {
      try {
        const items = JSON.parse(chatData.todoItems);
        if (items && items.length > 0) {
          setTodoItems(items);
        }
      } catch {}
    }

    // Check if chat is still processing (agent working)
    if (chatData?.isProcessing) {
      setIsAgentic(true);
      setSending(true);
      setLiveSteps([{ type: 'resuming', content: 'Agent is still working...', status: 'running' }]);
      startPollingForCompletion(chatId, 0);
    }

    fetchMessages(chatId).then((loadedMsgs) => {
      // After loading messages, check if this chat has active processing (sessionStorage fallback)
      const procInfo = getProcessingInfo(chatId);
      if (procInfo && !chatData?.isProcessing) {
        startPollingForCompletion(chatId, procInfo.lastMessageCount);
      }
      // Only restore from message metadata if chat.todoItems didn't have data
      if ((!chatData?.todoItems || JSON.parse(chatData.todoItems || '[]').length === 0) && loadedMsgs && loadedMsgs.length > 0) {
        const lastAssistantMsg = [...loadedMsgs].reverse().find(m => m.role === 'assistant');
        if (lastAssistantMsg?.metadata) {
          try {
            const meta = JSON.parse(lastAssistantMsg.metadata);
            // Check for plan_task-based todoItems first, then auto-generated autoTodoItems
            const items = meta.todoItems || meta.autoTodoItems;
            if (items && items.length > 0) {
              // Infer completed steps from conversation: check for user messages
              // that start with "[Executing Plan Step X:"
              const executedSteps = new Set<number>();
              for (const msg of loadedMsgs) {
                if (msg.role === 'user') {
                  const match = msg.content.match(/^\[Executing Plan Step (\d+):/);
                  if (match) {
                    executedSteps.add(parseInt(match[1]));
                  }
                }
              }
              // Update TODO items status based on executed steps
              const restoredItems = items.map((item: any) => ({
                ...item,
                status: executedSteps.has(item.step) ? 'completed' as const : item.status,
                result: executedSteps.has(item.step) ? 'Step executed' : item.result,
              }));
              setTodoItems(restoredItems);
            }
          } catch {}
        }
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
    // Check for direct message override (used by TODO activation)
    const directMsg = directMessageRef.current;
    const userContent = directMsg || (input.trim() || (attachedFiles.length > 0 ? "Please analyze the attached file(s)." : ""));
    directMessageRef.current = null;

    // Allow sending with just text, just attachments, or both
    if ((!userContent.trim() && attachedFiles.length === 0) || sending || uploading) return;

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
      // Reset auto-todo counter for new message
      autoTodoCounterRef.current = 0;
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
      // Also mark in DB for persistence across navigation
      fetch("/api/chats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: resolvedChatId, isProcessing: true }),
      }).catch(() => {});
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
        const collectedSteps: Array<{ type: string; content: string; toolName?: string; toolArgs?: any; toolResult?: string; stepNumber: number }> = [];
        let collectedTodoItems: Array<{ id: string; step: number; title: string; description: string; prompt: string; status: 'pending' | 'running' | 'completed' | 'failed'; result?: string }> = [];

        // BUG FIX: Add stream read timeout to prevent "still working" forever
        // If the backend takes too long or the connection drops, we need to detect it
        const STREAM_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max
        let lastActivityTime = Date.now();

        while (true) {
          // BUG FIX: Check for stream timeout
          if (Date.now() - lastActivityTime > STREAM_TIMEOUT_MS) {
            console.warn('[agent-chat] Stream timeout after 5 minutes');
            break;
          }

          // BUG FIX: Use Promise.race with timeout for reader.read()
          let readResult: { done: boolean; value: Uint8Array | undefined };
          try {
            readResult = await Promise.race([
              reader.read(),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Stream read timeout')), 120000) // 120s per chunk
              ),
            ]);
          } catch (readErr: any) {
            // Stream read timed out or failed - break out and check backend
            console.warn('[agent-chat] Stream read error:', readErr.message);
            break;
          }

          const { done, value } = readResult;
          if (done) break;
          lastActivityTime = Date.now();

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
                // BUG FIX: Preserve toolArgs for code display (was being lost)
                collectedSteps.push({
                  ...step,
                  toolArgs: step.toolArgs || undefined,
                  toolResult: step.toolResult || undefined,
                });

                // FIX: Batch all SSE state updates inside startTransition to prevent
                // React error #185 (cannot update a component while rendering a different component).
                // Without batching, each setState triggers an immediate re-render, and when
                // multiple setStates fire in rapid succession during SSE streaming, React can
                // detect a component being updated while another is mid-render.
                startTransition(() => {
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

                  // Update plan step status as tools execute
                  if (step.type === "tool_result" && planStepsRef.current.length > 0) {
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
                });

                // ── Auto-generate TODO items from live tool calls ──
                // When the agent uses tools like write_file, edit_file, etc., auto-create
                // TODO items so the user sees a progress list in real-time at the bottom
                const CODE_TOOLS = ['write_file', 'edit_file', 'read_file', 'list_files', 'run_command', 'git_commit_push', 'git_status', 'git_diff', 'git_create_branch', 'analyze_code', 'web_search'];

                if (step.type === "tool_call" && step.toolName && CODE_TOOLS.includes(step.toolName)) {
                  // Only auto-generate if we don't already have plan_task-based TODOs
                  if (collectedTodoItems.length === 0) {
                    autoTodoCounterRef.current += 1;
                    const todoStep = autoTodoCounterRef.current;
                    let title = '';
                    let description = '';
                    const args = step.toolArgs || {};

                    // Generate human-readable title from tool call
                    switch (step.toolName) {
                      case 'write_file':
                        title = `Write ${args.path || 'file'}`;
                        description = args.description || `Creating ${args.path || 'file'}`;
                        break;
                      case 'edit_file':
                        title = `Edit ${args.path || 'file'}`;
                        description = args.description || `Editing ${args.path || 'file'}`;
                        break;
                      case 'read_file':
                        title = `Read ${args.path || 'file'}`;
                        description = args.purpose || `Reading ${args.path || 'file'}`;
                        break;
                      case 'list_files':
                        title = `List ${args.path || 'project'}`;
                        description = 'Exploring project structure';
                        break;
                      case 'run_command':
                        title = `Run: ${(args.command || '').substring(0, 40)}`;
                        description = args.purpose || 'Executing command';
                        break;
                      case 'git_commit_push':
                        title = `Git push`;
                        description = args.message || 'Committing and pushing changes';
                        break;
                      case 'git_status':
                        title = `Git status`;
                        description = 'Checking repository status';
                        break;
                      case 'git_diff':
                        title = `Git diff`;
                        description = 'Reviewing changes';
                        break;
                      case 'git_create_branch':
                        title = `Branch: ${args.name || 'new'}`;
                        description = 'Creating new branch';
                        break;
                      case 'analyze_code':
                        title = `Analyze ${args.path || 'code'}`;
                        description = `Focus: ${args.focus || 'all'}`;
                        break;
                      case 'web_search':
                        title = `Search: ${(args.query || '').substring(0, 30)}`;
                        description = args.purpose || 'Searching the web';
                        break;
                      default:
                        title = step.toolName;
                        description = step.content || '';
                    }

                    // BUG FIX: Auto-generated TODO items need a prompt field for re-execution
                    // Store the tool call details as the prompt
                    let autoPrompt = '';
                    switch (step.toolName) {
                      case 'write_file':
                        autoPrompt = `Write file ${args.path || 'unknown'} with the specified content`;
                        break;
                      case 'edit_file':
                        autoPrompt = `Edit file ${args.path || 'unknown'}: ${args.description || 'Apply changes'}`;
                        break;
                      case 'read_file':
                        autoPrompt = `Read file ${args.path || 'unknown'}`;
                        break;
                      case 'list_files':
                        autoPrompt = `List files in ${args.path || 'project'}`;
                        break;
                      case 'run_command':
                        autoPrompt = `Run command: ${args.command || ''}`;
                        break;
                      case 'git_commit_push':
                        autoPrompt = `Git commit and push: ${args.message || ''}`;
                        break;
                      default:
                        autoPrompt = `${step.toolName}: ${title}`;
                    }

                    const newTodo = {
                      id: `auto-todo-${Date.now()}-${todoStep}`,
                      step: todoStep,
                      title,
                      description,
                      prompt: autoPrompt,
                      status: 'running' as const,
                    };
                    // FIX: Wrap in startTransition to prevent React error #185
                    startTransition(() => { setTodoItems(prev => [...prev, newTodo]); });
                  }
                }

                if (step.type === "tool_result" && step.toolName && CODE_TOOLS.includes(step.toolName)) {
                  // Only update auto-generated TODOs if we don't have plan_task-based TODOs
                  if (collectedTodoItems.length === 0) {
                    const success = step.content && !step.content.includes('failed');
                    // FIX: Wrap in startTransition to prevent React error #185
                    startTransition(() => {
                      setTodoItems(prev => {
                        // Find the last running item and mark it completed/failed
                        const lastRunningIdx = [...prev].reverse().findIndex(t => t.status === 'running');
                        if (lastRunningIdx >= 0) {
                          const actualIdx = prev.length - 1 - lastRunningIdx;
                          const updated = [...prev];
                          updated[actualIdx] = {
                            ...updated[actualIdx],
                            status: success ? 'completed' as const : 'failed' as const,
                            result: step.content?.substring(0, 200),
                          };
                          return updated;
                        }
                        return prev;
                      });
                    });
                  }
                }
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

        // Process remaining buffer content (Bug 2: SSE buffer not fully processed)
        if (buffer.trim()) {
          const remainingLines = buffer.split("\n");
          for (const line of remainingLines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const event = JSON.parse(data);
              if (event.type === "complete") {
                finalData = event;
              } else if (event.type === "step") {
                const step = event.step;
                collectedSteps.push(step);

                // FIX: Batch all SSE state updates inside startTransition (same as main loop)
                startTransition(() => {
                  setAgentSteps([...collectedSteps]);

                  // Check for plan_task steps
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

                  // Parse plan_task tool_result to extract TODO items
                  if (step.type === "tool_result" && step.toolName === "plan_task") {
                    try {
                      const resultStr = step.toolResult || step.content || "";
                      const planData = JSON.parse(resultStr);
                      if (planData.requiresActivation && planData.steps && planData.steps.length > 0) {
                        const newTodos = planData.steps.map((s: any) => ({
                          id: s.id || `todo-${Date.now()}-${s.step}`,
                          step: s.step,
                          title: s.title,
                          description: s.description || "",
                          prompt: s.prompt || s.description || "",
                          status: 'pending' as const,
                        }));
                        collectedTodoItems = newTodos;
                        setTodoItems(newTodos);
                      }
                    } catch {
                      try {
                        const resultStr = step.toolResult || step.content || "";
                        const stepsMatch = resultStr.match(/"steps":\s*\[([\s\S]*?)\]/);
                        if (stepsMatch) {
                          const stepsData = JSON.parse(`[${stepsMatch[1]}]`);
                          if (stepsData.length > 0 && stepsData[0].prompt) {
                            const newTodos = stepsData.map((s: any, idx: number) => ({
                              id: s.id || `todo-${Date.now()}-${idx}`,
                              step: s.step || idx + 1,
                              title: s.title || `Step ${idx + 1}`,
                              description: s.description || "",
                              prompt: s.prompt || s.description || "",
                              status: 'pending' as const,
                            }));
                            collectedTodoItems = newTodos;
                            setTodoItems(newTodos);
                          }
                        }
                      } catch {}
                    }
                  }

                  // Update live steps with status
                  setLiveSteps((prev) => {
                    const updated = [...prev];
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
                });

                // ── Auto-generate TODO items from live tool calls (buffer drain) ──
                const CODE_TOOLS_BUF = ['write_file', 'edit_file', 'read_file', 'list_files', 'run_command', 'git_commit_push', 'git_status', 'git_diff', 'git_create_branch', 'analyze_code', 'web_search'];
                if (step.type === "tool_call" && step.toolName && CODE_TOOLS_BUF.includes(step.toolName) && collectedTodoItems.length === 0) {
                  autoTodoCounterRef.current += 1;
                  const todoStep = autoTodoCounterRef.current;
                  const args = step.toolArgs || {};
                  let title = step.toolName;
                  let description = '';
                  switch (step.toolName) {
                    case 'write_file': title = `Write ${args.path || 'file'}`; description = args.description || ''; break;
                    case 'edit_file': title = `Edit ${args.path || 'file'}`; description = args.description || ''; break;
                    case 'read_file': title = `Read ${args.path || 'file'}`; description = args.purpose || ''; break;
                    case 'list_files': title = `List ${args.path || 'project'}`; description = 'Exploring project'; break;
                    case 'run_command': title = `Run: ${(args.command || '').substring(0, 40)}`; description = args.purpose || ''; break;
                    case 'git_commit_push': title = `Git push`; description = args.message || ''; break;
                    default: description = step.content || '';
                  }
                  const bufPrompt = step.toolName === 'write_file' ? `Write file ${args.path || 'unknown'}` :
                    step.toolName === 'edit_file' ? `Edit file ${args.path || 'unknown'}` :
                    step.toolName === 'run_command' ? `Run: ${args.command || ''}` :
                    `${step.toolName}: ${title}`;
                  // FIX: Wrap in startTransition to prevent React error #185
                  startTransition(() => {
                    setTodoItems(prev => [...prev, { id: `auto-todo-${Date.now()}-${todoStep}`, step: todoStep, title, description, prompt: bufPrompt, status: 'running' as const }]);
                  });
                }
                if (step.type === "tool_result" && step.toolName && CODE_TOOLS_BUF.includes(step.toolName) && collectedTodoItems.length === 0) {
                  const success = step.content && !step.content.includes('failed');
                  // FIX: Wrap in startTransition to prevent React error #185
                  startTransition(() => {
                    setTodoItems(prev => {
                      const lastRunningIdx = [...prev].reverse().findIndex(t => t.status === 'running');
                      if (lastRunningIdx >= 0) {
                        const actualIdx = prev.length - 1 - lastRunningIdx;
                        const updated = [...prev];
                        updated[actualIdx] = { ...updated[actualIdx], status: success ? 'completed' as const : 'failed' as const, result: step.content?.substring(0, 200) };
                        return updated;
                      }
                      return prev;
                    });
                  });
                }
              } else if (event.type === "error") {
                toast.error(event.message || "Agent execution error", { duration: 6000 });
              }
            } catch {}
          }
        }

        // BUG FIX: When SSE stream ends without finalData (stream broke/timeout),
        // check the backend for a completed assistant message before showing error.
        // The backend agent loop may have completed successfully even though the SSE
        // stream was interrupted.
        if (!finalData && resolvedChatId) {
          try {
            // Wait a moment for backend to finish saving if it's still running
            await new Promise(r => setTimeout(r, 2000));
            const checkRes = await fetch(`/api/chats/messages?chatId=${resolvedChatId}`, { credentials: "include" });
            if (checkRes.ok) {
              const checkData = await checkRes.json();
              const dbMsgs = (checkData.messages || checkData) as ChatMessage[];
              // Find an assistant message that wasn't in our original message list
              const existingIds = new Set(messages.map(m => m.id));
              const newAssistantMsg = [...dbMsgs].reverse().find(
                (m: ChatMessage) => m.role === 'assistant' && !existingIds.has(m.id)
              );
              if (newAssistantMsg) {
                // Backend completed and saved the message - use it as finalData
                finalData = { content: newAssistantMsg.content, chatId: resolvedChatId, messageId: newAssistantMsg.id };
                // Also update messages from DB
                setMessages(dbMsgs);
                // Restore TODO items from message metadata
                if (newAssistantMsg.metadata) {
                  try {
                    const meta = JSON.parse(newAssistantMsg.metadata);
                    const items = meta.todoItems || meta.autoTodoItems;
                    if (items && items.length > 0) {
                      setTodoItems(items);
                    }
                  } catch {}
                }
              }
            }
          } catch {
            // Check failed - continue with error handling below
          }
        }

        // If still no finalData after backend check, start polling instead of showing error immediately
        if (!finalData && resolvedChatId) {
          // Start polling for the response - the backend may still be processing
          startPollingForCompletion(resolvedChatId, messages.length + 1);
          setSending(false);
          // Don't show error - the polling will handle it
        } else if (!finalData) {
          // No chatId either - show error only as last resort
          setMessages((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              chatId: activeChatId || "",
              role: "system",
              content: "Agent response stream was interrupted and no chat was created. Please try again.",
              createdAt: new Date().toISOString(),
              metadata: JSON.stringify({ isError: true, retryPrompt: userContent }),
            },
          ]);
          setLastFailedPrompt(userContent);
          setFailedMsgId(tempUserMsg.id);
        }

        if (finalData) {
          if (finalData.steps) setAgentSteps(finalData.steps);

          // BUG FIX: Include collectedSteps with full toolArgs/toolResult in metadata
          // so the Code Changes section can show actual code
          const stepsForMeta = finalData.steps || collectedSteps;
          // Merge toolArgs from collected steps into the steps for metadata
          const enrichedSteps = stepsForMeta.map((s: any, idx: number) => {
            const collected = collectedSteps[idx];
            if (collected && s.type === 'tool_call' && !s.toolArgs && collected.toolArgs) {
              return { ...s, toolArgs: collected.toolArgs };
            }
            return s;
          });

          const assistantMsg: ChatMessage = {
            id: finalData.messageId || `temp-assistant-${Date.now()}`,
            chatId: finalData.chatId || activeChatId || "",
            role: "assistant",
            content: finalData.content || "No response",
            metadata: JSON.stringify({
              agentic: finalData.agentic,
              totalSteps: finalData.totalSteps,
              usedTools: finalData.usedTools,
              steps: enrichedSteps,
              thinkingPreview: finalData.thinkingPreview,
              // Include both plan_task-based and auto-generated TODO items
              todoItems: collectedTodoItems.length > 0 ? collectedTodoItems : undefined,
              autoTodoItems: collectedTodoItems.length === 0 ? todoItemsRef.current : undefined,
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
      // Delay clearing animation state so message renders first
      setTimeout(() => {
        setIsAgentic(false);
        setLiveSteps([]);
      }, 300);
      // Clear processing marker from sessionStorage
      if (resolvedChatId) {
        markProcessingEnd(resolvedChatId);
        // Also clear isProcessing in the DB
        fetch("/api/chats", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: resolvedChatId, isProcessing: false }),
        }).catch(() => {});
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
  }, [input, sending, uploading, attachedFiles, agentId, activeChatId, fetchChats, agent?.type, features?.agentic, planSteps, markProcessingStart, markProcessingEnd, todoItems]);

  // ── Retry failed prompt ──
  const handleRetry = useCallback((prompt: string) => {
    // Remove the error message from chat
    setMessages((prev) => prev.filter((m) => {
      try {
        const meta = JSON.parse(m.metadata || "{}");
        return !meta.isError;
      } catch { return true; }
    }));
    setLastFailedPrompt(null);
    setFailedMsgId(null);
    // Auto-send the retry prompt directly instead of just filling the input
    directMessageRef.current = prompt;
    setInput(""); // Clear input
    // Trigger send after a tick to let state settle
    setTimeout(() => {
      handleSend();
    }, 50);
  }, [handleSend]);

  // ── Activate a TODO plan step ──
  const handleActivateTodo = useCallback(async (item: typeof todoItems[0]) => {
    if (sending || item.status === 'running' || item.status === 'completed') return;

    // Update the item status to running
    const itemId = item.id;
    setTodoItems(prev => prev.map(t => t.id === itemId ? { ...t, status: 'running' as const } : t));
    setActivatingStepId(itemId);
    activeTodoIdRef.current = itemId;

    const prefixedPrompt = `[Executing Plan Step ${item.step}: ${item.title}] ${item.prompt}`;

    // Set the direct message ref and trigger handleSend
    directMessageRef.current = prefixedPrompt;

    let success = false;
    try {
      await handleSend();
      // If handleSend completed without throwing, mark as completed
      success = true;
    } catch {
      // On error, mark the item as failed
      setTodoItems(prev => prev.map(t => t.id === itemId ? { ...t, status: 'failed' as const, result: 'Failed to execute step' } : t));
    } finally {
      if (success && activeTodoIdRef.current === itemId) {
        setTodoItems(prev => prev.map(t => t.id === itemId ? { ...t, status: 'completed' as const, result: 'Step completed successfully' } : t));
      }
      setActivatingStepId(null);
      activeTodoIdRef.current = null;
    }
  }, [sending, todoItems, handleSend]);

  // ── Cancel waiting for agent response ──
  const handleCancelWaiting = useCallback(() => {
    setSending(false);
    setIsAgentic(false);
    setLiveSteps([]);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (activeChatId) {
      markProcessingEnd(activeChatId);
      fetch("/api/chats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: activeChatId, isProcessing: false }),
      }).catch(() => {});
      // Reload messages from DB in case the response was saved
      fetchMessages(activeChatId);
    }
    toast.info("Stopped waiting. Check chat history for any saved response.");
  }, [activeChatId, markProcessingEnd, fetchMessages]);

  // ── Auto-save TODO items to DB when they change ──
  // FIX: Removed `messages` from dependency array and use messagesRef instead.
  // Previously, `messages` was in deps + setMessages() was called inside = circular re-render = React error #185.
  // Also added debounce (500ms) to prevent rapid-fire updates during SSE streaming.
  useEffect(() => {
    if (todoItems.length === 0 || !activeChatId) return;

    // Debounce: wait 500ms before saving to avoid rapid-fire DB writes during streaming
    const timer = setTimeout(() => {
      // Save TODO items to Chat model (persists across navigation)
      fetch("/api/chats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: activeChatId, todoItems, isProcessing: todoItems.some(t => t.status === 'running') }),
      }).catch(() => {});

      // Also save to message metadata (legacy support)
      // FIX: Use messagesRef.current instead of messages (from closure/dependency)
      const planMsg = [...messagesRef.current].reverse().find(m => {
        if (m.role !== 'assistant') return false;
        try {
          const meta = JSON.parse(m.metadata || "{}");
          return (meta.todoItems && meta.todoItems.length > 0) || (meta.autoTodoItems && meta.autoTodoItems.length > 0);
        } catch { return false; }
      });
      if (!planMsg) return;
      try {
        const meta = JSON.parse(planMsg.metadata || "{}");
        const isAutoGenerated = !todoItems.some(t => t.prompt && t.prompt.length > 0);
        const updatedMeta = isAutoGenerated
          ? { ...meta, autoTodoItems: todoItems }
          : { ...meta, todoItems };
        fetch("/api/chats/messages", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ messageId: planMsg.id, metadata: updatedMeta }),
        }).catch(() => {});
        // FIX: Wrap setMessages in startTransition to avoid triggering React error #185
        startTransition(() => {
          setMessages(prev => prev.map(m => m.id === planMsg.id ? { ...m, metadata: JSON.stringify(updatedMeta) } : m));
        });
      } catch {}
    }, 500);

    return () => clearTimeout(timer);
  }, [todoItems, activeChatId]); // FIX: `messages` removed from deps

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
          setTodoItems([]);
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
            setTodoItems([]);
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
              todoItems={todoItems}
              onActivateTodo={handleActivateTodo}
              onCancelWaiting={handleCancelWaiting}
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
          todoItems={todoItems}
          onActivateTodo={handleActivateTodo}
          onCancelWaiting={handleCancelWaiting}
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
                    <div className="relative">
                      <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      {chat.isProcessing && (
                        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                        </span>
                      )}
                    </div>
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
                            {truncate(chat.messages[0]?.content, 30)}
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
  todoItems,
  onActivateTodo,
  onCancelWaiting,
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
  todoItems: Array<{ id: string; step: number; title: string; description: string; prompt: string; status: 'pending' | 'running' | 'completed' | 'failed'; result?: string }>;
  onActivateTodo: (item: typeof todoItems[0]) => void;
  onCancelWaiting: () => void;
}) {
  const [expandedMsgSteps, setExpandedMsgSteps] = useState<Set<string>>(new Set());
  const [todoExpanded, setTodoExpanded] = useState(true);

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
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    onClick={() => onRetry(retryPrompt)}
                                  >
                                    <RotateCw className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Retry</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
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
                          if (meta.agentic && Array.isArray(meta.steps) && meta.steps.length > 0) {
                            // BUG FIX: Auto-expand steps that contain code (write_file/edit_file)
                            const hasCodeSteps = meta.steps.some((s: any) => 
                              s.type === 'tool_call' && (s.toolName === 'write_file' || s.toolName === 'edit_file')
                            );
                            const isExpanded = expandedMsgSteps.has(msg.id) || hasCodeSteps;
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
                                  {Array.isArray(meta.usedTools) && meta.usedTools.length > 0 && (
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
                                                  <div className="relative">
                                                    {(() => {
                                                      try {
                                                        const p = step.toolArgs?.path || step.toolArgs?.file_path || '';
                                                        const ext = p.split('.').pop() || '';
                                                        const langMap: Record<string, string> = {
                                                          ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
                                                          py: "python", css: "css", html: "html", json: "json",
                                                          sh: "bash", sql: "sql", md: "markdown",
                                                        };
                                                        const lang = langMap[ext] || ext || "typescript";
                                                        const codeContent = step.toolArgs.content.length > 5000
                                                          ? step.toolArgs.content.substring(0, 5000) + `\n... (${step.toolArgs.content.length - 5000} more characters)`
                                                          : step.toolArgs.content;
                                                        return (
                                                          <SyntaxHighlighter
                                                            style={oneDark}
                                                            language={lang}
                                                            PreTag="div"
                                                            customStyle={{
                                                              margin: 0,
                                                              borderRadius: 0,
                                                              fontSize: "9px",
                                                              maxHeight: "200px",
                                                              overflow: "auto",
                                                            }}
                                                          >
                                                            {codeContent}
                                                          </SyntaxHighlighter>
                                                        );
                                                      } catch {
                                                        return <pre className="text-[9px] font-mono p-2 overflow-auto max-h-48">{step.toolArgs.content?.substring(0, 2000)}</pre>;
                                                      }
                                                    })()}
                                                  </div>
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
                      {/* ── CODE CHANGES: Prominent code output section (always visible) ── */}
                      {msg.role === "assistant" && (() => {
                        try {
                          const meta = JSON.parse(msg.metadata || "{}");
                          if (!meta.agentic || !Array.isArray(meta.steps)) return null;
                          // Extract all write_file and edit_file tool results
                          const codeSteps = meta.steps.filter((s: any) =>
                            s.type === 'tool_result' && (s.toolName === 'write_file' || s.toolName === 'edit_file')
                          );
                          const codeCallSteps = meta.steps.filter((s: any) =>
                            s.type === 'tool_call' && (s.toolName === 'write_file' || s.toolName === 'edit_file')
                          );
                          if (codeSteps.length === 0 && codeCallSteps.length === 0) return null;

                          // BUG FIX: Build file map from tool_calls (which have toolArgs.content = actual code)
                          // NOT from tool_results (which just say "File written successfully")
                          const fileMap: Record<string, { action: string; codeContent: string; resultContent: string; path: string; language: string }> = {};
                          // First pass: collect actual code from tool_call steps
                          for (let i = 0; i < codeCallSteps.length; i++) {
                            const call = codeCallSteps[i];
                            const p = call.toolArgs?.path || call.toolArgs?.file_path || `file-${i}`;
                            if (!fileMap[p]) {
                              // Detect language from file extension
                              const ext = p.split('.').pop() || '';
                              const langMap: Record<string, string> = {
                                ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
                                py: "python", css: "css", html: "html", json: "json", php: "php",
                                sql: "sql", sh: "bash", rb: "ruby", go: "go", rs: "rust",
                                java: "java", scss: "scss", yaml: "yaml", yml: "yaml", md: "markdown",
                              };
                              fileMap[p] = {
                                action: call.toolName === 'write_file' ? 'Created' : 'Edited',
                                codeContent: call.toolArgs?.content || '', // ACTUAL CODE from toolArgs
                                resultContent: '',
                                path: p,
                                language: langMap[ext] || ext,
                              };
                            } else {
                              // Update with more recent code (in case of multiple writes to same file)
                              if (call.toolArgs?.content) {
                                fileMap[p].codeContent = call.toolArgs.content;
                              }
                            }
                          }
                          // Second pass: add result info (success/failure messages)
                          for (const result of codeSteps) {
                            const resultText = result.toolResult || result.content || '';
                            // Find the matching call by index (tool_results come in same order as tool_calls)
                            const resultIdx = codeSteps.indexOf(result);
                            if (resultIdx < codeCallSteps.length) {
                              const matchCall = codeCallSteps[resultIdx];
                              const p = matchCall?.toolArgs?.path || matchCall?.toolArgs?.file_path || '';
                              if (p && fileMap[p]) {
                                fileMap[p].resultContent = resultText;
                              }
                            }
                          }

                          const files = Object.values(fileMap).filter(f => f.path && f.path !== 'unknown');
                          if (files.length === 0) return null;

                          return (
                            <div className="mb-3 rounded-lg border border-emerald-200/40 dark:border-emerald-800/30 overflow-hidden bg-gradient-to-b from-emerald-50/50 to-green-50/30 dark:from-emerald-950/20 dark:to-green-950/10">
                              <div className="px-3 py-2 flex items-center gap-2 bg-emerald-100/30 dark:bg-emerald-900/20">
                                <Code2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Code Generated</span>
                                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-emerald-100/60 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                                  {files.length} file{files.length !== 1 ? 's' : ''}
                                </Badge>
                              </div>
                              <div className="px-3 py-2 space-y-2">
                                {files.map((file, idx) => (
                                  <div key={idx} className="rounded-md border border-border/30 overflow-hidden bg-black/5 dark:bg-black/20">
                                    <div className="px-2 py-1.5 text-[10px] font-mono text-muted-foreground bg-muted/40 flex items-center gap-1.5">
                                      <FileCode className="h-3 w-3 text-emerald-500" />
                                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{file.path}</span>
                                      <Badge variant="outline" className="text-[8px] h-3.5 px-1 ml-1">{file.action}</Badge>
                                    </div>
                                    {/* BUG FIX: Show actual code from toolArgs.content, not tool result message */}
                                    {file.codeContent ? (
                                      <div className="relative">
                                        <button
                                          className="absolute top-1 right-1 z-10 h-5 w-5 flex items-center justify-center rounded bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                          onClick={() => {
                                            navigator.clipboard.writeText(file.codeContent);
                                            toast.success("Code copied!");
                                          }}
                                        >
                                          <Copy className="h-2.5 w-2.5" />
                                        </button>
                                        {(() => {
                                          try {
                                            const codeContent = file.codeContent.length > 5000
                                              ? file.codeContent.substring(0, 5000) + `\n... (${file.codeContent.length - 5000} more characters)`
                                              : file.codeContent;
                                            return (
                                              <SyntaxHighlighter
                                                style={oneDark}
                                                language={file.language || "typescript"}
                                                PreTag="div"
                                                customStyle={{
                                                  margin: 0,
                                                  borderRadius: 0,
                                                  fontSize: "10px",
                                                  maxHeight: "300px",
                                                  overflow: "auto",
                                                }}
                                              >
                                                {codeContent}
                                              </SyntaxHighlighter>
                                            );
                                          } catch {
                                            return <pre className="text-[9px] font-mono p-2 overflow-auto max-h-64">{file.codeContent?.substring(0, 5000)}</pre>;
                                          }
                                        })()}
                                      </div>
                                    ) : file.resultContent ? (
                                      <pre className="text-[9px] font-mono text-emerald-700 dark:text-emerald-300 p-2 overflow-x-auto max-h-48 whitespace-pre-wrap break-all leading-tight">
                                        {file.resultContent.substring(0, 2000)}
                                        {file.resultContent.length > 2000 && <span className="text-muted-foreground/40">... ({file.resultContent.length} chars total)</span>}
                                      </pre>
                                    ) : (
                                      <p className="text-[9px] text-muted-foreground/50 p-2">No code content available</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        } catch {}
                        return null;
                      })()}
                      {/* Z.ai-style TODO list for plan-then-execute workflow */}
                      {msg.role === "assistant" && (() => {
                        try {
                          const meta = JSON.parse(msg.metadata || "{}");
                          // Get todoItems either from state (current message) or from metadata (historical)
                          const isLastAssistantMsg = messages.indexOf(msg) === messages.length - 1;
                          const items = (isLastAssistantMsg && todoItems.length > 0) ? todoItems : (Array.isArray(meta.todoItems) ? meta.todoItems : Array.isArray(meta.autoTodoItems) ? meta.autoTodoItems : []);
                          if (!items || items.length === 0) return null;

                          const completedCount = items.filter((t: any) => t.status === 'completed').length;
                          const totalCount = items.length;
                          const hasRunning = items.some((t: any) => t.status === 'running');
                          const allCompleted = completedCount === totalCount;

                          return (
                            <div className="mb-3 rounded-lg border border-emerald-200/40 dark:border-emerald-800/30 overflow-hidden bg-gradient-to-b from-emerald-50/50 to-green-50/30 dark:from-emerald-950/20 dark:to-green-950/10">
                              {/* TODO Header */}
                              <button
                                onClick={() => setTodoExpanded(!todoExpanded)}
                                className="flex items-center gap-2 w-full px-3 py-2 hover:bg-emerald-100/30 dark:hover:bg-emerald-900/20 transition-colors text-left"
                              >
                                {allCompleted ? (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                ) : hasRunning ? (
                                  <Loader2 className="h-4 w-4 text-emerald-500 shrink-0 animate-spin" />
                                ) : (
                                  <ListChecks className="h-4 w-4 text-emerald-500 shrink-0" />
                                )}
                                <span className="text-xs font-semibold text-foreground/80">Plan</span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {completedCount}/{totalCount}
                                </span>
                                {/* Progress bar */}
                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden ml-1 mr-2 max-w-[80px]">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`,
                                      background: 'linear-gradient(90deg, #10b981, #059669)',
                                    }}
                                  />
                                </div>
                                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${todoExpanded ? "rotate-90" : ""}`} />
                                {/* Run All button - icon only like z.ai */}
                                {!allCompleted && !hasRunning && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-5 w-5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 shrink-0 ml-1"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const firstPending = items.find((t: any) => t.status === 'pending');
                                            if (firstPending) onActivateTodo(firstPending);
                                          }}
                                          disabled={sending}
                                        >
                                          <Zap className="h-3 w-3" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Run Next Step</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </button>

                              {/* TODO Items */}
                              {todoExpanded && (
                                <div className="px-3 pb-2.5 space-y-1 border-t border-emerald-200/30 dark:border-emerald-800/20">
                                  {items.map((item: any) => {
                                    const isPending = item.status === 'pending';
                                    const isRunning = item.status === 'running';
                                    const isCompleted = item.status === 'completed';
                                    const isFailed = item.status === 'failed';

                                    return (
                                      <div key={item.id || item.step} className="py-1.5 group">
                                        <div className="flex items-start gap-2">
                                          {/* Status icon */}
                                          <div className="mt-0.5 shrink-0">
                                            {isPending ? (
                                              <div className="h-4 w-4 rounded border-2 border-emerald-300 flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/30">
                                                <Circle className="h-2 w-2 text-emerald-400" />
                                              </div>
                                            ) : isRunning ? (
                                              <div className="h-4 w-4 rounded border-2 border-emerald-400 flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/30 animate-pulse">
                                                <Loader2 className="h-2.5 w-2.5 text-emerald-500 animate-spin" />
                                              </div>
                                            ) : isCompleted ? (
                                              <div className="h-4 w-4 rounded border-2 border-emerald-400 flex items-center justify-center bg-emerald-50 dark:bg-emerald-900/30">
                                                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                                              </div>
                                            ) : (
                                              <div className="h-4 w-4 rounded border-2 border-red-400 flex items-center justify-center bg-red-50 dark:bg-red-900/30">
                                                <XCircle className="h-2.5 w-2.5 text-red-500" />
                                              </div>
                                            )}
                                          </div>
                                          {/* Content */}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                              <span className={`text-[10px] font-mono text-muted-foreground/60`}>
                                                {item.step}.
                                              </span>
                                              <span className={`text-[11px] font-medium ${
                                                isCompleted ? 'text-foreground/50 line-through' :
                                                isFailed ? 'text-red-600 dark:text-red-400' :
                                                isRunning ? 'text-foreground/90' :
                                                'text-foreground/70'
                                              }`}>
                                                {item.title}
                                              </span>
                                            </div>
                                            {item.description && (
                                              <p className={`text-[9px] mt-0.5 leading-tight ${
                                                isCompleted ? 'text-muted-foreground/40' : 'text-muted-foreground/60'
                                              }`}>
                                                {item.description}
                                              </p>
                                            )}
                                            {/* Result summary for completed items */}
                                            {isCompleted && item.result && (
                                              <p className="text-[9px] text-emerald-600/60 dark:text-emerald-400/50 mt-0.5 leading-tight">
                                                ✓ {item.result}
                                              </p>
                                            )}
                                            {/* Error info for failed items */}
                                            {isFailed && item.result && (
                                              <p className="text-[9px] text-red-500/70 mt-0.5 leading-tight">
                                                ✗ {item.result}
                                              </p>
                                            )}
                                          </div>
                                          {/* Activate button - always visible for pending items */}
                                          {isPending && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 text-[9px] px-2 gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 shrink-0"
                                              onClick={() => onActivateTodo(item)}
                                              disabled={sending}
                                            >
                                              <Zap className="h-2.5 w-2.5" />
                                              Run Step
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        } catch {}
                        return null;
                      })()}
                      {/* File attachments for user messages */}
                      {msg.role === "user" && (() => {
                        try {
                          const meta = JSON.parse(msg.metadata || "{}");
                          if (Array.isArray(meta.attachments) && meta.attachments.length > 0) {
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
                      <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none [&_pre]:bg-[#1e1e2e] [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border/30 [&_pre]:p-3 [&_code]:text-[12px] [&_code]:font-mono [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ol]:mb-2 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_blockquote]:border-l-2 [&_blockquote]:border-purple-400 [&_blockquote]:pl-3 [&_blockquote]:italic">
                        <SafeMarkdown content={msg.content || ""} />
                      </div>
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
                                        className="h-6 w-6 text-muted-foreground hover:text-emerald-500"
                                        onClick={() => onRetry(retryPrompt)}
                                      >
                                        <RotateCw className="h-3 w-3" />
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
                  {/* BUG FIX: Cancel button - let users stop waiting if agent is stuck */}
                  <div className="px-3.5 pb-2 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 w-full"
                      onClick={() => {
                        onCancelWaiting();
                      }}
                    >
                      <X className="h-3 w-3" /> Stop Waiting
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input Area - or "Chat Ended" banner with Resume option for ended chats */}
      {/* z.ai-style TODO panel at chat bottom - vertical list with progress bar */}
      {todoItems.length > 0 && (
        <div className="border-t border-border/50 bg-card/95 backdrop-blur-sm shrink-0">
          <div className="px-3 py-2">
            {/* Header: Plan label + progress bar + Run Next */}
            <div className="flex items-center gap-2 mb-1.5">
              {todoItems.every(t => t.status === 'completed') ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              ) : todoItems.some(t => t.status === 'running') ? (
                <Loader2 className="h-3.5 w-3.5 text-emerald-500 animate-spin shrink-0" />
              ) : (
                <ListChecks className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              )}
              <span className="text-[11px] font-semibold text-foreground/80">
                {todoItems.some(t => t.prompt && t.prompt.length > 0) ? 'Plan' : 'Progress'}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
                {todoItems.filter(t => t.status === 'completed').length}/{todoItems.length}
              </span>
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 bg-emerald-500"
                  style={{
                    width: `${(todoItems.filter(t => t.status === 'completed').length / todoItems.length) * 100}%`,
                  }}
                />
              </div>
              {/* Run Next button - icon only like z.ai */}
              {todoItems.some(t => t.prompt && t.prompt.length > 0) && activeChat?.status !== "ENDED" && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 shrink-0"
                        onClick={() => {
                          const firstPending = todoItems.find(t => t.status === 'pending');
                          if (firstPending) onActivateTodo(firstPending);
                        }}
                        disabled={sending || !todoItems.some(t => t.status === 'pending')}
                      >
                        <Zap className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{todoItems.some(t => t.status === 'running') ? 'Running...' : 'Run Next Step'}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            {/* z.ai-style vertical TODO list - compact rows */}
            <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
              {todoItems.map((item) => {
                const isPending = item.status === 'pending';
                const isRunning = item.status === 'running';
                const isCompleted = item.status === 'completed';
                const isFailed = item.status === 'failed';
                const hasPrompt = item.prompt && item.prompt.length > 0;
                return (
                  <button
                    key={item.id || item.step}
                    onClick={() => isPending && hasPrompt && !sending ? onActivateTodo(item) : undefined}
                    className={`flex items-center gap-2 w-full px-2 py-1 rounded-md text-[11px] font-medium transition-all text-left ${
                      isCompleted ? 'text-emerald-600 dark:text-emerald-400 line-through' :
                      isRunning ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/20' :
                      isFailed ? 'text-red-600 dark:text-red-400' :
                      hasPrompt ? 'text-foreground/70 hover:bg-muted/50 cursor-pointer' :
                      'text-muted-foreground'
                    }`}
                    disabled={sending || !isPending || !hasPrompt}
                  >
                    {isCompleted ? <CheckCircle2 className="h-3 w-3 shrink-0" /> :
                     isRunning ? <Loader2 className="h-3 w-3 animate-spin shrink-0" /> :
                     isFailed ? <XCircle className="h-3 w-3 shrink-0" /> :
                     <Circle className="h-3 w-3 shrink-0 text-muted-foreground/50" />}
                    <span className="truncate">{item.step}. {item.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
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
  const [executingTaskId, setExecutingTaskId] = useState<string | null>(null);

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

  const handleExecuteNow = async (taskId: string) => {
    setExecutingTaskId(taskId);
    try {
      const res = await fetch(`/api/cron/execute-tasks?taskId=${taskId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          toast.success(`Task executed successfully!`);
        } else {
          toast.error(data.error || "Task execution failed");
        }
        onRefresh();
        onStatusUpdate();
      } else {
        toast.error("Failed to execute task");
      }
    } catch {
      toast.error("Failed to execute task");
    } finally {
      setExecutingTaskId(null);
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
                    {new Date(task.dueDate).toLocaleString()}
                    {task.completedAt && (
                      <span className="text-green-600 dark:text-green-400 ml-1">• Completed {new Date(task.completedAt).toLocaleString()}</span>
                    )}
                  </div>
                  {task.status === "PENDING" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 text-[9px] text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 mt-1 px-1.5"
                      disabled={executingTaskId === task.id}
                      onClick={() => handleExecuteNow(task.id)}
                    >
                      {executingTaskId === task.id ? (
                        <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />
                      ) : (
                        <Zap className="h-2.5 w-2.5 mr-0.5" />
                      )}
                      {executingTaskId === task.id ? "Executing..." : "Execute Now"}
                    </Button>
                  )}
                  {task.status === "IN_PROGRESS" && executingTaskId === task.id && (
                    <div className="flex items-center gap-1 mt-1 text-[9px] text-amber-600">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      Executing...
                    </div>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    {task.status === "PENDING" && (
                      <>
                        <DropdownMenuItem onClick={() => handleExecuteNow(task.id)} disabled={executingTaskId === task.id}>
                          <Zap className="h-3 w-3 mr-2" /> Execute Now
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleUpdateStatus(task.id, "IN_PROGRESS")}>
                          Start Task
                        </DropdownMenuItem>
                      </>
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
  const [githubRepo, setGithubRepo] = useState((agent.roleConfig as any)?.githubRepo || '');
  const [githubToken, setGithubToken] = useState((agent.roleConfig as any)?.githubToken || '');
  const [autoPushEnabled, setAutoPushEnabled] = useState((agent.roleConfig as any)?.autoPushEnabled || false);
  const [activeTab, setActiveTab] = useState<'general' | 'github'>('general');

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
        githubRepo,
        githubToken,
        autoPushEnabled,
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
        <Separator />
        {/* GitHub Integration */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            <Label className="text-sm font-medium">GitHub Integration</Label>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Repository URL</Label>
              <Input
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Access Token</Label>
              <Input
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
                className="text-xs h-8"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Auto-push Changes</Label>
                <p className="text-[10px] text-muted-foreground">Automatically push agent outputs to the repo</p>
              </div>
              <Switch
                checked={autoPushEnabled}
                onCheckedChange={setAutoPushEnabled}
              />
            </div>
          </div>
        </div>
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
  const [dueTime, setDueTime] = useState("09:00");
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
    // Combine date + time into ISO string
    const combinedDueDate = dueTime ? `${dueDate}T${dueTime}:00` : dueDate;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      dueDate: combinedDueDate,
      priority,
      attachments: attachments.length > 0 ? attachments : undefined,
      crossAgentAccess: crossAgentAccess.length > 0 ? crossAgentAccess : undefined,
    });
    setTitle("");
    setDescription("");
    setDueDate("");
    setDueTime("09:00");
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
            <Label>Due Date & Time *</Label>
            <div className="flex gap-2">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="flex-1" />
              <Input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="w-28" />
            </div>
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
        setTargetChats(Array.isArray(data) ? data : []);
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
