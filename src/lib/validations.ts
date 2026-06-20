import { z } from "zod"
import { VALID_LEAVE_TYPES, type LeaveType } from "@/lib/types"

// ━━ Project Member Schema ━━
export const createProjectMemberSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  projectId: z.string().min(1, "Project ID is required"),
  role: z.enum(["MEMBER", "LEAD"]).default("MEMBER"),
})

// ━━ Project Credential Schema ━━
export const createCredentialSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  username: z.string().min(1, "Username is required").max(500),
  password: z.string().min(1, "Password is required").max(1000),
  projectId: z.string().min(1, "Project ID is required"),
})

// ━━ Project Schemas ━━
export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200),
  description: z.string().max(2000).optional(),
  // Allow "No Client" projects — accept empty string ("") and null in addition
  // to a real client ID. The API POST handler normalizes "" / undefined to null.
  clientId: z.string().optional().or(z.literal("")).nullable(),
  status: z.enum(["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  isDemo: z.boolean().optional(),
  deadline: z.string().optional(),
  startDate: z.string().optional(),
  budget: z.number().min(0).optional().nullable(),
  websites: z.array(z.object({
    url: z.string().min(1, "URL is required").max(500),
    label: z.string().max(100).nullable().optional(),
    isPrimary: z.boolean().optional(),
  })).optional(),
})

export const updateProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  isDemo: z.boolean().optional(),
  deadline: z.string().optional(),
  budget: z.number().min(0).optional().nullable(),
})

// ━━ Clients ━━
export const createClientSchema = z.object({
  name: z.string().min(1, "Client name is required").max(200),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  company: z.string().optional(),
  website: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ONBOARDING", "PAUSED", "COMPLETED", "CHURNED"]).optional(),
  userId: z.string().optional(),
  notes: z.string().optional(),
  projectType: z.string().max(100).optional(),
  projectMethodId: z.string().max(100).optional(),
  projectStartDate: z.string().optional().refine((val) => { if (!val) return true; return !isNaN(Date.parse(val)); }, { message: "projectStartDate must be a valid date" }),
  deliveryDate: z.string().optional().refine((val) => { if (!val) return true; return !isNaN(Date.parse(val)); }, { message: "deliveryDate must be a valid date" }),
  websites: z.array(z.object({
    url: z.string().min(1, "URL is required").max(500).refine(val => /^https?:\/\/.+\..+/.test(val), { message: "URL must start with http:// or https://" }),
    label: z.string().max(100).nullable().optional(),
    isPrimary: z.boolean().optional(),
  })).optional(),
  mediatorName: z.string().max(200).nullable().optional(),
  mediatorPhone: z.string().max(50).nullable().optional(),
  mediatorEmail: z.string().email("Valid mediator email is required").max(200).nullable().optional(),
  createdAt: z.string()
    .optional()
    .refine((val) => {
      if (!val) return true
      const parsed = Date.parse(val)
      return !isNaN(parsed)
    }, { message: "createdAt must be a valid date string" })
    .refine((val) => {
      if (!val) return true
      return Date.parse(val) <= Date.now()
    }, { message: "createdAt must not be in the future" })
    .refine((val) => {
      if (!val) return true
      return Date.parse(val) >= Date.parse('2020-01-01')
    }, { message: "createdAt must be after 2020-01-01" }),
})

// Named helper for update schema "at least one field" validation
const hasAtLeastOneField = (data: Record<string, unknown>) => Object.values(data).some(v => v !== undefined)

export const updateClientSchema = z.object({
  id: z.string().min(1, "Client ID is required"),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email("Valid email is required").nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ONBOARDING", "PAUSED", "COMPLETED", "CHURNED"]).nullable().optional(),
  userId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  projectType: z.string().max(100).nullable().optional(),
  projectMethodId: z.string().max(100).nullable().optional(),
  projectStartDate: z.string().nullable().optional().refine((val) => { if (!val) return true; return !isNaN(Date.parse(val)); }, { message: "projectStartDate must be a valid date string" }),
  deliveryDate: z.string().nullable().optional().refine((val) => { if (!val) return true; return !isNaN(Date.parse(val)); }, { message: "deliveryDate must be a valid date string" }),
  websites: z.array(z.object({
    url: z.string().min(1, "URL is required").max(500).refine(val => /^https?:\/\/.+\..+/.test(val), { message: "URL must start with http:// or https://" }),
    label: z.string().max(100).nullable().optional(),
    isPrimary: z.boolean().optional(),
  })).nullable().optional(),
  mediatorName: z.string().max(200).nullable().optional(),
  mediatorPhone: z.string().max(50).nullable().optional(),
  mediatorEmail: z.string().email("Valid mediator email is required").max(200).nullable().optional(),
}).refine(hasAtLeastOneField, { message: "At least one field must be provided" })

