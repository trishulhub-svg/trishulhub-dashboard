import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Safely cast unknown data to an array.
 * Returns the array if input is already an array, otherwise returns an empty array.
 * Prevents runtime crashes when API responses return unexpected data shapes.
 */
export function safeArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? data : []
}

/**
 * Safely format a Date object to a readable string.
 * Falls back to ISO date format if toLocaleDateString fails.
 */
export function safeDateStr(d: Date): string {
  try {
    return d.toLocaleDateString()
  } catch {
    return d.toISOString().split("T")[0]
  }
}

/**
 * Safely format a Date object to a locale string with time.
 * Falls back to ISO format if toLocaleString fails.
 */
export function safeDateTimeStr(d: Date): string {
  try {
    return d.toLocaleString()
  } catch {
    return d.toISOString()
  }
}

/**
 * Safely parse an unknown value into a Date object.
 * Returns current date as fallback if the value is invalid or null/undefined.
 */
export function safeParseDate(val: unknown): Date {
  if (!val) return new Date()
  try {
    const d = new Date(val as string)
    return isNaN(d.getTime()) ? new Date() : d
  } catch {
    return new Date()
  }
}

/**
 * Safely parse a JSON string. Returns fallback if parsing fails.
 * Use this instead of raw JSON.parse to prevent silent crashes.
 */
export function safeJsonParse<T = unknown>(val: unknown, fallback: T): T {
  if (val === undefined || val === null) return fallback
  if (typeof val !== "string") return val as T
  try {
    return JSON.parse(val) as T
  } catch {
    return fallback
  }
}
