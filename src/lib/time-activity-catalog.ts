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
  /**
   * Users who get a yellow “assigned work” blink for this activity.
   * Empty = no user-targeted yellow dots (role visibility still applies).
   */
  userIds: string[]
  selectValue: string
}

export const DEFAULT_TIME_ACTIVITY_CATALOG: TimeActivityItem[] = [
  {
    key: "TRAINING",
    label: "Training",
    enabled: true,
    roles: [],
    userIds: [],
    selectValue: "__training__",
  },
  {
    key: "SUPERVISION",
    label: "Supervision",
    enabled: true,
    roles: [],
    userIds: [],
    selectValue: "__supervision__",
  },
  {
    key: "HR_ADMIN",
    label: "HR & Administration",
    enabled: true,
    roles: ["SUPER_ADMIN", "ADMIN"],
    userIds: [],
    selectValue: "__hr_admin__",
  },
  {
    key: "RD_SA",
    label: "R&D / SA",
    enabled: true,
    roles: ["SUPER_ADMIN", "PROJECT_MANAGER"],
    userIds: [],
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
  const userIds =
    Array.isArray(raw?.userIds) && raw.userIds.every((r) => typeof r === "string")
      ? [...new Set((raw.userIds as string[]).map((id) => id.trim()).filter(Boolean))].slice(0, 200)
      : fallback?.userIds || def?.userIds || []

  return {
    key,
    label: labelSrc.slice(0, 60),
    enabled: typeof raw?.enabled === "boolean" ? raw.enabled : fallback?.enabled ?? true,
    roles,
    userIds,
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
  items: Array<{
    key: string
    label: string
    enabled: boolean
    roles?: string[]
    userIds?: string[]
  }>
): Promise<TimeActivityItem[]> {
  const next: TimeActivityItem[] = []
  const seen = new Set<string>()
  const allowedRoles = new Set([
    "SUPER_ADMIN",
    "ADMIN",
    "PROJECT_MANAGER",
    "DEVELOPER",
  ])

  const cleanRoles = (roles: unknown): string[] => {
    if (!Array.isArray(roles)) return []
    return [
      ...new Set(
        roles
          .filter((r): r is string => typeof r === "string")
          .map((r) => r.trim().toUpperCase())
          .filter((r) => allowedRoles.has(r))
      ),
    ]
  }

  const cleanUserIds = (ids: unknown): string[] => {
    if (!Array.isArray(ids)) return []
    return [
      ...new Set(
        ids
          .filter((id): id is string => typeof id === "string")
          .map((id) => id.trim())
          .filter((id) => id.length > 0 && id.length <= 64)
      ),
    ].slice(0, 200)
  }

  for (const def of DEFAULT_TIME_ACTIVITY_CATALOG) {
    const hit = items.find((p) => p.key === def.key)
    const roles = hit && "roles" in hit ? cleanRoles(hit.roles) : def.roles
    const userIds = hit && "userIds" in hit ? cleanUserIds(hit.userIds) : def.userIds
    const item = normalizeItem(hit ? { ...def, ...hit, roles, userIds } : def, def)
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
      roles: cleanRoles(row.roles),
      userIds: cleanUserIds(row.userIds),
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

/** Activity keys that should show a yellow blink for this user (excluding TRAINING — handled via assignments). */
export function catalogYellowDotKeysForUser(
  catalog: TimeActivityItem[],
  userId: string
): string[] {
  if (!userId) return []
  return catalog
    .filter((item) => item.enabled && Array.isArray(item.userIds) && item.userIds.includes(userId))
    .map((item) => item.key)
}

/** Role may clock this activity type — driven by catalog roles (empty = all). */
export function canUseActivityType(
  role: string,
  activityType: string,
  catalog?: TimeActivityItem[]
): boolean {
  if (activityType === "PROJECT") return true

  const list = catalog || DEFAULT_TIME_ACTIVITY_CATALOG
  const item = list.find((c) => c.key === activityType)
  if (item) {
    if (!item.enabled) return false
    if (!item.roles.length) return true
    return item.roles.includes(role)
  }

  // Unknown custom key without catalog row — allow only valid custom keys
  return isValidCustomActivityKey(activityType)
}

export const CLOCK_IN_ROLE_OPTIONS = [
  { id: "SUPER_ADMIN", label: "Super Admin" },
  { id: "ADMIN", label: "Admin" },
  { id: "PROJECT_MANAGER", label: "PM" },
  { id: "DEVELOPER", label: "Developer" },
] as const