// ━━ Invoices ━━
export const createInvoiceSchema = z.object({
  clientId: z.string().min(1),
  projectId: z.string().optional(),
  items: z.union([
    z.string(),
    z.array(z.object({
      description: z.string(),
      quantity: z.number().min(1),
      rate: z.number().min(0),
    }))
  ]).optional(),
  subtotal: z.number().min(0).max(99_999_999).finite().optional().describe("Subtotal before tax"),
  tax: z.number().min(0).max(99_999_999).finite().optional(),
  total: z.number().min(0).max(99_999_999).finite().optional().describe("Total including tax"),
  status: z.enum(["DRAFT", "SENT", "PAID", "OVERDUE"]).optional(),
  dueDate: z.string().optional(),
  paymentMethod: z.enum(["UPI", "CREDIT_DEBIT_CARD", "BANK_TRANSFER", "OTHER"]).nullable().optional(),
  gst: z.number().min(0).max(99_999_999).finite().optional(),
  gstPercent: z.number().min(0).max(100).optional(),
  notes: z.string().max(5000).nullable().optional(),
  paymentStatus: z.enum(["PAID", "UNPAID", "DUE"]).optional(),
  invoiceNumber: z.string().max(50).optional(),
  // Note: If not provided, backend auto-generates one. Optional is correct here.
})
.refine((data) => {
  const sub = data.subtotal ?? 0;
  const tax = data.tax ?? 0;
  const gst = data.gst ?? 0;
  if (data.total !== undefined) {
    return Math.abs(data.total - sub - tax - gst) < 0.01;
  }
  return true; // total not provided — backend will compute it
}, { message: "total must equal subtotal + tax + gst" })

export const updateInvoiceSchema = z.object({
  id: z.string().min(1),
  invoiceNumber: z.string().max(50).optional(),
  clientId: z.string().optional(),
  projectId: z.string().nullable().optional(),
  items: z.union([z.string(), z.array(z.object({ description: z.string(), quantity: z.number().min(1), rate: z.number().min(0) }))]).optional(),
  subtotal: z.number().min(0).max(99_999_999).finite().optional().describe("Subtotal before tax"),
  tax: z.number().min(0).max(99_999_999).finite().optional(),
  total: z.number().min(0).max(99_999_999).finite().optional().describe("Total including tax"),
  status: z.enum(["DRAFT", "SENT", "PAID", "OVERDUE"]).optional(),
  dueDate: z.string().nullable().optional(),
  paidAt: z.string().nullable().optional(),
  paymentMethod: z.enum(["UPI", "CREDIT_DEBIT_CARD", "BANK_TRANSFER", "OTHER"]).nullable().optional(),
  gst: z.number().min(0).max(99_999_999).finite().optional(),
  gstPercent: z.number().min(0).max(100).optional(),
  notes: z.string().max(5000).nullable().optional(),
  paymentStatus: z.enum(["PAID", "UNPAID", "DUE"]).optional(),
  sentById: z.string().max(100).nullable().optional(),
})
.refine(hasAtLeastOneField, { message: "At least one field must be provided" })
.refine((data) => {
  const sub = data.subtotal ?? 0;
  const tax = data.tax ?? 0;
  const gst = data.gst ?? 0;
  if (data.total !== undefined) {
    return Math.abs(data.total - sub - tax - gst) < 0.01;
  }
  return true; // total not provided — backend will compute it
}, { message: "total must equal subtotal + tax + gst" })

