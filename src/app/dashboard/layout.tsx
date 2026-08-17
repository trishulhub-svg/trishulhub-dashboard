"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Bot,
  Rocket,
  Users,
  FolderKanban,
  DollarSign,
  Key,
  Shield,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronDown,
  Moon,
  Sun,
  Bell,
  Crosshair,
  Menu,
  Check,
  Trash2,
  Calendar,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  CalendarDays,
  Monitor,
  Eye,
  Briefcase,
  Clock,
  BookOpen,
  KeyRound,
  ScrollText,
  FlaskConical,
  Mail,
  Server,
  Receipt,
  Wallet,
  ChevronRight,
  IdCard,
  LifeBuoy,
  BarChart3,
  Star,
  Plus,
  FilePenLine,
  Archive,
  FolderOpen,
} from "lucide-react";
import Image from "next/image";
import LoadingScreen from "@/components/ui/loading-screen";
import dynamic from "next/dynamic";

const Agentation = dynamic(
  () => import("agentation").then((mod) => mod.Agentation),
  { ssr: false }
);
import { useTheme } from "next-themes";
import React, { useState, useEffect, useCallback, useMemo } from "react";

import { cn, safeArray, safeDateStr, safeText } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { UserRole } from "@/lib/types";
import {
  isNavHrefVisible,
  isPageAccessAllowed,
  normalizePageAccessMode,
  type PageAccessMode,
} from "@/lib/nav-pages";
import { useFavoritePages } from "@/hooks/use-favorite-pages";
import { ClockedInHeaderDot } from "@/components/clocked-in-header-dot";
import { LiquidNavRail, liquidNavItemClass, liquidNavKey } from "@/components/liquid-nav-rail";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  children?: NavItem[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// Navigation — Overview · Work · Files · Finance · Compliance · System
const STAFF: UserRole[] = ["SUPER_ADMIN", "ADMIN", "HR", "PROJECT_MANAGER", "DEVELOPER"]
const LEAD: UserRole[] = ["SUPER_ADMIN", "ADMIN", "HR", "PROJECT_MANAGER"]
const ADMIN_HR: UserRole[] = ["SUPER_ADMIN", "ADMIN", "HR"]
const FINANCE: UserRole[] = ["SUPER_ADMIN", "ADMIN"]

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: STAFF },
      { title: "Workspace", href: "/dashboard/workspace", icon: Rocket, roles: STAFF },
    ],
  },
  {
    label: "Work",
    items: [
      { title: "Projects", href: "/dashboard/projects", icon: FolderKanban, roles: STAFF },
      { title: "Clients", href: "/dashboard/clients", icon: Briefcase, roles: LEAD },
      { title: "CRM", href: "/dashboard/crm", icon: Crosshair, roles: ADMIN_HR },
      { title: "Demo Projects", href: "/dashboard/demo", icon: FlaskConical, roles: LEAD },
      { title: "Approvals", href: "/dashboard/approvals", icon: Shield, roles: LEAD },
      { title: "Capacity", href: "/dashboard/capacity", icon: BarChart3, roles: LEAD },
      { title: "My Leaves", href: "/dashboard/leaves", icon: CalendarDays, roles: STAFF },
    ],
  },
  {
    label: "Files",
    items: [
      { title: "Files", href: "/dashboard/files", icon: FolderOpen, roles: STAFF },
      { title: "Review", href: "/dashboard/files/review", icon: Archive, roles: STAFF },
      { title: "File Settings", href: "/dashboard/files/settings", icon: Settings, roles: ["SUPER_ADMIN"] },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        title: "Finance",
        href: "/dashboard/finance",
        icon: DollarSign,
        roles: FINANCE,
        children: [
          { title: "Invoices", href: "/dashboard/finance/invoices", icon: Receipt, roles: FINANCE },
          { title: "Expenses", href: "/dashboard/finance/expenses", icon: Wallet, roles: FINANCE },
          { title: "P & L", href: "/dashboard/finance/pnl", icon: BarChart3, roles: FINANCE },
        ],
      },
    ],
  },
  {
    label: "Compliance",
    items: [
      { title: "Team", href: "/dashboard/team", icon: Users, roles: ADMIN_HR },
      { title: "Availability", href: "/dashboard/availability", icon: Clock, roles: LEAD },
      { title: "My Details", href: "/dashboard/my-details", icon: IdCard, roles: STAFF },
      { title: "Email Logs", href: "/dashboard/email-logs", icon: Mail, roles: ["SUPER_ADMIN"] },
      { title: "Audit Trail", href: "/dashboard/audit-trail", icon: ScrollText, roles: ADMIN_HR },
      { title: "Support", href: "/dashboard/support", icon: LifeBuoy, roles: LEAD },
      { title: "Support", href: "/dashboard/support/raise", icon: LifeBuoy, roles: ["DEVELOPER"] },
      { title: "Time Tracking", href: "/dashboard/time-tracking", icon: Clock, roles: STAFF },
      { title: "Docx Sign", href: "/dashboard/docx-sign", icon: FilePenLine, roles: STAFF },
      { title: "Learning", href: "/dashboard/training", icon: BookOpen, roles: STAFF },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Access Hub", href: "/dashboard/access-hub", icon: KeyRound, roles: STAFF },
      { title: "API Keys", href: "/dashboard/api-keys", icon: Key, roles: ["SUPER_ADMIN"] },
      { title: "SMTP", href: "/dashboard/smtp", icon: Server, roles: ["SUPER_ADMIN"] },
      { title: "Settings", href: "/dashboard/settings", icon: Settings, roles: STAFF },
    ],
  },
];

