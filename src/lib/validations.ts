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
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  userId: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string().optional(), // Override for historical data
})

export const updateClientSchema = z.object({
  id: z.string().min(1, "Client ID is required"),
  name: z.string().min(1).max(200).optional(),
  email: z.string().email("Valid email is required").optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  website: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  userId: z.string().optional(),
  notes: z.string().optional(),
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
  name: z.string().min(1),
  email: z.string().email(),
  company: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  source: z.enum(["MANUAL", "AI_FOUND", "REFERRAL", "SOCIAL_MEDIA"]).optional(),
  score: z.number().int().min(0).max(100).optional(),
  status: z.enum(["NEW", "CONTACTED", "INTERESTED", "PROPOSAL", "NEGOTIATING", "WON", "LOST"]).optional(),
  notes: z.string().optional(),
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