export const createExpenseSchema = z.object({
  category: z.enum(["HOSTING", "DOMAINS", "API_COSTS", "TOOLS", "MARKETING", "SALARY", "SOFTWARE", "OTHER"]),
  description: z.string().min(1).max(2000),
  amount: z.number().min(0).max(99_999_999).finite().describe("Amount in selected currency"),
  date: z.string().min(1), // ISO date string — validated as Date at API level
  receiptUrl: z.string().max(500).optional().nullable(),
  projectId: z.string().max(100).optional().nullable(),
  employeeId: z.string().max(100).optional().nullable(),
  paymentRef: z.string().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
})

export const updateExpenseSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["HOSTING", "DOMAINS", "API_COSTS", "TOOLS", "MARKETING", "SALARY", "SOFTWARE", "OTHER"]).optional(),
  description: z.string().max(2000).optional(),
  amount: z.number().min(0).max(99_999_999).finite().optional(),
  date: z.string().optional(),
  receiptUrl: z.string().url().nullable().optional(),
  projectId: z.string().nullable().optional(),
  employeeId: z.string().max(100).nullable().optional(),
  paymentRef: z.string().max(200).nullable().optional(),
})

// ━━ Leads ━━
export const createLeadSchema = z.object({
  name: z.string().min(1, "Name is required").max(200, "Name must be at most 200 characters"),
  email: z.string().email("Valid email is required").max(200, "Email must be at most 200 characters"),
  company: z.string().max(200, "Company must be at most 200 characters").optional(),
  website: z.string().max(500, "Website must be at most 500 characters").optional(),
  phone: z.string().max(50, "Phone must be at most 50 characters").optional(),
  source: z.enum(["MANUAL", "AI_FOUND", "REFERRAL", "SOCIAL_MEDIA"]).optional(),
  score: z.number().int().min(0).max(100).optional(),
  status: z.enum(["NEW", "CONTACTED", "INTERESTED", "PROPOSAL", "NEGOTIATING", "WON", "LOST"]).optional(),
  notes: z.string().max(5000, "Notes must be at most 5000 characters").optional(),
  clientId: z.string().optional(),
})

export const updateLeadSchema = z.object({
  id: z.string().min(1, "Lead ID is required"),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email("Valid email is required").max(200).optional(),
  company: z.string().max(200).optional(),
  website: z.string().max(500).optional(),
  phone: z.string().max(50).optional(),
  source: z.enum(["MANUAL", "AI_FOUND", "REFERRAL", "SOCIAL_MEDIA"]).optional(),
  score: z.number().int().min(0).max(100).optional(),
  status: z.enum(["NEW", "CONTACTED", "INTERESTED", "PROPOSAL", "NEGOTIATING", "WON", "LOST"]).optional(),
  notes: z.string().max(5000).optional(),
  clientId: z.string().optional(),
}).refine(hasAtLeastOneField, { message: "At least one field must be provided" })

