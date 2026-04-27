export type UserRole = "SUPER_ADMIN" | "ADMIN" | "DEVELOPER" | "CLIENT";

export type AgentType =
  | "DEV"
  | "CLIENT_HUNTER"
  | "FINANCE"
  | "PROJECT_MANAGER"
  | "HR"
  | "CONTENT"
  | "SUPPORT";

export type AgentStatus = "IDLE" | "RUNNING" | "WAITING_APPROVAL" | "ERROR";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type ProjectStatus =
  | "PLANNING"
  | "IN_PROGRESS"
  | "REVIEW"
  | "APPROVAL"
  | "DEPLOYED"
  | "COMPLETED";

export type LeadStatus =
  | "NEW"
  | "CONTACTED"
  | "INTERESTED"
  | "PROPOSAL"
  | "NEGOTIATING"
  | "WON"
  | "LOST";

export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE";
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type ApiKeyStatus = "ACTIVE" | "EXHAUSTED" | "ERROR";
export type ApiKeyProvider = "OPENROUTER" | "ZAI" | "OTHER";

export interface NavItem {
  title: string;
  href: string;
  icon: string;
  roles: UserRole[];
}

export const AGENT_TYPES: Record<AgentType, { label: string; icon: string; color: string }> = {
  DEV: { label: "Dev Agent", icon: "Code2", color: "text-blue-500" },
  CLIENT_HUNTER: { label: "Client Hunter", icon: "Crosshair", color: "text-green-500" },
  FINANCE: { label: "Finance Agent", icon: "DollarSign", color: "text-yellow-500" },
  PROJECT_MANAGER: { label: "Project Manager", icon: "ClipboardList", color: "text-purple-500" },
  HR: { label: "HR Agent", icon: "Users", color: "text-pink-500" },
  CONTENT: { label: "Content Agent", icon: "PenTool", color: "text-orange-500" },
  SUPPORT: { label: "Support Agent", icon: "HeadphonesIcon", color: "text-teal-500" },
};

export const STATUS_COLORS: Record<AgentStatus, string> = {
  IDLE: "bg-gray-400",
  RUNNING: "bg-green-500",
  WAITING_APPROVAL: "bg-yellow-500",
  ERROR: "bg-red-500",
};

export const LEAD_COLUMNS: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "PROPOSAL",
  "NEGOTIATING",
  "WON",
  "LOST",
];

export const TASK_COLUMNS: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];
