export type UserRole = "SUPER_ADMIN" | "ADMIN" | "DEVELOPER" | "VIEWER" | "CLIENT";

export type AgentType =
  | "DEV"
  | "CLIENT_HUNTER"
  | "FINANCE"
  | "PROJECT_MANAGER"
  | "HR"
  | "CONTENT"
  | "SUPPORT";

export type AgentStatus = "IDLE" | "RUNNING" | "WAITING_APPROVAL" | "ERROR";

export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "AWAITING_APPROVAL" | "DONE";
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

export type ClientStatus = "ACTIVE" | "INACTIVE" | "ONBOARDING" | "PAUSED" | "COMPLETED" | "CHURNED";
export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE";
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type ApiKeyStatus = "ACTIVE" | "EXHAUSTED" | "ERROR";
export type ApiKeyProvider = "OPENROUTER" | "ZAI" | "GOOGLE_AI" | "NVIDIA" | "OTHER";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_IMPROVEMENT";
export type ApprovalType = "TASK" | "INVOICE" | "EMAIL" | "QUOTATION" | "PROJECT_PLAN" | "CODE_REVIEW" | "LEAD_OUTREACH" | "CONTENT_PIECE" | "CHAT_DELETION";
export type CrossAgentType = "INFO" | "REQUEST" | "RESULT" | "ALERT";

export type NotificationType = "INFO" | "WARNING" | "ERROR" | "SUCCESS" | "TASK" | "APPROVAL" | "AGENT";

export type ChatStatus = "ACTIVE" | "ARCHIVED";

export interface NavItem {
  title: string;
  href: string;
  icon: string;
  roles: UserRole[];
}

export const AGENT_TYPES: Record<AgentType, { label: string; icon: string; color: string; bgColor: string; description: string }> = {
  DEV: {
    label: "Dev Agent",
    icon: "Code2",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    description: "Writes code, builds features, fixes bugs, reviews code, deploys projects in phases",
  },
  CLIENT_HUNTER: {
    label: "Client Hunter",
    icon: "Crosshair",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    description: "Finds clients via web search, generates leads, drafts outreach emails, scores prospects",
  },
  FINANCE: {
    label: "Finance Agent",
    icon: "DollarSign",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
    description: "Estimates project costs, generates invoices & quotations, tracks payments, financial reports",
  },
  PROJECT_MANAGER: {
    label: "Project Manager",
    icon: "ClipboardList",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    description: "Breaks down projects into phases & tasks, assigns work, tracks deadlines, manages approvals",
  },
  HR: {
    label: "HR Agent",
    icon: "Users",
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
    description: "Manages leave, tracks attendance, monitors workload, suggests best-fit employees for tasks",
  },
  CONTENT: {
    label: "Content Agent",
    icon: "PenTool",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
    description: "Writes website copy, social media posts, blog articles, SEO-optimized content",
  },
  SUPPORT: {
    label: "Support Agent",
    icon: "HeadphonesIcon",
    color: "text-teal-500",
    bgColor: "bg-teal-500/10",
    description: "Handles client tickets, answers FAQs, provides technical support, escalates issues",
  },
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

export const TASK_COLUMNS: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "AWAITING_APPROVAL", "DONE"];

// ━━ Department Options ━━
// Single source of truth — imported by API routes and UI components
export const DEPARTMENTS = [
  { value: "MANAGEMENT", label: "Management" },
  { value: "Engineering", label: "Engineering" },
  { value: "Design", label: "Design" },
  { value: "Marketing", label: "Marketing" },
  { value: "Sales", label: "Sales" },
  { value: "Finance", label: "Finance" },
  { value: "Operations", label: "Operations" },
  { value: "DEV", label: "Development" },
  { value: "HR", label: "Human Resources" },
  { value: "CONTENT", label: "Content" },
  { value: "SUPPORT", label: "Support" },
] as const;

/** Flat array of valid department values for API validation */
export const VALID_DEPARTMENT_VALUES: readonly string[] = DEPARTMENTS.map(d => d.value);