// ━━ Support Tickets ━━
export const createSupportTicketSchema = z.object({
  clientId: z.string().optional(),
  subject: z.string().min(1, "Subject is required").max(300),
  description: z.string().min(1, "Description is required").max(10000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
})

export const updateSupportTicketSchema = z.object({
  id: z.string().min(1, "Ticket ID is required"),
  subject: z.string().max(300).optional(),
  description: z.string().max(10000).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  assignedTo: z.string().nullable().optional(),
  resolution: z.string().max(5000).optional(),
}).refine(hasAtLeastOneField, { message: "At least one field must be provided" })

// Backward compatibility alias
export const supportTicketSchema = createSupportTicketSchema

// ━━ Time Tracking ━━
export const startTimeEntrySchema = z.object({
  projectId: z.string().optional(),
  description: z.string().max(500).optional(),
})

export const updateTimeEntrySchema = z.object({
  id: z.string().min(1),
  description: z.string().max(500).optional(),
  projectId: z.string().optional(),
  status: z.enum(["ACTIVE", "COMPLETED"]).optional(),
})

// ━━ Subscriptions ━━
// Phase 7c: Subscription category must match the same enum used for expenses
// to prevent arbitrary strings from polluting the category badge UI.
export const SUBSCRIPTION_CATEGORIES = [
  "HOSTING", "DOMAINS", "API_COSTS", "TOOLS", "MARKETING",
  "SALARY", "SOFTWARE", "OTHER",
] as const

export const createSubscriptionSchema = z.object({
  service: z.string().min(1, "Service name is required").max(200),
  amount: z.number().min(0, "Amount must be positive").max(99_999_999).finite(),
  currency: z.enum(["INR", "GBP", "USD"]).optional(),
  exchangeRate: z.number().min(0).optional(),
  frequency: z.enum(["MONTHLY", "YEARLY", "ONE_TIME"]).optional(),
  status: z.enum(["ACTIVE", "STOPPED", "COMPLETED", "EXPIRED", "PAUSED"]).optional(),
  category: z.enum(SUBSCRIPTION_CATEGORIES).optional().nullable(),
  projectId: z.string().max(100).optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
})

export const updateSubscriptionSchema = z.object({
  id: z.string().min(1),
  service: z.string().min(1).max(200).optional(),
  amount: z.number().min(0).max(99_999_999).finite().optional().describe("Amount in selected currency"),
  currency: z.enum(["INR", "GBP", "USD"]).optional(),
  exchangeRate: z.number().min(0).optional(),
  frequency: z.enum(["MONTHLY", "YEARLY", "ONE_TIME"]).optional(),
  status: z.enum(["ACTIVE", "STOPPED", "COMPLETED", "EXPIRED", "PAUSED"]).optional(),
  category: z.enum(SUBSCRIPTION_CATEGORIES).optional().nullable(),
  projectId: z.string().max(100).optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
}).refine(hasAtLeastOneField, { message: "At least one field must be provided" })

/**
 * Validates data against a schema and returns either the validated data or an error response
 * @param schema - The Zod schema to validate against
 * @param data - The unknown data to validate
 * @returns An object with either success=true and validated data, or success=false and an error message
 */
export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data)
  if (!result.success) {
    const firstError = result.error.issues?.[0]
    return { success: false, error: firstError?.message || "Invalid input" }
  }
  return { success: true, data: result.data }
}

// ━━ Deals ━━
export const createDealSchema = z.object({
  title: z.string().min(1, "Deal title is required").max(300, "Title must be at most 300 characters"),
  value: z.number().min(0, "Value must be positive").max(99_999_999).finite().optional(),
  currency: z.enum(["USD", "GBP", "INR"]).optional(),
  stage: z.enum(["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"]).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().optional().refine((val) => {
    if (!val) return true
    return !isNaN(Date.parse(val))
  }, { message: "expectedCloseDate must be a valid date string" }),
  clientId: z.string().optional(),
  leadId: z.string().optional(),
  assignedToId: z.string().optional(),
  notes: z.string().max(5000, "Notes must be at most 5000 characters").optional(),
})

export const updateDealSchema = z.object({
  id: z.string().min(1, "Deal ID is required"),
  title: z.string().min(1).max(300).optional(),
  value: z.number().min(0).max(99_999_999).finite().optional(),
  currency: z.enum(["USD", "GBP", "INR"]).optional(),
  stage: z.enum(["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"]).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().optional().refine((val) => { if (!val) return true; return !isNaN(Date.parse(val)); }, { message: "expectedCloseDate must be a valid date string" }),
  actualCloseDate: z.string().optional().refine((val) => { if (!val) return true; return !isNaN(Date.parse(val)); }, { message: "actualCloseDate must be a valid date string" }),
  clientId: z.string().nullable().optional(),
  leadId: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  notes: z.string().max(5000).optional(),
}).refine(hasAtLeastOneField, { message: "At least one field must be provided" })

// ━━ Contacts ━━
export const createContactSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100, "First name must be at most 100 characters"),
  lastName: z.string().max(100).optional(),
  email: z.string().email("Valid email is required").max(200, "Email must be at most 200 characters"),
  phone: z.string().max(50).optional(),
  jobTitle: z.string().max(200).optional(),
  clientId: z.string().optional(),
  leadId: z.string().optional(),
  notes: z.string().max(5000).optional(),
  isPrimary: z.boolean().optional(),
})

