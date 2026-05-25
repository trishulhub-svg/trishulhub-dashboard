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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ZAI PROTOCOL: Shared Anti-React-#310 Utilities
// React #310 = "Objects are not valid as a React child"
// These utilities prevent objects/Date/Array/Function/Symbol from
// being rendered directly in JSX.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Guaranteed primitive render value. Every value rendered in JSX
 * should pass through this function.
 * - string → returned as-is
 * - number/boolean → converted to string
 * - null/undefined → returns fallback
 * - Object/Array/Date/Function/Symbol → returns fallback (not [object Object])
 */
export function safeText(value: unknown, fallback: string = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const s = String(value);
    // Detect useless object representations
    if (s === "[object Object]" || s === "[object Array]" || s === "[object Function]" || s === "[object Symbol]" || s === "") return fallback;
    // Date objects produce something like "Mon Jan 15 2024 10:30:00 GMT+0000"
    // which is technically a string but usually not what we want to render raw.
    // However, if it got here, the caller explicitly wants it as text.
    return s;
  } catch {
    return fallback;
  }
}

/**
 * Deep sanitization via JSON round-trip.
 * Strips Date objects (→ ISO strings), circular refs (→ removed),
 * BigInt, undefined, functions, Symbols.
 * Returns {} on failure to prevent downstream crashes.
 */
export function deepSanitize<T>(data: unknown): T {
  try {
    return JSON.parse(JSON.stringify(data)) as T;
  } catch {
    console.error("[ZAI #310] deepSanitize failed");
    return {} as T;
  }
}

/**
 * Safe number extraction. Returns 0 if value is not a valid number.
 * Prevents NaN from being rendered in JSX.
 */
export function safeNumber(value: unknown, fallback: number = 0): number {
  if (typeof value === "number" && !isNaN(value)) return value;
  const n = Number(value);
  return isNaN(n) ? fallback : n;
}

/**
 * Safe date formatting. Accepts any value and returns a formatted date string.
 * Returns fallback if the value can't be parsed as a date.
 */
export function safeDate(value: unknown, fallback: string = ""): string {
  if (!value) return fallback;
  try {
    const d = typeof value === "string" ? new Date(value) : (value instanceof Date ? value : new Date());
    if (isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString();
  } catch {
    return fallback;
  }
}
