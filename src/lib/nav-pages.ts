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
  { title: "Projects", href: "/dashboard/projects" },
  { title: "Clients", href: "/dashboard/clients" },
  { title: "CRM", href: "/dashboard/crm" },
  { title: "Demo Projects", href: "/dashboard/demo" },
  { title: "Approvals", href: "/dashboard/approvals" },
  { title: "Capacity", href: "/dashboard/capacity" },
  { title: "My Leaves", href: "/dashboard/leaves" },
  { title: "Files", href: "/dashboard/files" },
  { title: "Files Review", href: "/dashboard/files/review" },
  { title: "File Settings", href: "/dashboard/files/settings" },
  { title: "Finance", href: "/dashboard/finance" },
  { title: "Invoices", href: "/dashboard/finance/invoices" },
  { title: "Expenses", href: "/dashboard/finance/expenses" },
  { title: "P & L", href: "/dashboard/finance/pnl" },
  { title: "Team", href: "/dashboard/team" },
  { title: "Availability", href: "/dashboard/availability" },
  { title: "My Details", href: "/dashboard/my-details" },
  { title: "Email Logs", href: "/dashboard/email-logs" },
  { title: "Audit Trail", href: "/dashboard/audit-trail" },
  { title: "Support", href: "/dashboard/support" },
  { title: "Raise Support", href: "/dashboard/support/raise" },
  { title: "Time Tracking", href: "/dashboard/time-tracking" },
  { title: "Docx Sign", href: "/dashboard/docx-sign" },
  { title: "Learning", href: "/dashboard/training" },
  { title: "Access Hub", href: "/dashboard/access-hub" },
  { title: "API Keys", href: "/dashboard/api-keys" },
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
  if (pageHref === "/dashboard/support") {
    if (pathname === "/dashboard/support/raise" || pathname.startsWith("/dashboard/support/raise/")) {
      return false
    }
    return pathname === "/dashboard/support" || pathname.startsWith("/dashboard/support/")
  }
  if (pageHref === "/dashboard/files") {
    if (
      pathname.startsWith("/dashboard/files/review") ||
      pathname.startsWith("/dashboard/files/settings")
    ) {
      return false
    }
    return pathname === "/dashboard/files" || pathname.startsWith("/dashboard/files/")
  }
  return pathname === pageHref || pathname.startsWith(pageHref + "/")
}

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
    return matched
  }
  return !matched
}

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
 */
export function isRoleAllowedDashboardHref(href: string, role: string | undefined): boolean {
  const path = href.split("?")[0]
  if (!role) return false
  if (role === "SUPER_ADMIN") return true

  const superAdminOnly = [
    "/dashboard/email-logs",
    "/dashboard/smtp",
    "/dashboard/api-keys",
    "/dashboard/files/settings",
  ]
  const financeOnly = ["/dashboard/finance"]
  const adminOrHr = [
    "/dashboard/crm",
    "/dashboard/team",
    "/dashboard/audit-trail",
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

  const isFinanceAdmin = role === "ADMIN"
  const isAdminOrHr = role === "ADMIN" || role === "HR"
  const isAdminOrPm = isAdminOrHr || role === "PROJECT_MANAGER"

  if (path === "/dashboard/support/raise" || path.startsWith("/dashboard/support/raise/")) {
    return true
  }

  if (superAdminOnly.some((r) => path === r || path.startsWith(`${r}/`))) return false
  if (!isFinanceAdmin && financeOnly.some((r) => path === r || path.startsWith(`${r}/`))) return false
  if (!isAdminOrHr && adminOrHr.some((r) => path === r || path.startsWith(`${r}/`))) return false
  if (!isAdminOrPm && adminOrPm.some((r) => path === r || path.startsWith(`${r}/`))) return false
  return true
}
