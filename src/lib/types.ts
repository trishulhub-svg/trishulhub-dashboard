export type UserRole = "SUPER_ADMIN" | "ADMIN" | "PROJECT_MANAGER" | "DEVELOPER" | "VIEWER" | "CLIENT";

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

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_IMPROVEMENT";
export type ApprovalType = "TASK" | "INVOICE" | "EMAIL" | "QUOTATION" | "PROJECT_PLAN" | "CODE_REVIEW" | "LEAD_OUTREACH" | "CONTENT_PIECE" | "EXPENSE_APPROVAL";

export type NotificationType = "INFO" | "WARNING" | "ERROR" | "SUCCESS" | "TASK" | "APPROVAL" | "AGENT";

/** Deal pipeline stages from lead to close */
export type DealStage = "LEAD" | "QUALIFIED" | "PROPOSAL" | "NEGOTIATION" | "CLOSED_WON" | "CLOSED_LOST";

/** Contract lifecycle status */

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

/** @deprecated Use LeaveType instead. Legacy short leave type labels from the UI. */
export type LegacyLeaveType = "CASUAL" | "SICK" | "PAID";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "HALF_DAY" | "LEAVE" | "NO_SCHEDULE";

export type TimeEntryStatus = "ACTIVE" | "COMPLETED";
