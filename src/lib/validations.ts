import { z } from "zod"

export const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200),
  description: z.string().max(2000).optional(),
  clientId: z.string().min(1, "Client ID is required"),
  status: z.enum(["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  deadline: z.string().optional(),
  budget: z.number().min(0).optional(),
})

export const updateProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["PLANNING", "IN_PROGRESS", "REVIEW", "APPROVAL", "DEPLOYED", "COMPLETED"]).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  deadline: z.string().optional(),
  budget: z.number().min(0).optional(),
})

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
  projectStartDate: z.string().optional().refine((val) => { if (!val) return true; return !isNaN(Date.parse(val)); }, { message: "projectStartDate must be a valid date" }),
  deliveryDate: z.string().optional().refine((val) => { if (!val) return true; return !isNaN(Date.parse(val)); }, { message: "deliveryDate must be a valid date" }),
  websites: z.array(z.object({
    url: z.string().min(1, "URL is required").max(500),
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
  projectStartDate: z.string().nullable().optional(),
  deliveryDate: z.string().nullable().optional(),
  websites: z.array(z.object({
    url: z.string().min(1, "URL is required").max(500),
    label: z.string().max(100).nullable().optional(),
    isPrimary: z.boolean().optional(),
  })).nullable().optional(),
  mediatorName: z.string().max(200).nullable().optional(),
  mediatorPhone: z.string().max(50).nullable().optional(),
  mediatorEmail: z.string().email("Valid mediator email is required").max(200).nullable().optional(),
})

export const createInvoiceSchema = z.object({
  clientId: z.string().min(1),
  projectId: z.string().optional(),
  items: z.array(z.object({
    description: z.string(),
    quantity: z.number().min(0),
    rate: z.number().min(0),
  })).optional(),
  subtotal: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  total: z.number().min(0).optional(),
  status: z.enum(["DRAFT", "SENT", "PAID", "OVERDUE"]).optional(),
  dueDate: z.string().optional(),
})

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
})

export const supportTicketSchema = z.object({
  clientId: z.string().optional(),
  subject: z.string().min(1, "Subject is required"),
  description: z.string().min(1, "Description is required"),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
})

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

// Time format validation regex (HH:mm)
const timeFormat = z.string().regex(/^\d{2}:\d{2}$/, "Time must be in HH:mm format")

export const createMeetingSchema = z.object({
  title: z.string().min(1, "Meeting title is required").max(200),
  description: z.string().max(2000).optional(),
  date: z.string().min(1, "Date is required"),
  startTime: timeFormat.min(1, "Start time is required"),
  endTime: timeFormat.optional(),
  meetingType: z.enum(["VIRTUAL", "IN_PERSON", "PHONE"]).optional(),
  meetingLink: z.string().optional(),
  projectId: z.string().optional(),
  attendeeIds: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
}).refine(
  (data) => {
    if (data.startTime && data.endTime) return data.endTime > data.startTime
    return true
  },
  { message: "End time must be after start time", path: ["endTime"] }
)

export const updateMeetingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  date: z.string().optional(),
  startTime: timeFormat.optional(),
  endTime: timeFormat.optional(),
  meetingType: z.enum(["VIRTUAL", "IN_PERSON", "PHONE"]).optional(),
  meetingLink: z.string().optional(),
  projectId: z.string().optional(),
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
  attendeeIds: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
}).refine(
  (data) => {
    if (data.startTime && data.endTime) return data.endTime > data.startTime
    return true
  },
  { message: "End time must be after start time", path: ["endTime"] }
)

// ━━ Subscriptions ━━
export const createSubscriptionSchema = z.object({
  service: z.string().min(1, "Service name is required").max(200),
  rate: z.number().min(0, "Rate must be positive"),
  currency: z.enum(["INR", "GBP", "USD"]).optional(),
  frequency: z.enum(["MONTHLY", "YEARLY", "ONE_TIME"]).optional(),
  status: z.enum(["ACTIVE", "STOPPED", "COMPLETED"]).optional(),
  category: z.string().optional(),
  projectId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
})

export const updateSubscriptionSchema = z.object({
  id: z.string().min(1),
  service: z.string().min(1).max(200).optional(),
  rate: z.number().min(0).optional(),
  currency: z.enum(["INR", "GBP", "USD"]).optional(),
  frequency: z.enum(["MONTHLY", "YEARLY", "ONE_TIME"]).optional(),
  status: z.enum(["ACTIVE", "STOPPED", "COMPLETED"]).optional(),
  category: z.string().optional(),
  projectId: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
})

/**
 * Validates data against a schema and returns either the validated data or an error response
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
  value: z.number().min(0, "Value must be positive").optional(),
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
  value: z.number().min(0).optional(),
  currency: z.enum(["USD", "GBP", "INR"]).optional(),
  stage: z.enum(["LEAD", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "CLOSED_WON", "CLOSED_LOST"]).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expectedCloseDate: z.string().optional(),
  actualCloseDate: z.string().optional(),
  clientId: z.string().nullable().optional(),
  leadId: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  notes: z.string().max(5000).optional(),
})

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
})
