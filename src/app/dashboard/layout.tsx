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
  X,
  XCircle,
  CalendarDays,
  Monitor,
  Eye,
  Briefcase,
  Clock,
  GraduationCap,
  BookOpen,
  KeyRound,
  ScrollText,
  FlaskConical,

  FileText,
  ChevronRight,
  IdCard,
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

// Navigation organized into logical groups — industry-grade layout
const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "DEVELOPER"] },
      { title: "Workspace", href: "/dashboard/workspace", icon: Rocket, roles: ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "DEVELOPER"] },
    ],
  },
  {
    label: "Business",
    items: [
      { title: "CRM", href: "/dashboard/crm", icon: Crosshair, roles: ["SUPER_ADMIN", "ADMIN"] },
      { title: "Clients", href: "/dashboard/clients", icon: Briefcase, roles: ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER"] },
      { title: "Projects", href: "/dashboard/projects", icon: FolderKanban, roles: ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER"] },
      { title: "Demo Projects", href: "/dashboard/demo", icon: FlaskConical, roles: ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER"] },
      { title: "Finance", href: "/dashboard/finance", icon: DollarSign, roles: ["SUPER_ADMIN", "ADMIN"] },
    ],
  },
  {
    label: "Team & Work",
    items: [
      { title: "Team", href: "/dashboard/team", icon: Users, roles: ["SUPER_ADMIN", "ADMIN"] },
      { title: "Time Tracking", href: "/dashboard/time-tracking", icon: Clock, roles: ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "DEVELOPER"] },
    ],
  },
  {
    label: "HR & People",
    items: [
      { title: "My Leaves", href: "/dashboard/leaves", icon: CalendarDays, roles: ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "DEVELOPER"] },
      { title: "My Details", href: "/dashboard/my-details", icon: IdCard, roles: ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "DEVELOPER"] },
      { title: "Availability", href: "/dashboard/availability", icon: Clock, roles: ["SUPER_ADMIN", "ADMIN"] },
      { title: "Approvals", href: "/dashboard/approvals", icon: Shield, roles: ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER"] },
    ],
  },
  {
    label: "Learning",
    items: [
      { title: "Training", href: "/dashboard/training", icon: GraduationCap, roles: ["SUPER_ADMIN", "ADMIN"] },
      { title: "My Training", href: "/dashboard/my-training", icon: BookOpen, roles: ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "DEVELOPER"] },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Audit Trail", href: "/dashboard/audit-trail", icon: ScrollText, roles: ["SUPER_ADMIN", "ADMIN"] },
      { title: "API Keys", href: "/dashboard/api-keys", icon: Key, roles: ["SUPER_ADMIN"] },
      {
        title: "Access Hub",
        href: "/dashboard/access-hub",
        icon: KeyRound,
        roles: ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "DEVELOPER"],
        children: [
          { title: "Credentials", href: "/dashboard/access-hub?tab=credentials", icon: Shield, roles: ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "DEVELOPER"] },
          { title: "Protocol", href: "/dashboard/access-hub?tab=protocol", icon: FileText, roles: ["SUPER_ADMIN", "ADMIN"] },
          { title: "System Config", href: "/dashboard/access-hub?tab=system", icon: Settings, roles: ["SUPER_ADMIN", "ADMIN"] },
        ],
      },
      { title: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "DEVELOPER"] },
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
  userName,
  userAvatar,
  pathname,
  onNavigate,
  badgeCounts,
}: {
  collapsed: boolean;
  userRole: UserRole;
  userName: string;
  userAvatar?: string | null;
  pathname: string;
  onNavigate: (href: string) => void;
  badgeCounts: Record<string, number>;
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

  // Filter groups: only show groups that have at least one visible item for this role
  // Parent items are visible if their role matches OR any child's role matches
  // Children within parent items are filtered by role
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => {
          if (item.children) {
            const visibleChildren = item.children.filter((c) => c.roles.includes(userRole));
            // Show parent if parent role matches or any visible child exists
            if (item.roles.includes(userRole) || visibleChildren.length > 0) {
              return { ...item, children: visibleChildren };
            }
            return null;
          }
          return item.roles.includes(userRole) ? item : null;
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

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const toggleItem = (href: string) => {
    setExpandedItems((prev) => ({ ...prev, [href]: !prev[href] }));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo Section */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-5 border-b border-sidebar-border",
        collapsed && "justify-center px-2"
      )}>
        <div className={cn(
          "relative shrink-0",
          collapsed ? "h-10 w-10" : "h-11 w-11"
        )}>
          <Image
            src="/200px.png"
            alt="TrishulHub"
            fill
            className="rounded-lg object-contain"
            priority
            sizes="(max-width: 768px) 44px, 44px"
          />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="font-extrabold text-sidebar-primary text-xl leading-tight tracking-tight">TrishulHub</h1>
            <p className="text-[11px] text-muted-foreground font-medium">AI Workspace</p>
          </div>
        )}
      </div>

      {/* Navigation with grouped sections */}
      <ScrollArea className="flex-1 py-2">
        <nav className="space-y-2 px-3">
          {visibleGroups.map((group, groupIdx) => {
            const isOverview = group.label === "Overview";
            const hasActive = group.items.some((item) => isItemActive(item));
            // When sidebar is collapsed, show all expanded. Otherwise, expand if explicitly toggled OR if group contains active page
            const isExpanded = collapsed ? true : (expandedGroups[group.label] ?? false) || hasActive;
            // Count badges for the group (for collapsed header indicator)
            const groupBadgeTotal = group.items.reduce((sum, item) => sum + (badgeCounts[item.href] || 0), 0);

            return (
              <div key={group.label}>
                {/* Collapsible section header — clickable to toggle */}
                {!collapsed && !isOverview && (
                  <button
                    onClick={() => toggleGroup(group.label)}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-left group/section transition-all duration-200 hover:bg-sidebar-accent/50"
                    type="button"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-300 ease-in-out shrink-0",
                        isExpanded && "rotate-180"
                      )}
                    />
                    <span className={cn(
                      "text-[11px] font-semibold uppercase tracking-widest select-none transition-colors",
                      isExpanded ? "text-muted-foreground" : "text-muted-foreground/40"
                    )}>
                      {group.label}
                    </span>
                    {/* Badge count on group header when collapsed */}
                    {!isExpanded && groupBadgeTotal > 0 && (
                      <span className="ml-auto h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                        {groupBadgeTotal > 99 ? "99+" : groupBadgeTotal}
                      </span>
                    )}
                    {/* Active indicator dot when collapsed */}
                    {!isExpanded && hasActive && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </button>
                )}
                {/* Overview label — non-clickable, always visible */}
                {!collapsed && isOverview && (
                  <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 select-none">
                    {group.label}
                  </p>
                )}
                {/* Nav items with expand/collapse animation */}
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-300 ease-in-out",
                    isExpanded ? "max-h-[600px] opacity-100" : collapsed ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
                  )}
                >
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const isActive = isItemActive(item);
                      const hasChildren = !!item.children && item.children.length > 0;
                      const isItemExpanded = hasChildren ? (collapsed ? true : (expandedItems[item.href] ?? false) || isActive) : false;

                      return (
                        <div key={item.href}>
                          <button
                            onClick={() => {
                              if (hasChildren) {
                                // Only toggle expand/collapse — don't navigate to parent
                                toggleItem(item.href);
                              } else {
                                onNavigate(item.href);
                              }
                            }}
                            role="link"
                            aria-label={item.title}
                            className={cn(
                              "relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 w-full text-left",
                              isActive
                                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            )}
                            type="button"
                          >
                            <item.icon className={cn("h-[18px] w-[18px] shrink-0", collapsed && "mx-auto")} />
                            {!collapsed && <span className="flex-1 text-left">{item.title}</span>}
                            {!collapsed && hasChildren && (
                              <ChevronRight
                                className={cn(
                                  "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                                  isItemExpanded && "rotate-90"
                                )}
                              />
                            )}
                            {!collapsed && !hasChildren && badgeCounts[item.href] > 0 && (
                              <Badge className="h-5 min-w-[20px] px-1.5 text-[10px] font-bold bg-destructive text-destructive-foreground">
                                {badgeCounts[item.href] > 99 ? "99+" : badgeCounts[item.href]}
                              </Badge>
                            )}
                            {collapsed && badgeCounts[item.href] > 0 && (
                              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
                            )}
                          </button>
                          {/* Sub-items for items with children */}
                          {!collapsed && hasChildren && (
                            <div
                              className={cn(
                                "overflow-hidden transition-all duration-200 ease-in-out",
                                isItemExpanded ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
                              )}
                            >
                              <div className="ml-4 pl-3 border-l border-sidebar-border/30 space-y-0.5 mt-0.5 mb-1">
                                {item.children!.map((child) => {
                                  const childActive = isChildActive(child);
                                  return (
                                    <button
                                      key={child.href}
                                      onClick={() => onNavigate(child.href)}
                                      role="link"
                                      aria-label={child.title}
                                      className={cn(
                                        "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200 w-full text-left",
                                        childActive
                                          ? "bg-sidebar-primary/10 text-sidebar-primary font-semibold"
                                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                                      )}
                                      type="button"
                                    >
                                      <child.icon className="h-3.5 w-3.5 shrink-0" />
                                      <span className="flex-1 text-left truncate">{child.title}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Separator between groups (not after last group) */}
                {groupIdx < visibleGroups.length - 1 && !collapsed && (
                  <div className={cn("mt-2 mb-1 border-t border-sidebar-border/20 transition-opacity duration-300", isExpanded ? "opacity-100" : "opacity-0")} />
                )}
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      {/* User Section */}
      <div className="border-t border-sidebar-border p-4">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <Avatar className="h-10 w-10">
            {userAvatar ? <AvatarImage src={userAvatar} alt={userName} /> : null}
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
              {userName.split(" ").filter(Boolean).map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{userRole.replace("_", " ")}</p>
            </div>
          )}
        </div>
      </div>
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
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>({ approvals: 0, leaveRequests: 0, total: 0 });
  const [navBadgeData, setNavBadgeData] = useState<NavBadgeMap>({});
  const [userAvatar, setUserAvatar] = useState<string | null>(null);

  const VALID_ROLES = ["SUPER_ADMIN", "ADMIN", "PROJECT_MANAGER", "DEVELOPER", "VIEWER", "CLIENT"] as const;
  const rawRole = session?.user?.role;
  const userRole = rawRole && VALID_ROLES.includes(rawRole as typeof VALID_ROLES[number])
    ? rawRole
    : "DEVELOPER";
  const userName = session?.user?.name || "User";
  const userEmail = session?.user?.email || "";
  const userId = session?.user?.id || "";

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  // Badge count mapping: use API response directly (role-aware for all users)

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/notifications", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNotifications(safeArray<NotificationItem>(data));
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  }, [userId]);

  const fetchPendingCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/approvals/pending-counts", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        // API returns a flat map of nav-href → count
        if (data && typeof data === "object" && !data.error) {
          setNavBadgeData(data as NavBadgeMap);
          // Backward compat: also populate old format for any other consumers
          setPendingCounts({
            approvals: (data["/dashboard/approvals"] || 0) as number,
            leaveRequests: (data["/dashboard/team"] || 0) as number,

            total: Object.values(data).reduce((sum: number, v) => sum + (v as number), 0),
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch pending counts:", err);
    }
  }, []);

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

  // Auto-collapse sidebar when navigating to workspace landing page
  useEffect(() => {
    if (pathname === "/dashboard/workspace") {
      setCollapsed(true);
    }
  }, [pathname]);

  // PERF: Defer notification + counts fetch by 200ms so page data loads first.
  // Notifications are non-critical UI — they should not compete with the
  // page's own API calls for network bandwidth on navigation.
  useEffect(() => {
    if (session) {
      const timer = setTimeout(() => {
        fetchNotifications();
        fetchPendingCounts();
        fetchUserAvatar();
      }, 200);
      const interval = setInterval(() => {
        fetchNotifications();
        fetchPendingCounts();
      }, 45000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
      };
    }
  }, [session, fetchNotifications, fetchPendingCounts, fetchUserAvatar]);

  // Refresh avatar when leaving the settings page (user may have updated it)
  useEffect(() => {
    if (pathname && pathname !== "/dashboard/settings") {
      fetchUserAvatar();
    }
  }, [pathname, fetchUserAvatar]);

  const markAsRead = useCallback(async (notifId: string) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: notifId, isRead: true }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      // PERF FIX: Single batch request instead of N parallel requests
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ markAllRead: true }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      }
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
    }
  }, []);

  const deleteNotification = useCallback(async (notifId: string) => {
    try {
      await fetch(`/api/notifications?id=${notifId}`, {
        method: "DELETE",
        credentials: "include",
      });
      setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  }, []);

  // I7: Extracted notification click handler from inline async in JSX
  const handleNotificationClick = async (notif: NotificationItem) => {
    try {
      if (!notif.isRead) await markAsRead(notif.id);
    } catch {}
    if (notif.link && notif.link.startsWith("/")) {
      router.push(notif.link);
      setNotifOpen(false);
    }
  };

  const handleNavigate = (href: string) => {
    router.push(href);
    setMobileOpen(false);
  };

  // Safety timeout for session loading — show fallback after 5s (reduced from 15s)
  const [sessionTimedOut, setSessionTimedOut] = useState(false);
  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => setSessionTimedOut(true), 5000);
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
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar - wider and more spacious */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-300 relative z-40 liquid-glass-sidebar",
          collapsed ? "w-[72px]" : "w-[280px]"
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          userRole={userRole}
          userName={userName}
          userAvatar={userAvatar}
          pathname={pathname}
          onNavigate={handleNavigate}
          badgeCounts={navBadgeData}
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-24 -right-3 z-10 h-7 w-7 rounded-full border bg-background shadow-sm hidden md:flex"
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Toggle sidebar"
        >
          <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform", collapsed && "rotate-180")} />
        </Button>
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] p-0 bg-sidebar">
          <div className="flex items-center justify-end p-2 pb-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <SidebarContent
            collapsed={false}
            userRole={userRole}
            userName={userName}
            userAvatar={userAvatar}
            pathname={pathname}
            onNavigate={handleNavigate}
            badgeCounts={navBadgeData}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header - taller and more prominent */}
        <header className="h-14 sm:h-16 glass-topbar flex items-center justify-between px-3 sm:px-5 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <h2 className="text-sm sm:text-base font-semibold text-foreground truncate">
              {allNavItems.find((i) => pathname === i.href || (i.href !== "/dashboard" && pathname.startsWith(i.href + "/")))?.title || "Dashboard"}
            </h2>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Theme Selector Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" aria-label="Change theme">
                  {theme === "system" ? (
                    <Monitor className="h-4 w-4" />
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

            {/* Notifications Sheet — better scroll on all devices */}
            <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
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
              <SheetContent className="w-full sm:max-w-md p-0 overflow-hidden flex flex-col">
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
                      {notifications.slice(0, 50).map((notif) => {
                        const NotifIcon = notifIcons[notif.type] || Info;
                        return (
                          <div
                            key={notif.id}
                            className={cn(
                              "flex items-start gap-3 p-3 hover:bg-accent/50 cursor-pointer transition-colors border-b last:border-0",
                              !notif.isRead && "bg-primary/5"
                            )}
                            onClick={() => handleNotificationClick(notif)}
                          >
                            <div className={cn(
                              "mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0",
                              notif.type === "ERROR" || notif.type === "WARNING" ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
                              notif.type === "SUCCESS" ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" :
                              notif.type === "TASK" || notif.type === "APPROVAL" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
                              notif.type === "AGENT" ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" :
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
                            </div>
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
                      {/* W8: Show indicator when notifications are capped at 50 */}
                      {notifications.length > 50 && (
                        <span className="text-xs text-center text-muted-foreground block py-2">
                          View all {notifications.length} notifications
                        </span>
                      )}
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
        <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 overflow-auto">{children}</main>
      </div>

      {/* Agentation — visual feedback tool (all users) */}
      <Agentation />
    </div>
  );
}
