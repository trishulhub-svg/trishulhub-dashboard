/**
 * Time-tracking non-project activity catalog (Super Admin editable).
 * Project names always come from Project section (including demo projects).
 */
import { getAppSetting, setAppSetting } from "@/lib/db"

export const TIME_ACTIVITY_SETTING_KEY = "time_activity_catalog"

export type TimeActivityKey = "TRAINING" | "SUPERVISION" | "HR_ADMIN" | "RD_SA"

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

function mergeCatalog(raw: string): TimeActivityItem[] {
  let parsed: Partial<TimeActivityItem>[] = []
  try {
    const j = JSON.parse(raw || "[]")
    if (Array.isArray(j)) parsed = j
  } catch {
    parsed = []
  }
  return DEFAULT_TIME_ACTIVITY_CATALOG.map((def) => {
    const hit = parsed.find((p) => p?.key === def.key)
    if (!hit) return { ...def }
    return {
      ...def,
      label:
        typeof hit.label === "string" && hit.label.trim()
          ? hit.label.trim().slice(0, 60)
          : def.label,
      enabled: typeof hit.enabled === "boolean" ? hit.enabled : def.enabled,
    }
  })
}

export async function getTimeActivityCatalog(): Promise<TimeActivityItem[]> {
  const raw = await getAppSetting(TIME_ACTIVITY_SETTING_KEY)
  return mergeCatalog(raw)
}

export async function saveTimeActivityCatalog(
  items: Array<{ key: TimeActivityKey; label: string; enabled: boolean }>
): Promise<TimeActivityItem[]> {
  const next = DEFAULT_TIME_ACTIVITY_CATALOG.map((def) => {
    const hit = items.find((p) => p.key === def.key)
    if (!hit) return { ...def }
    return {
      ...def,
      label: (hit.label || def.label).trim().slice(0, 60) || def.label,
      enabled: Boolean(hit.enabled),
    }
  })
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
