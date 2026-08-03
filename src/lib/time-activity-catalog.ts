/**
 * Time-tracking non-project activity catalog (Admin / Super Admin editable).
 * Built-in keys stay fixed; custom activities can be added freely.
 * Project names always come from Project section (including demo projects).
 */
import { getAppSetting, setAppSetting } from "@/lib/db"

export const TIME_ACTIVITY_SETTING_KEY = "time_activity_catalog"

export const BUILTIN_TIME_ACTIVITY_KEYS = [
  "TRAINING",
  "SUPERVISION",
  "HR_ADMIN",
  "RD_SA",
] as const

export type BuiltinTimeActivityKey = (typeof BUILTIN_TIME_ACTIVITY_KEYS)[number]
/** Built-in or custom catalog key (e.g. MEETING_NOTES). */
export type TimeActivityKey = string

export type TimeActivityItem = {
  key: TimeActivityKey
  label: string
  enabled: boolean
  /** Roles that may use this activity (empty = all clock-in roles) */
  roles: string[]
  selectValue: string
}

export const DEFAULT_TIME_ACTIVITY_CATALOG: TimeActivityItem[] = [
  {
    key: "TRAINING",
    label: "Training",
    enabled: true,
    roles: [],
    selectValue: "__training__",
  },
  {
    key: "SUPERVISION",
    label: "Supervision",
    enabled: true,
    roles: [],
    selectValue: "__supervision__",
  },
  {
    key: "HR_ADMIN",
    label: "HR & Administration",
    enabled: true,
    roles: ["SUPER_ADMIN", "ADMIN"],
    selectValue: "__hr_admin__",
  },
  {
    key: "RD_SA",
    label: "R&D / SA",
    enabled: true,
    roles: ["SUPER_ADMIN", "PROJECT_MANAGER"],
    selectValue: "__rd_sa__",
  },
]

const BUILTIN_SET = new Set<string>(BUILTIN_TIME_ACTIVITY_KEYS)
const RESERVED_KEYS = new Set<string>([...BUILTIN_TIME_ACTIVITY_KEYS, "PROJECT"])

export function isBuiltinActivityKey(key: string): boolean {
  return BUILTIN_SET.has(key)
}

export function selectValueForKey(key: string): string {
  const hit = DEFAULT_TIME_ACTIVITY_CATALOG.find((d) => d.key === key)
  if (hit) return hit.selectValue
  return `__${key.toLowerCase()}__`
}

/** Slug a label into a safe activity key (A-Z / 0-9 / _). */
export function slugActivityKey(label: string): string {
  const base = label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
  return base || "CUSTOM"
}

export function isValidCustomActivityKey(key: string): boolean {
  if (!/^[A-Z][A-Z0-9_]{0,39}$/.test(key)) return false
  return !RESERVED_KEYS.has(key)
}

function normalizeItem(
  raw: Partial<TimeActivityItem> | null | undefined,
  fallback?: TimeActivityItem
): TimeActivityItem | null {
  const key = typeof raw?.key === "string" ? raw.key.trim().toUpperCase() : fallback?.key
  if (!key) return null
  if (RESERVED_KEYS.has(key) && !BUILTIN_SET.has(key)) return null
  if (!BUILTIN_SET.has(key) && !isValidCustomActivityKey(key)) return null

  const def = DEFAULT_TIME_ACTIVITY_CATALOG.find((d) => d.key === key)
  const labelSrc =
    typeof raw?.label === "string" && raw.label.trim()
      ? raw.label.trim()
      : fallback?.label || def?.label || key.replace(/_/g, " ")
  const roles =
    Array.isArray(raw?.roles) && raw.roles.every((r) => typeof r === "string")
      ? (raw.roles as string[])
      : fallback?.roles || def?.roles || []

  return {
    key,
    label: labelSrc.slice(0, 60),
    enabled: typeof raw?.enabled === "boolean" ? raw.enabled : fallback?.enabled ?? true,
    roles,
    selectValue: def?.selectValue || selectValueForKey(key),
  }
}

function mergeCatalog(raw: string): TimeActivityItem[] {
  let parsed: Partial<TimeActivityItem>[] = []
  try {
    const j = JSON.parse(raw || "[]")
    if (Array.isArray(j)) parsed = j
  } catch {
    parsed = []
  }

  const builtins = DEFAULT_TIME_ACTIVITY_CATALOG.map((def) => {
    const hit = parsed.find((p) => p?.key === def.key)
    return normalizeItem(hit, def) || { ...def }
  })

  const custom: TimeActivityItem[] = []
  const seen = new Set(builtins.map((b) => b.key))
  for (const row of parsed) {
    const key = typeof row?.key === "string" ? row.key.trim().toUpperCase() : ""
    if (!key || seen.has(key) || BUILTIN_SET.has(key)) continue
    const item = normalizeItem(row)
    if (!item) continue
    custom.push(item)
    seen.add(item.key)
  }

  return [...builtins, ...custom].slice(0, 20)
}

export async function getTimeActivityCatalog(): Promise<TimeActivityItem[]> {
  const raw = await getAppSetting(TIME_ACTIVITY_SETTING_KEY)
  return mergeCatalog(raw)
}

export async function saveTimeActivityCatalog(
  items: Array<{ key: string; label: string; enabled: boolean; roles?: string[] }>
): Promise<TimeActivityItem[]> {
  const next: TimeActivityItem[] = []
  const seen = new Set<string>()

  for (const def of DEFAULT_TIME_ACTIVITY_CATALOG) {
    const hit = items.find((p) => p.key === def.key)
    const item = normalizeItem(hit ? { ...def, ...hit, roles: def.roles } : def, def)
    if (item) {
      next.push(item)
      seen.add(item.key)
    }
  }

  for (const row of items) {
    const key = (row.key || "").trim().toUpperCase()
    if (!key || seen.has(key) || BUILTIN_SET.has(key)) continue
    const item = normalizeItem({
      key,
      label: row.label,
      enabled: row.enabled,
      roles: row.roles || [],
    })
    if (!item) continue
    next.push(item)
    seen.add(item.key)
    if (next.length >= 20) break
  }

  await setAppSetting(TIME_ACTIVITY_SETTING_KEY, JSON.stringify(next))
  return next
}

export function activitiesVisibleForRole(
  catalog: TimeActivityItem[],
  role: string
): TimeActivityItem[] {
  return catalog.filter((item) => {
    if (!item.enabled) return false
    if (!item.roles.length) return true
    return item.roles.includes(role)
  })
}

/** Role may clock this activity type (built-in rules + enabled custom rows). */
export function canUseActivityType(
  role: string,
  activityType: string,
  catalog?: TimeActivityItem[]
): boolean {
  if (activityType === "PROJECT" || activityType === "TRAINING" || activityType === "SUPERVISION") {
    return true
  }
  if (activityType === "HR_ADMIN") return role === "ADMIN" || role === "SUPER_ADMIN"
  if (activityType === "RD_SA") return role === "SUPER_ADMIN" || role === "PROJECT_MANAGER"

  const item = catalog?.find((c) => c.key === activityType)
  if (!item) return isValidCustomActivityKey(activityType)
  if (!item.enabled) return false
  if (!item.roles.length) return true
  return item.roles.includes(role)
}