export const updateContactSchema = z.object({
  id: z.string().min(1, "Contact ID is required"),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().max(100).optional(),
  email: z.string().email("Valid email is required").max(200).optional(),
  phone: z.string().max(50).optional(),
  jobTitle: z.string().max(200).optional(),
  clientId: z.string().nullable().optional(),
  leadId: z.string().nullable().optional(),
  notes: z.string().max(5000).optional(),
  isPrimary: z.boolean().optional(),
}).refine(hasAtLeastOneField, { message: "At least one field must be provided" })

// ━━ Contracts ━━
export const createContractSchema = z.object({
  clientId: z.string().min(1, "Client ID is required"),
  title: z.string().max(500).optional(),
  scopeOfWork: z.string().max(50000).optional(),
  paymentTerms: z.string().max(10000).optional(),
  totalValue: z.number().min(0).max(99_999_999).finite().optional(),
  currency: z.enum(["USD", "GBP", "INR"]).optional(),
  paymentSchedule: z.string().max(10000).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  termsAndConditions: z.string().max(50000).optional(),
  templateText: z.string().max(50000).optional(),
  templateFileName: z.string().max(500).optional(),
  useAI: z.boolean().optional(),
  // Backend auto-generates if not provided
  contractNumber: z.string().optional(),
})

export const updateContractSchema = z.object({
  id: z.string().min(1, "Contract ID is required"),
  title: z.string().max(500).optional(),
  scopeOfWork: z.string().max(50000).optional(),
  paymentTerms: z.string().max(10000).optional(),
  totalValue: z.number().min(0).max(99_999_999).finite().optional(),
  currency: z.enum(["USD", "GBP", "INR"]).optional(),
  paymentSchedule: z.string().max(10000).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  termsAndConditions: z.string().max(50000).optional(),
  amendments: z.string().max(10000).optional(),
  specialClauses: z.string().max(10000).optional(),
  clientName: z.string().max(200).optional(),
  clientEmail: z.string().max(200).optional(),
  clientCompany: z.string().max(200).optional(),
  clientPhone: z.string().max(50).optional(),
  clientAddress: z.string().max(500).optional(),
  projectName: z.string().max(200).optional(),
  projectDescription: z.string().max(5000).optional(),
  projectType: z.string().max(100).optional(),
  projectMethod: z.string().max(100).optional(),
  status: z.enum(["DRAFT", "SENT", "SIGNED", "EXPIRED", "CANCELLED"]).optional(),
}).refine(hasAtLeastOneField, { message: "At least one field must be provided" })

// ━━ Admin Time Entry ━━
// Admin manual entry creation (can specify userId, clockIn, clockOut)
export const adminCreateTimeEntrySchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  projectId: z.string().optional(),
  description: z.string().max(1000).optional(),
  clockIn: z.string().min(1, "Clock-in time is required"), // ISO date string
  clockOut: z.string().optional(), // ISO date string - if provided, entry is COMPLETED
}).refine(data => {
  if (data.clockOut) {
    const clockIn = new Date(data.clockIn);
    const clockOut = new Date(data.clockOut);
    return clockOut > clockIn; // clockOut must be after clockIn
  }
  return true;
}, { message: "Clock-out must be after clock-in", path: ["clockOut"] })

// Admin update entry (can edit clockIn, clockOut, description, projectId)
export const adminUpdateTimeEntrySchema = z.object({
  id: z.string().min(1),
  description: z.string().max(1000).optional(),
  projectId: z.string().nullable().optional(),
  clockIn: z.string().optional(), // ISO date string
  clockOut: z.string().nullable().optional(), // ISO date string (null to clear)
}).refine(data => {
  if (data.clockIn && data.clockOut) {
    const clockIn = new Date(data.clockIn);
    const clockOut = new Date(data.clockOut);
    return clockOut > clockIn;
  }
  return true;
}, { message: "Clock-out must be after clock-in", path: ["clockOut"] })

// === HR Validation Schemas ===

// Re-export from types.ts to avoid duplication (L22)
export { VALID_LEAVE_TYPES, type LeaveType } from "@/lib/types"

export const VALID_LEAVE_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;

export const VALID_ATTENDANCE_STATUSES = [
  "PRESENT",
  "ABSENT",
  "HALF_DAY",
  "LEAVE",
  "NO_SCHEDULE",
] as const;

