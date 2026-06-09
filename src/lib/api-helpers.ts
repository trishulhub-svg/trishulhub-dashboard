/**
 * Shared API response helpers for client components.
 * Centralizes common response unwrapping patterns to avoid duplication across pages.
 */

/** Standard paginated API response shape */
export interface PaginatedResponse<T> {
  data?: T[]
  total?: number
  page?: number
  limit?: number
  totalPages?: number
  /** Additional array field (e.g. tasks on a project detail response) */
  tasks?: T[]
}

/** Unwrap a paginated { data: [...] } or plain array response into a typed array */
export function unwrapResponse<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw
  const resp = raw as PaginatedResponse<T>
  return Array.isArray(resp?.data) ? resp.data : []
}

/** Extract array from various API response shapes (data, tasks, or raw array) */
export function extractArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data
  const resp = data as PaginatedResponse<T>
  if (Array.isArray(resp?.data)) return resp.data
  if (Array.isArray(resp?.tasks)) return resp.tasks
  return []
}
