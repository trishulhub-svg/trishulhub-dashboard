/**
 * Controllable dashboard pages — single source for Team page-access UI + nav filter.
 * Keep hrefs in sync with dashboard layout navGroups (auto-used when layout imports this).
 */

export type PageAccessMode = "OFF" | "ALLOW" | "RESTRICT"

export type ControllablePage = {
  title: string
  href: string
  /** Always visible even under ALLOW/RESTRICT (escape hatch) */
  locked?: boolean
}

/** Flat list of staff pages that can be toggled per user. */
export const CONTROLLABLE_PAGES: ControllablePage[] = [
  { title: "Dashboard", href: "/dashboard", locked: true },
  { title: "Workspace", href: "/dashboard/workspace" },
  { title: "Learning", href: "/dashboard/training" },
  { title: "Docx Sign", href: "/dashboard/docx-sign" },
  { title: "Projects", href: "/dashboard/projects" },
  { title: "Clients", href: "/dashboard/clients" },
  { title: "CRM", href: "/dashboard/crm" },
  { title: "Demo Projects", href: "/dashboard/demo" },
  { title: "Time Tracking", href: "/dashboard/time-tracking" },
  { title: "Support", href: "/dashboard/support" },
  { title: "Raise Support", href: "/dashboard/support/raise" },
  { title: "My Leaves", href: "/dashboard/leaves" },
  { title: "My Details", href: "/dashboard/my-details" },
  { title: "Team", href: "/dashboard/team" },
  { title: "Availability", href: "/dashboard/availability" },
  { title: "Capacity", href: "/dashboard/capacity" },
  { title: "Approvals", href: "/dashboard/approvals" },
  { title: "Finance", href: "/dashboard/finance" },
  { title: "Invoices", href: "/dashboard/finance/invoices" },
  { title: "Expenses", href: "/dashboard/finance/expenses" },
  { title: "Access Hub", href: "/dashboard/access-hub" },
  { title: "API Keys", href: "/dashboard/api-keys" },
  { title: "Audit Trail", href: "/dashboard/audit-trail" },
  { title: "Email Logs", href: "/dashboard/email-logs" },
  { title: "SMTP", href: "/dashboard/smtp" },
  { title: "Settings", href: "/dashboard/settings", locked: true },
]

export function parsePageAccessPages(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === "string" && x.startsWith("/dashboard"))
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown
      return parsePageAccessPages(parsed)
    } catch {
      return []
    }
  }
  return []
}

export function normalizePageAccessMode(raw: unknown): PageAccessMode {
  if (raw === "ALLOW" || raw === "RESTRICT") return raw
  return "OFF"
}

/** Match pathname to a controllable page href (prefix for nested routes). */
export function pathMatchesPage(pathname: string, pageHref: string): boolean {
  if (pathname === pageHref) return true
  if (pageHref === "/dashboard") return pathname === "/dashboard"
  // Support inbox and raise are separate controllable pages
  if (pageHref === "/dashboard/support") {
    if (pathname === "/dashboard/support/raise" || pathname.startsWith("/dashboard/support/raise/")) {
      return false
    }
    return pathname === "/dashboard/support" || pathname.startsWith("/dashboard/support/")
  }
  return pathname === pageHref || pathname.startsWith(pageHref + "/")
}

/**
 * Returns whether a path is allowed for the user under page-access rules.
 * SUPER_ADMIN always allowed. Locked pages (Dashboard/Settings) always allowed.
 */
export function isPageAccessAllowed(
  pathname: string,
  role: string | undefined,
  mode: PageAccessMode,
  pages: string[]
): boolean {
  if (role === "SUPER_ADMIN") return true
  if (mode === "OFF") return true

  const locked = CONTROLLABLE_PAGES.filter((p) => p.locked).map((p) => p.href)
  if (locked.some((h) => pathMatchesPage(pathname, h))) return true

  const selected = pages.length > 0 ? pages : []
  const matched = CONTROLLABLE_PAGES.some(
    (p) => !p.locked && selected.includes(p.href) && pathMatchesPage(pathname, p.href)
  )

  if (mode === "ALLOW") {
    // Only selected pages (plus locked)
    return matched
  }
  // RESTRICT: hide selected; everything else OK
  return !matched
}

/** Filter a nav href for sidebar visibility. */
export function isNavHrefVisible(
  href: string,
  role: string | undefined,
  mode: PageAccessMode,
  pages: string[]
): boolean {
  const path = href.split("?")[0]
  return isPageAccessAllowed(path, role, mode, pages)
}

/**
 * Role route gates matching middleware.ts (independent of per-user page ACL).
 * Used by favorites so users cannot bookmark pages their role cannot open.
 */
export function isRoleAllowedDashboardHref(href: string, role: string | undefined): boolean {
  const path = href.split("?")[0]
  if (!role) return false
  if (role === "SUPER_ADMIN") return true

  const superAdminOnly = ["/dashboard/email-logs", "/dashboard/smtp"]
  const adminOnly = [
    "/dashboard/finance",
    "/dashboard/crm",
    "/dashboard/team",
    "/dashboard/audit-trail",
    "/dashboard/api-keys",
    "/dashboard/training/assign",
    "/dashboard/docx-sign/manage",
  ]
  const adminOrPm = [
    "/dashboard/clients",
    "/dashboard/projects",
    "/dashboard/demo",
    "/dashboard/approvals",
    "/dashboard/support",
    "/dashboard/capacity",
    "/dashboard/availability",
  ]

  const isAdminRole = role === "ADMIN" || role === "SUPER_ADMIN"
  const isAdminOrPm = isAdminRole || role === "PROJECT_MANAGER"

  // Raise page is available to all staff (developers included)
  if (path === "/dashboard/support/raise" || path.startsWith("/dashboard/support/raise/")) {
    return true
  }

  if (superAdminOnly.some((r) => path === r || path.startsWith(`${r}/`))) return false
  if (!isAdminRole && adminOnly.some((r) => path === r || path.startsWith(`${r}/`))) return false
  if (!isAdminOrPm && adminOrPm.some((r) => path === r || path.startsWith(`${r}/`))) return false
  return true
}
