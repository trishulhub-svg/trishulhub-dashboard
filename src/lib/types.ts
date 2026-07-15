export type UserRole = "SUPER_ADMIN" | "ADMIN" | "PROJECT_MANAGER" | "DEVELOPER" | "VIEWER" | "CLIENT";

export type AgentType =
  | "DEV"
  | "CLIENT_HUNTER"
  | "FINANCE"
  | "PROJECT_MANAGER"
  | "HR"
  | "CONTENT"
  | "SUPPORT";

export type AgentStatus = "IDLE" | "RUNNING" | "WAITING_APPROVAL" | "ERROR";

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
/** Invoice lifecycle status: DRAFT→SENT→PAID/OVERDUE */
export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE";
export type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
export type ApiKeyStatus = "ACTIVE" | "EXHAUSTED" | "ERROR";
export type ApiKeyProvider = "OPENROUTER" | "ZAI" | "GOOGLE_AI" | "NVIDIA" | "OTHER";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_IMPROVEMENT";
export type ApprovalType = "TASK" | "INVOICE" | "EMAIL" | "QUOTATION" | "PROJECT_PLAN" | "CODE_REVIEW" | "LEAD_OUTREACH" | "CONTENT_PIECE" | "CHAT_DELETION";
export type CrossAgentType = "INFO" | "REQUEST" | "RESULT" | "ALERT";

export type NotificationType = "INFO" | "WARNING" | "ERROR" | "SUCCESS" | "TASK" | "APPROVAL" | "AGENT";

export type ChatStatus = "ACTIVE" | "ARCHIVED";

/** Deal pipeline stages from lead to close */
export type DealStage = "LEAD" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "CLOSED_WON" | "CLOSED_LOST";

/** Contract lifecycle status */
export type ContractStatus = "DRAFT" | "SENT" | "SIGNED" | "EXPIRED" | "CANCELLED";

/** Subscription lifecycle status */
export type SubscriptionStatus = "ACTIVE" | "STOPPED" | "COMPLETED";

/** Subscription billing frequency */
export type SubscriptionFrequency = "MONTHLY" | "YEARLY" | "ONE_TIME";

/** Expense category for financial tracking */
export type ExpenseCategory = "HOSTING" | "DOMAINS" | "API_COSTS" | "TOOLS" | "MARKETING" | "SALARY" | "SOFTWARE" | "OTHER";

/** Supported currency codes */
export type Currency = "INR" | "USD" | "GBP" | "EUR";

/** Payment method types */
export type PaymentMethod = "UPI" | "CREDIT_DEBIT_CARD" | "BANK_TRANSFER" | "OTHER";

/** Payment status for invoices */
export type PaymentStatus = "PAID" | "UNPAID" | "DUE";

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

// ━━ Department Options ━━
// Keep in sync with Prisma schema User model comment
// Single source of truth — imported by API routes and UI components
export const DEPARTMENTS = [
  { value: "MANAGEMENT", label: "Management" },
  { value: "ENGINEERING", label: "Engineering" },
  { value: "DESIGN", label: "Design" },
  { value: "MARKETING", label: "Marketing" },
  { value: "SALES", label: "Sales" },
  { value: "FINANCE", label: "Finance" },
  { value: "OPERATIONS", label: "Operations" },
  { value: "DEV", label: "Development" },
  { value: "HR", label: "Human Resources" },
  { value: "CONTENT", label: "Content" },
  { value: "SUPPORT", label: "Support" },
] as const;

/** Flat array of valid department values for API validation */
export const VALID_DEPARTMENT_VALUES: readonly string[] = DEPARTMENTS.map(d => d.value);

// === HR Enum Types ===

/** Leave types — single source of truth */
export const VALID_LEAVE_TYPES = [
  "SICK_LEAVE",
  "CASUAL_LEAVE",
  "ANNUAL_LEAVE",
  "PUBLIC_HOLIDAY",
  "MATERNITY_LEAVE",
  "PATERNITY_LEAVE",
  "COMPENSATORY_OFF",
  "HALF_DAY",
  "WORK_FROM_HOME",
  "OTHER",
] as const;
export type LeaveType = (typeof VALID_LEAVE_TYPES)[number];

export type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

/** @deprecated Use LeaveType instead. Legacy leave types from LeaveRequest model. */
export type LegacyLeaveType = "CASUAL" | "SICK" | "PAID";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "LEAVE" | "NO_SCHEDULE";

export type TimeEntryStatus = "ACTIVE" | "COMPLETED";

// I14: Scheduled task types (non-agent)
export type ScheduledTaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE" | "CANCELLED";
export type ScheduledTaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