export const createLeaveSchema = z.object({
  userId: z.string().min(1).optional(),
  leaveType: z.enum(VALID_LEAVE_TYPES),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().max(1000).optional(),
}).refine(data => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return end >= start;
}, { message: "endDate must be on or after startDate" });

export const updateLeaveSchema = z.object({
  leaveType: z.enum(VALID_LEAVE_TYPES).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  reason: z.string().max(1000).optional(),
  status: z.enum(VALID_LEAVE_STATUSES).optional(),
  feedback: z.string().max(500).optional(),
}).refine(data => {
  if (data.startDate && data.endDate) {
    return new Date(data.endDate) >= new Date(data.startDate);
  }
  return true;
}, { message: "endDate must be on or after startDate" });

export const createAttendanceSchema = z.object({
  userId: z.string().min(1),
  date: z.string().min(1),
  checkIn: z.string().min(1),
  checkOut: z.string().optional(),
  status: z.enum(VALID_ATTENDANCE_STATUSES),
  notes: z.string().max(500).optional(),
});

export const updateAttendanceSchema = z.object({
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  status: z.enum(VALID_ATTENDANCE_STATUSES).optional(),
  notes: z.string().max(500).optional(),
});

export const createAvailabilitySchema = z.object({
  userId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format"),
  isAvailable: z.boolean().default(true),
});

export const updateAvailabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format").optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format").optional(),
  isAvailable: z.boolean().optional(),
});

export const createOverrideSchema = z.object({
  userId: z.string().min(1),
  date: z.string().min(1),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isAvailable: z.boolean(),
  reason: z.string().max(200).optional(),
});

export const updateOverrideSchema = z.object({
  date: z.string().min(1).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  isAvailable: z.boolean().optional(),
  reason: z.string().max(200).optional(),
});

export const createTrainingDocSchema = z.object({
  topic: z.string().min(1).max(200),
  brief: z.string().max(2000).optional(),
  attachmentText: z.string().max(50000).optional(),
});

export const createTrainingTestSchema = z.object({
  documentId: z.string().min(1),
  level: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

export const createAssignmentSchema = z.object({
  documentId: z.string().min(1),
  testId: z.string().optional(),
  assignedTo: z.string().min(1),
  testLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  dueDate: z.string().min(1).optional(),
});

export const submitTestAttemptSchema = z.object({
  assignmentId: z.string().min(1),
  answers: z.array(z.number().int().min(0)),
  timeTaken: z.number().min(0).optional(),
});

// === Phase 8 Validation Schemas ===

// Support Ticket — additional schemas (existing ones above use `subject`)
export const createTicketMessageSchema = z.object({
  message: z.string().min(1).max(50000),
})

// Approval
export const validApprovalTypes = [
  "TASK",
  "INVOICE",
  "EMAIL",
  "QUOTATION",
  "PROJECT_PLAN",
  "CODE_REVIEW",
  "LEAD_OUTREACH",
  "CONTENT_PIECE",
  "CHAT_DELETION",
] as const

export const createApprovalSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  type: z.enum(validApprovalTypes),
  requesterType: z.enum(["AI", "HUMAN"]).default("HUMAN"),
  data: z.record(z.string(), z.unknown()).optional(),
})

export const patchApprovalSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["APPROVED", "REJECTED", "NEEDS_IMPROVEMENT"]),
  feedback: z.string().max(2000).optional(),
})

// API Key
export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(["OPENROUTER", "GOOGLE_AI", "ZAI", "ANTHROPIC", "OPENAI", "CUSTOM"]).optional(),
  keyValue: z.string().min(1).max(500),
  budgetLimit: z.number().min(0).optional(),
})

export const updateApiKeySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  provider: z.string().max(50).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "EXHAUSTED"]).optional(),
  budgetLimit: z.number().min(0).optional(),
})

// Notification Preference
const hhMmRegex = /^([01]\d|2[0-3]):([0-5]\d)$/

export const updateNotificationPreferenceSchema = z.object({
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(hhMmRegex).nullable().optional(),
  quietHoursEnd: z.string().regex(hhMmRegex).nullable().optional(),
})
