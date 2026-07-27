/** Built-in infrastructure groups + custom group key helpers. */

export const BUILTIN_INFRA_GROUPS = [
  { key: "GITHUB", label: "GitHub", description: "Repos, GitHub URLs, account API/auth" },
  { key: "TURSO", label: "Turso", description: "Database URL, database token, account token" },
  { key: "CLOUDFLARE", label: "Cloudflare", description: "Cloudflare API and account access" },
  { key: "SMTP", label: "SMTP", description: "SMTP hosts, users, passwords, ports" },
] as const

export type BuiltinInfraGroupKey = (typeof BUILTIN_INFRA_GROUPS)[number]["key"]

const BUILTIN_SET = new Set<string>(BUILTIN_INFRA_GROUPS.map((g) => g.key))

/** CUSTOM_NAME — uppercase letters, numbers, underscore after prefix */
const CUSTOM_KEY_RE = /^CUSTOM_[A-Z0-9_]{1,40}$/

export function isBuiltinInfraGroupKey(key: string): key is BuiltinInfraGroupKey {
  return BUILTIN_SET.has(key)
}

export function isCustomInfraGroupKey(key: string): boolean {
  return CUSTOM_KEY_RE.test(key)
}

export function isValidInfraGroupKey(key: unknown): key is string {
  return typeof key === "string" && (isBuiltinInfraGroupKey(key) || isCustomInfraGroupKey(key))
}

/** Slug a user-entered group name into CUSTOM_FOO_BAR */
export function toCustomInfraGroupKey(name: string): string | null {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
  if (!slug) return null
  const key = `CUSTOM_${slug}`
  return isCustomInfraGroupKey(key) ? key : null
}

export function sanitizeInfraGroupLabel(value: unknown, maxLen = 60): string {
  if (typeof value !== "string") return ""
  return value.trim().replace(/\s+/g, " ").slice(0, maxLen)
}

export function builtinLabelForKey(key: string): string | null {
  return BUILTIN_INFRA_GROUPS.find((g) => g.key === key)?.label ?? null
}
