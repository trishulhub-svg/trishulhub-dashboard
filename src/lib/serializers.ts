/**
 * Shared serializer helpers for API routes.
 * Centralizes date serialization to avoid duplication across route files.
 */

/** Deal shape with Date fields that need ISO string conversion */
export interface DealWithDates {
  expectedCloseDate?: string | Date | null
  actualCloseDate?: string | Date | null
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
  [key: string]: unknown
}

/** Serialize Date objects in deal data to ISO strings for JSON responses */
export function serializeDealDates(d: DealWithDates) {
  if (!d) return d
  if (d.expectedCloseDate instanceof Date) d.expectedCloseDate = d.expectedCloseDate.toISOString()
  if (d.actualCloseDate instanceof Date) d.actualCloseDate = d.actualCloseDate.toISOString()
  if (d.createdAt instanceof Date) d.createdAt = d.createdAt.toISOString()
  if (d.updatedAt instanceof Date) d.updatedAt = d.updatedAt.toISOString()
  return d
}