// Flat list for header title lookup (order-independent, includes children)
const allNavItems = navGroups.flatMap((g) =>
  g.items.flatMap((item) => [item, ...(item.children || [])])
);

interface PendingCounts {
  approvals: number;
  leaveRequests: number;

  total: number;
}

// Nav badge response: flat map of nav-href → count
interface NavBadgeMap {
  [href: string]: number;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  link: string | null;
  createdAt: string;
}

const notifIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  INFO: Info,
  WARNING: AlertTriangle,
  ERROR: XCircle,
  SUCCESS: CheckCircle2,
  TASK: Calendar,
  APPROVAL: Shield,
  AGENT: Bot,
};

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return "unknown";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "unknown";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return safeDateStr(date);
}

const SidebarContent = React.memo(function SidebarContent({
  collapsed,
  userRole,
  pathname,
  onNavigate,
  badgeCounts,
  pageAccessMode,
  pageAccessPages,
}: {
  collapsed: boolean;
  userRole: UserRole;
  pathname: string;
  onNavigate: (href: string) => void;
  badgeCounts: Record<string, number>;
  pageAccessMode: PageAccessMode;
  pageAccessPages: string[];
}) {
  // Helper: check if a nav item (or any of its children) is active
  const isItemActive = (item: NavItem): boolean => {
    if (pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"))) return true;
    // Check with query params: /dashboard/access-hub?tab=credentials should match /dashboard/access-hub
    if (item.children) {
      // If pathname starts with item.href, any child tab is active
      if (pathname === item.href || pathname.startsWith(item.href)) return true;
      return item.children.some((child) => isItemActive(child));
    }
    return false;
  };

  // Helper: check if a href is the exact active page (for child items with query params)
  const isChildActive = (child: NavItem): boolean => {
    // For child items with query params (e.g., ?tab=credentials), compare full href
    if (child.href.includes("?")) {
      if (typeof window === "undefined") return false;
      return pathname + window.location.search === child.href;
    }
    return pathname === child.href;
  };

  // Filter groups: role first, then per-user page-access ACL (Allow / Restrict)
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => {
          if (item.children) {
            const visibleChildren = item.children.filter(
              (c) =>
                c.roles.includes(userRole) &&
                isNavHrefVisible(c.href, userRole, pageAccessMode, pageAccessPages)
            );
            const parentOk =
              (item.roles.includes(userRole) || visibleChildren.length > 0) &&
              isNavHrefVisible(item.href, userRole, pageAccessMode, pageAccessPages);
            if (parentOk || visibleChildren.length > 0) {
              return { ...item, children: visibleChildren };
            }
            return null;
          }
          if (!item.roles.includes(userRole)) return null;
          if (!isNavHrefVisible(item.href, userRole, pageAccessMode, pageAccessPages)) return null;
          return item;
        })
        .filter((item): item is NavItem => item !== null),
    }))
    .filter((group) => group.items.length > 0);

  // Collapsible section state — Overview always expanded, others only expand when active
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    visibleGroups.forEach((g) => {
      if (g.label === "Overview") {
        initial[g.label] = true;
      } else {
        const isActive = g.items.some((item) => isItemActive(item));
        initial[g.label] = isActive;
      }
    });
    return initial;
  });

  // Item-level expand/collapse state (for items with children)
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    navGroups.forEach((g) => {
      g.items.forEach((item) => {
        if (item.children) {
          initial[item.href] = isItemActive(item);
        }
      });
    });
    return initial;
  });

  const { resolved: favoritePages, loaded: favLoaded } = useFavoritePages(true);

  const iconForHref = useCallback((href: string) => {
    for (const group of navGroups) {
      for (const item of group.items) {
        if (item.href === href) return item.icon;
        if (item.children) {
          const child = item.children.find((c) => c.href === href || c.href.startsWith(href));
          if (child) return child.icon;
        }
      }
    }
    return Star;
  }, []);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const toggleItem = (href: string) => {
    setExpandedItems((prev) => ({ ...prev, [href]: !prev[href] }));
  };

  return (
    <div className="flex flex-col h-full th-sidebar-shell">
      {/* Brand */}
      <div className={cn(
        "th-sidebar-brand th-sidebar-well mx-2.5 mt-2.5 mb-1 flex items-center gap-3 px-3 py-3",
        collapsed && "justify-center mx-1.5 px-2"
      )}>
        <div className={cn(
          "th-sidebar-brand-mark relative shrink-0",
          collapsed ? "h-9 w-9" : "h-10 w-10 sm:h-10 sm:w-10"
        )}>
          <Image
            src="/logo-mark.png"
            alt="TrishulHub"
            fill
            className="object-contain object-center !p-0"
            priority
            sizes="40px"
            data-no-warm
          />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-foreground text-[1.05rem] leading-tight tracking-tight truncate">
              TrishulHub
            </h1>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
              Technology
            </p>
          </div>
        )}
      </div>

      {/* Favorite pages — always in the side menu */}
      <div className={cn("th-sidebar-well mx-2.5 mb-2 px-1.5 pb-2 pt-1", collapsed && "mx-1.5 px-1")}>
          {!collapsed && (
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
              <p className="th-sidebar-section-label flex items-center gap-1.5">
                <Star className="h-3 w-3 fill-amber-500/70 text-amber-600" />
                Favorites
              </p>
              {favoritePages.length < 2 && (
                <button
                  type="button"
                  onClick={() => onNavigate("/dashboard#favorite-pages")}
                  className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  title="Add favorite on Home"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              )}
            </div>
          )}
          <div className={cn(collapsed && "flex flex-col items-center gap-1")}>
            {!favLoaded && favoritePages.length === 0 ? (
              !collapsed ? (
                <div className="th-sidebar-link w-full opacity-60 pointer-events-none">
                  <span className="th-sidebar-icon-wrap">
                    <Star className="h-[17px] w-[17px] text-amber-600" />
                  </span>
                  <span className="flex-1 truncate text-left text-muted-foreground">Loading…</span>
                </div>
              ) : (
                <div className="th-sidebar-link justify-center px-2 opacity-60" title="Loading favorites">
                  <span className="th-sidebar-icon-wrap mx-0">
                    <Star className="h-[17px] w-[17px] text-amber-600" />
                  </span>
                </div>
              )
            ) : favoritePages.length === 0 ? (
              !collapsed ? (
                <button
                  type="button"
                  onClick={() => onNavigate("/dashboard#favorite-pages")}
                  className="th-sidebar-link w-full border border-dashed border-amber-500/35 text-muted-foreground hover:border-amber-500/60"
                >
                  <span className="th-sidebar-icon-wrap">
                    <Plus className="h-[17px] w-[17px] text-amber-600" />
                  </span>
                  <span className="flex-1 truncate text-left">Add favorite page</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate("/dashboard#favorite-pages")}
                  className="th-sidebar-link justify-center px-2"
                  title="Add favorite page"
                  aria-label="Add favorite page"
                >
                  <span className="th-sidebar-icon-wrap mx-0">
                    <Star className="h-[17px] w-[17px] text-amber-600" />
                  </span>
                </button>
              )
            ) : (
              <LiquidNavRail
                activeKey={
                  favoritePages.find(
                    (f) =>
                      pathname === f.href ||
                      (f.href !== "/dashboard" && pathname.startsWith(f.href + "/"))
                  )?.href ??
                  favoritePages[0]?.href ??
                  ""
                }
                onActivate={onNavigate}
                className={cn("space-y-0.5", collapsed && "flex flex-col items-center gap-1")}
              >
              {favoritePages.map((fav) => {
                const Icon = iconForHref(fav.href);
                const isActive =
                  pathname === fav.href ||
                  (fav.href !== "/dashboard" && pathname.startsWith(fav.href + "/"));
                return (
                  <button
                    key={fav.href}
                    type="button"
                    onClick={() => onNavigate(fav.href)}
                    role="link"
                    aria-label={fav.title}
                    aria-current={isActive ? "page" : undefined}
                    title={collapsed ? fav.title : undefined}
                    {...liquidNavKey(fav.href)}
                    className={cn(
                      "th-sidebar-link",
                      liquidNavItemClass(isActive),
                      collapsed && "justify-center px-2"
                    )}
                  >
                    <span className={cn("th-sidebar-icon-wrap", collapsed && "mx-0")}>
                      <Icon className="h-[17px] w-[17px]" />
                    </span>
                    {!collapsed && <span className="flex-1 truncate text-left">{fav.title}</span>}
                  </button>
                );
              })}
              </LiquidNavRail>
            )}
          </div>
        </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-3">
        <nav className="space-y-2 px-2.5">
          {visibleGroups.map((group) => {
            const isOverview = group.label === "Overview";
            const hasActive = group.items.some((item) => isItemActive(item));
            const isExpanded = collapsed ? true : (expandedGroups[group.label] ?? false) || hasActive;
            const groupBadgeTotal = group.items.reduce(
              (sum, item) => sum + (badgeCounts[item.href] || 0),
              0
            );

            return (
              <div key={group.label} className="th-sidebar-well px-1 pt-1 pb-1.5">
                {!collapsed && !isOverview && (
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="th-sidebar-section-toggle flex items-center gap-2 w-full px-2.5 py-2 mb-0.5"
                    type="button"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 text-muted-foreground/50 transition-transform duration-200 shrink-0",
                        isExpanded && "rotate-180"
                      )}
                    />
                    <span className="th-sidebar-section-label flex-1 text-left">
                      {group.label}
                    </span>
                    {!isExpanded && groupBadgeTotal > 0 && (
                      <span className="h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                        {groupBadgeTotal > 99 ? "99+" : groupBadgeTotal}
                      </span>
                    )}
                  </button>
                )}
                {!collapsed && isOverview && (
                  <p className="th-sidebar-section-label px-2.5 py-2 mb-0.5">
                    {group.label}
                  </p>
                )}

                <div
                  className={cn(
                    "overflow-hidden transition-all duration-250 ease-out",
                    isExpanded ? "max-h-[800px] opacity-100" : collapsed ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
                  )}
                >
                  <LiquidNavRail
                    activeKey={
                      group.items.find((item) => isItemActive(item))?.href ??
                      group.items[0]?.href ??
                      ""
                    }
                    onActivate={(key) => {
                      const item = group.items.find((i) => i.href === key);
                      if (item?.children?.length) {
                        toggleItem(item.href);
                      } else if (item) {
                        onNavigate(item.href);
                      }
                    }}
                    className="space-y-0.5 pb-1"
                  >
                    {group.items.map((item) => {
                      const isActive = isItemActive(item);
                      const hasChildren = !!item.children && item.children.length > 0;
                      const isItemExpanded = hasChildren
                        ? collapsed
                          ? true
                          : (expandedItems[item.href] ?? false) || isActive
                        : false;

                      return (
                        <div key={item.href}>
                          <button
                            onClick={() => {
                              if (hasChildren) {
                                toggleItem(item.href);
                              } else {
                                onNavigate(item.href);
                              }
                            }}
                            role="link"
                            aria-label={item.title}
                            aria-current={isActive ? "page" : undefined}
                            title={collapsed ? item.title : undefined}
                            {...liquidNavKey(item.href)}
                            className={cn(
                              "th-sidebar-link",
                              liquidNavItemClass(isActive),
                              collapsed && "justify-center px-2"
                            )}
                            type="button"
                          >
                            <span className={cn("th-sidebar-icon-wrap", collapsed && "mx-0")}>
                              <item.icon className="h-[17px] w-[17px]" />
                            </span>
                            {!collapsed && (
                              <>
                                <span className="flex-1 truncate">{item.title}</span>
                                {hasChildren && (
                                  <ChevronRight
                                    className={cn(
                                      "h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200",
                                      isItemExpanded && "rotate-90"
                                    )}
                                  />
                                )}
                                {!hasChildren && badgeCounts[item.href] > 0 && (
                                  <Badge className="h-5 min-w-[20px] px-1.5 text-[10px] font-bold bg-destructive text-destructive-foreground">
                                    {badgeCounts[item.href] > 99 ? "99+" : badgeCounts[item.href]}
                                  </Badge>
                                )}
                              </>
                            )}
                            {collapsed && badgeCounts[item.href] > 0 && (
                              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
                            )}
                          </button>

                          {!collapsed && hasChildren && (
                            <div
                              className={cn(
                                "overflow-hidden transition-all duration-200 ease-out",
                                isItemExpanded ? "max-h-[320px] opacity-100" : "max-h-0 opacity-0"
                              )}
                            >
                              <LiquidNavRail
                                activeKey={
                                  item.children!.find((c) => isChildActive(c))?.href ??
                                  item.children![0]?.href ??
                                  ""
                                }
                                onActivate={onNavigate}
                                className="th-sidebar-child-rail space-y-0.5 mt-0.5 mb-1"
                              >
                                {item.children!.map((child) => {
                                  const childActive = isChildActive(child);
                                  return (
                                    <button
                                      key={child.href}
                                      onClick={() => onNavigate(child.href)}
                                      role="link"
                                      aria-label={child.title}
                                      aria-current={childActive ? "page" : undefined}
                                      {...liquidNavKey(child.href)}
                                      className={cn(
                                        "th-sidebar-sublink",
                                        childActive && "th-sidebar-sublink-active"
                                      )}
                                      type="button"
                                    >
                                      <child.icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                                      <span className="flex-1 truncate">{child.title}</span>
                                    </button>
                                  );
                                })}
                              </LiquidNavRail>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </LiquidNavRail>
                </div>

              </div>
            );
          })}
        </nav>
      </ScrollArea>
    </div>
  );
});

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  // Issue 2: When loaded inside a floating task board iframe (?embed=true),
  // hide sidebar, header, and nested floating board renderer — show ONLY task content
  // Using window.location.search instead of useSearchParams to avoid Suspense requirement
  const isEmbed = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("embed") === "true";
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadBadge, setUnreadBadge] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const notificationsFetchedAt = React.useRef(0);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>({ approvals: 0, leaveRequests: 0, total: 0 });
  const [navBadgeData, setNavBadgeData] = useState<NavBadgeMap>({});
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  const VALID_ROLES = ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "DEVELOPER", "CLIENT"] as const;
  const rawRole = session?.user?.role;
  const userRole = rawRole && VALID_ROLES.includes(rawRole as typeof VALID_ROLES[number])
    ? rawRole
    : "DEVELOPER";
  const userName = session?.user?.name || "User";
  const userEmail = session?.user?.email || "";
  const userId = session?.user?.id || "";
  const pageAccessMode = normalizePageAccessMode(session?.user?.pageAccessMode);
  const pageAccessPages = Array.isArray(session?.user?.pageAccessPages)
    ? session.user.pageAccessPages
    : [];

  const unreadFromList = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);
  const unreadCount = notifOpen ? unreadFromList : Math.max(unreadBadge, unreadFromList);

  const applyPendingCounts = useCallback((data: Record<string, unknown>) => {
    if (!data || typeof data !== "object" || data.error) return;
    setNavBadgeData(data as NavBadgeMap);
    setPendingCounts({
      approvals: (data["/dashboard/approvals"] || 0) as number,
      leaveRequests: (data["/dashboard/leaves"] || 0) as number,
      total: Object.values(data).reduce((sum: number, v) => sum + (v as number), 0),
    });
  }, []);

  /** One authenticated request for badge + avatar (avoids 3× session/Turso round-trips). */
  const fetchShellBootstrap = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/bootstrap/shell", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.unreadCount === "number") setUnreadBadge(data.unreadCount);
      if (data.pendingCounts && typeof data.pendingCounts === "object") {
        applyPendingCounts(data.pendingCounts as Record<string, unknown>);
      }
      const avatar = data.me?.avatar;
      setUserAvatar(typeof avatar === "string" && avatar.length > 0 ? avatar : null);
    } catch (err) {
      console.error("Failed to fetch shell bootstrap:", err);
    }
  }, [userId, applyPendingCounts]);

  const fetchUnreadCount = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/notifications?countOnly=true", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUnreadBadge(typeof data.unreadCount === "number" ? data.unreadCount : 0);
      }
    } catch (err) {
      console.error("Failed to fetch unread count:", err);
    }
  }, [userId]);

  const fetchNotifications = useCallback(async (force = false) => {
    if (!userId) return;
    // Skip refetch if list was loaded in the last 20s (smooth panel open)
    if (!force && Date.now() - notificationsFetchedAt.current < 20_000 && notifications.length > 0) {
      return;
    }
    try {
      const res = await fetch("/api/notifications?limit=50", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNotifications(safeArray<NotificationItem>(data?.notifications));
        if (typeof data.unreadCount === "number") setUnreadBadge(data.unreadCount);
        notificationsFetchedAt.current = Date.now();
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  }, [userId, notifications.length]);

  const fetchPendingCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals/pending-counts", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        applyPendingCounts(data as Record<string, unknown>);
      }
    } catch (err) {
      console.error("Failed to fetch pending counts:", err);
    }
  }, [applyPendingCounts]);

  // Fetch the current user's avatar (used in sidebar + user dropdown)
  const fetchUserAvatar = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/team?type=me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setUserAvatar(typeof data.avatar === "string" && data.avatar.length > 0 ? data.avatar : null);
      }
    } catch (err) {
      console.error("Failed to fetch user avatar:", err);
    }
  }, [userId]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    // SECURITY: CLIENT role users should be redirected to /portal, not /dashboard
    if (status === "authenticated" && userRole === "CLIENT") {
      router.push("/portal");
    }
  }, [status, router, userRole]);

  // Enforce per-user page ACL when navigating by URL (nav already hides items)
  useEffect(() => {
    if (status !== "authenticated" || userRole === "CLIENT") return;
    if (!isPageAccessAllowed(pathname, userRole, pageAccessMode, pageAccessPages)) {
      router.replace("/dashboard");
    }
  }, [status, userRole, pathname, pageAccessMode, pageAccessPages, router]);

  // Auto-collapse sidebar when navigating to workspace landing page
  useEffect(() => {
    if (pathname === "/dashboard/workspace") {
      setCollapsed(true);
    }
  }, [pathname]);

  // PERF: One shell bootstrap on mount; light polls keep badge fresh. Full list loads when panel opens.
  useEffect(() => {
    if (session) {
      const timer = setTimeout(() => {
        fetchShellBootstrap();
      }, 200);
      const interval = setInterval(() => {
        fetchUnreadCount();
        fetchPendingCounts();
      }, 120_000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [session, fetchShellBootstrap, fetchUnreadCount, fetchPendingCounts]);

  // Refresh avatar only after leaving settings
  const prevPathRef = React.useRef(pathname);
  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (prev?.startsWith("/dashboard/settings") && pathname && !pathname.startsWith("/dashboard/settings")) {
      fetchUserAvatar();
    }
  }, [pathname, fetchUserAvatar]);

  const markAsRead = useCallback(async (notifId: string) => {
    const target = notifications.find((n) => n.id === notifId);
    const wasUnread = !!(target && !target.isRead);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n))
    );
    if (wasUnread) setUnreadBadge((c) => Math.max(0, c - 1));
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: notifId, isRead: true }),
      });
      if (!res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === notifId ? { ...n, isRead: false } : n))
        );
        if (wasUnread) setUnreadBadge((c) => c + 1);
      }
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, isRead: false } : n))
      );
      if (wasUnread) setUnreadBadge((c) => c + 1);
    }
  }, [notifications]);

  const markAllAsRead = useCallback(async () => {
    const prev = notifications;
    const prevBadge = unreadBadge;
    // Optimistic — Mark all read feels instant
    setNotifications((list) => list.map((n) => ({ ...n, isRead: true })));
    setUnreadBadge(0);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ markAllRead: true }),
      });
      if (!res.ok) {
        setNotifications(prev);
        setUnreadBadge(prevBadge);
      }
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
      setNotifications(prev);
      setUnreadBadge(prevBadge);
    }
  }, [notifications, unreadBadge]);

  const deleteNotification = useCallback(async (notifId: string) => {
    const removed = notifications.find((n) => n.id === notifId);
    setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    if (removed && !removed.isRead) setUnreadBadge((c) => Math.max(0, c - 1));
    try {
      const res = await fetch(`/api/notifications?id=${notifId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && removed) {
        setNotifications((prev) => [removed, ...prev]);
        if (!removed.isRead) setUnreadBadge((c) => c + 1);
      }
    } catch (err) {
      console.error("Failed to delete notification:", err);
      if (removed) {
        setNotifications((prev) => [removed, ...prev]);
        if (!removed.isRead) setUnreadBadge((c) => c + 1);
      }
    }
  }, [notifications]);

  // Clickable notifications: mark read, then navigate to the linked page/section
  const handleNotificationClick = async (notif: NotificationItem) => {
    try {
      if (!notif.isRead) await markAsRead(notif.id);
    } catch (err) {
      console.error("Failed to mark notification as read on click:", err);
    }

    const link = typeof notif.link === "string" ? notif.link.trim() : "";
    if (!link) {
      setNotifOpen(false);
      return;
    }

    setNotifOpen(false);

    if (link.startsWith("/")) {
      router.push(link);
      return;
    }

    if (link.startsWith("http://") || link.startsWith("https://")) {
      window.open(link, "_blank", "noopener,noreferrer");
    }
  };

  const handleNavigate = (href: string) => {
    const hashIdx = href.indexOf("#");
    if (hashIdx >= 0) {
      const path = href.slice(0, hashIdx) || "/dashboard";
      const hash = href.slice(hashIdx + 1);
      if (pathname === path || pathname === `${path}/`) {
        if (typeof window !== "undefined") {
          window.location.hash = hash;
          window.dispatchEvent(new HashChangeEvent("hashchange"));
        }
      } else {
        router.push(href);
      }
    } else {
      router.push(href);
    }
    setMobileOpen(false);
  };

  // Safety timeout for session loading — show fallback after 3s (reduced from 5s/15s)
  const [sessionTimedOut, setSessionTimedOut] = useState(false);
  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => setSessionTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, [status]);

  if (status === "loading" && !sessionTimedOut) {
    return <LoadingScreen message="Loading workspace..." />;
  }

  if (sessionTimedOut && status === "loading") {
    return (
      <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-muted-foreground">Session is taking too long to load...</p>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
          >
            Sign In Again
          </button>
        </div>
      </div>
    );
  }

  if (!session) return null;
  // W3: Prevent CLIENT users from seeing any dashboard content before redirect
  if (userRole === "CLIENT") return null;

  // Embed mode: render ONLY the page content with no sidebar/header
  if (isEmbed) {
    return (
      <div className="h-screen w-full overflow-auto bg-background">
        {children}
      </div>
    );
  }

  return (
    <div className="th-app-shell h-[100vh] h-dvh flex overflow-hidden">
      {/* Desktop Sidebar — fixed height; scrolls independently of page content */}
      <aside
        className={cn(
          "hidden md:flex flex-col th-nav-glass th-sidebar-shell self-stretch mr-1 rounded-[32px] shrink-0 relative z-40 overflow-visible",
          collapsed ? "w-[72px] lg:w-[76px]" : "w-[240px] lg:w-[272px]"
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          userRole={userRole as UserRole}
          pathname={pathname}
          onNavigate={handleNavigate}
          badgeCounts={navBadgeData}
          pageAccessMode={pageAccessMode}
          pageAccessPages={pageAccessPages}
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-24 -right-3 z-20 h-7 w-7 rounded-full border bg-background/80 backdrop-blur-md shadow-sm hidden md:flex"
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Toggle sidebar"
        >
          <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform", collapsed && "rotate-180")} />
        </Button>
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          glassNav
          overlayClassName="th-nav-overlay"
          className="th-nav-drawer th-nav-glass rounded-[32px] p-0 gap-0 overflow-hidden border-0"
        >
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <SidebarContent
            collapsed={false}
            userRole={userRole as UserRole}
            pathname={pathname}
            onNavigate={handleNavigate}
            badgeCounts={navBadgeData}
            pageAccessMode={pageAccessMode}
            pageAccessPages={pageAccessPages}
          />
        </SheetContent>

      {/* Main Content — only this region scrolls with the page */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden pr-[env(safe-area-inset-right,0px)]">
        {/* Header - taller and more prominent */}
        <header className="min-h-14 sm:min-h-16 glass-topbar grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 sm:gap-2 px-2 sm:px-5 shrink-0 relative z-30">
          <div className="flex items-center gap-2 min-w-0 relative z-[1]">
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="md:hidden size-11 min-h-11 min-w-11 shrink-0 relative z-[2]" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <h2 className="text-sm sm:text-base font-semibold text-foreground truncate">
              {allNavItems.find((i) => pathname === i.href || (i.href !== "/dashboard" && pathname.startsWith(i.href + "/")))?.title || "Dashboard"}
            </h2>
          </div>

          <div className="flex items-center justify-center shrink-0 px-1">
            <ClockedInHeaderDot />
          </div>

          <div className="flex items-center justify-end gap-0.5 sm:gap-2 min-w-0">
            {/* Theme Selector Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" aria-label="Change theme">
                  {theme === "system" ? (
                    resolvedTheme === "dark" ? (
                      <Moon className="h-4 w-4" />
                    ) : (
                      <Sun className="h-4 w-4" />
                    )
                  ) : theme === "dark" ? (
                    <Moon className="h-4 w-4" />
                  ) : theme === "bluelight" ? (
                    <Eye className="h-4 w-4 text-amber-600" />
                  ) : (
                    <Sun className="h-4 w-4" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setTheme("light")} className={cn("flex items-center gap-3", theme === "light" && "bg-accent")}>
                  <Sun className="h-4 w-4" />
                  <span>Light Mode</span>
                  {theme === "light" && <Check className="h-3 w-3 ml-auto text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")} className={cn("flex items-center gap-3", theme === "dark" && "bg-accent")}>
                  <Moon className="h-4 w-4" />
                  <span>Dark Mode</span>
                  {theme === "dark" && <Check className="h-3 w-3 ml-auto text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("bluelight")} className={cn("flex items-center gap-3", theme === "bluelight" && "bg-accent")}>
                  <Eye className="h-4 w-4 text-amber-600" />
                  <div className="flex flex-col">
                    <span>Blue Light</span>
                    <span className="text-[10px] text-muted-foreground">Eye protection for long use</span>
                  </div>
                  {theme === "bluelight" && <Check className="h-3 w-3 ml-auto text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTheme("system")} className={cn("flex items-center gap-3", theme === "system" && "bg-accent")}>
                  <Monitor className="h-4 w-4" />
                  <span>System Default</span>
                  {theme === "system" && <Check className="h-3 w-3 ml-auto text-primary" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Sheet open={notifOpen} onOpenChange={(open) => {
              setNotifOpen(open);
              if (open) void fetchNotifications(false);
            }}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-8 w-8 sm:h-9 sm:w-9" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md p-0 gap-0 overflow-hidden flex flex-col">
                <SheetHeader className="p-4 pb-3 border-b pr-10 shrink-0">
                  <div className="flex items-center justify-between">
                    <SheetTitle className="text-sm font-semibold">Notifications</SheetTitle>
                    {unreadCount > 0 && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllAsRead}>
                        <Check className="h-3 w-3 mr-1" /> Mark all read
                      </Button>
                    )}
                  </div>
                </SheetHeader>
                <ScrollArea className="flex-1">
                  {notifications.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      <Bell className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p>No notifications yet</p>
                    </div>
                  ) : (
                    <div>
                      {notifications.map((notif) => {
                        const NotifIcon = notifIcons[notif.type] || Info;
                        const hasLink = !!(notif.link && notif.link.trim());
                        return (
                          <div
                            key={notif.id}
                            role="button"
                            tabIndex={0}
                            className={cn(
                              "flex items-start gap-3 p-3 hover:bg-accent/50 cursor-pointer transition-colors border-b last:border-0",
                              !notif.isRead && "bg-primary/5"
                            )}
                            onClick={() => handleNotificationClick(notif)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleNotificationClick(notif);
                              }
                            }}
                          >
                            <div className={cn(
                              "mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0",
                              notif.type === "ERROR" || notif.type === "WARNING" ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
                              notif.type === "SUCCESS" ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" :
                              notif.type === "TASK" || notif.type === "APPROVAL" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
                              notif.type === "AGENT" ? "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary" :
                              "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                            )}>
                              <NotifIcon className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className={cn("text-xs font-medium", !notif.isRead && "font-semibold")}>
                                  {safeText(notif.title, "")}
                                </span>
                                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                  {formatRelativeTime(notif.createdAt)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {safeText(notif.message, "")}
                              </p>
                              {hasLink && (
                                <p className="text-[10px] text-primary mt-1 font-medium">
                                  Open related page →
                                </p>
                              )}
                            </div>
                            {!notif.isRead && (
                              <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" aria-hidden />
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 shrink-0 opacity-40 hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification(notif.id);
                              }}
                              aria-label="Dismiss notification"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 h-8 sm:h-9" aria-label="Open user menu">
                  <Avatar className="h-8 w-8">
                    {userAvatar ? <AvatarImage src={userAvatar} alt={userName} /> : null}
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                      {userName.split(" ").filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm font-medium">{userName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="p-2">
                  <p className="text-sm font-medium">{userName}</p>
                  <p className="text-xs text-muted-foreground">{userEmail}</p>
                  <Badge variant="secondary" className="mt-1 text-xs">{userRole.replace("_", " ")}</Badge>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/dashboard/settings")}>
                  <Settings className="mr-2 h-4 w-4" /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => {
                  // Auto-minimize all floating boards before logout
                  // (floating board system removed — logout proceeds directly)
                  await signOut({ redirect: false });
                  router.push("/login");
                }}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content - more padding */}
        <main className="th-page-shell flex-1 min-h-0 max-w-full p-3 sm:p-4 md:p-6 lg:p-8 pb-[max(5rem,calc(3.5rem+env(safe-area-inset-bottom,0px)))] overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y">{children}</main>
      </div>
      </Sheet>

      {/* Agentation — visual feedback tool (SUPER_ADMIN only) */}
      {session?.user?.role === "SUPER_ADMIN" && <Agentation />}
    </div>
  );
}
