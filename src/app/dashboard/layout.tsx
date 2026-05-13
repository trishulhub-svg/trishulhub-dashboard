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
  Video,
  GraduationCap,
  BookOpen,
  CalendarRange,
} from "lucide-react";
import Image from "next/image";
import LoadingScreen from "@/components/ui/loading-screen";
import { useTheme } from "next-themes";
import { useState, useEffect, useCallback } from "react";

import { cn, safeArray, safeDateStr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  SheetTrigger,
} from "@/components/ui/sheet";
import type { UserRole } from "@/lib/types";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
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
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
      { title: "Workspace", href: "/dashboard/agents", icon: Rocket, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
    ],
  },
  {
    label: "Business",
    items: [
      { title: "CRM", href: "/dashboard/crm", icon: Crosshair, roles: ["SUPER_ADMIN", "ADMIN"] },
      { title: "Clients", href: "/dashboard/clients", icon: Briefcase, roles: ["SUPER_ADMIN", "ADMIN"] },
      { title: "Projects", href: "/dashboard/projects", icon: FolderKanban, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
      { title: "Finance", href: "/dashboard/finance", icon: DollarSign, roles: ["SUPER_ADMIN", "ADMIN"] },
    ],
  },
  {
    label: "Team & Work",
    items: [
      { title: "Team", href: "/dashboard/team", icon: Users, roles: ["SUPER_ADMIN", "ADMIN"] },
      { title: "Time Tracking", href: "/dashboard/time-tracking", icon: Clock, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
      { title: "Time Table", href: "/dashboard/timetable", icon: CalendarRange, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
      { title: "Meetings", href: "/dashboard/meetings", icon: Video, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
    ],
  },
  {
    label: "HR & People",
    items: [
      { title: "Leaves", href: "/dashboard/leaves", icon: CalendarDays, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
      { title: "Availability", href: "/dashboard/availability", icon: Clock, roles: ["SUPER_ADMIN", "ADMIN"] },
      { title: "Approvals", href: "/dashboard/approvals", icon: Shield, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
    ],
  },
  {
    label: "Learning",
    items: [
      { title: "Training", href: "/dashboard/training", icon: GraduationCap, roles: ["SUPER_ADMIN", "ADMIN"] },
      { title: "My Training", href: "/dashboard/my-training", icon: BookOpen, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
    ],
  },
  {
    label: "System",
    items: [
      { title: "API Keys", href: "/dashboard/api-keys", icon: Key, roles: ["SUPER_ADMIN"] },
      { title: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
    ],
  },
];

// Flat list for header title lookup (order-independent)
const allNavItems = navGroups.flatMap((g) => g.items);

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

function SidebarContent({
  collapsed,
  userRole,
  userName,
  pathname,
  onNavigate,
}: {
  collapsed: boolean;
  userRole: UserRole;
  userName: string;
  pathname: string;
  onNavigate: (href: string) => void;
}) {
  // Filter groups: only show groups that have at least one visible item for this role
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.roles.includes(userRole)),
    }))
    .filter((group) => group.items.length > 0);

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
      <ScrollArea className="flex-1 py-3">
        <nav className="space-y-5 px-3">
          {visibleGroups.map((group, groupIdx) => (
            <div key={group.label}>
              {/* Section header — hidden when sidebar is collapsed */}
              {!collapsed && (
                <p className="px-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 select-none">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
                  return (
                    <button
                      key={item.href}
                      onClick={() => onNavigate(item.href)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors w-full text-left",
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                      type="button"
                    >
                      <item.icon className={cn("h-5 w-5 shrink-0", collapsed && "mx-auto")} />
                      {!collapsed && <span>{item.title}</span>}
                    </button>
                  );
                })}
              </div>
              {/* Separator between groups (not after last group) */}
              {groupIdx < visibleGroups.length - 1 && !collapsed && (
                <div className="mt-4 border-t border-sidebar-border/50" />
              )}
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* User Section */}
      <div className="border-t border-sidebar-border p-4">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
              {userName.split(" ").map((n) => n[0]).join("")}
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
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  const userRole = session?.user?.role as UserRole || "DEVELOPER";
  const userName = session?.user?.name || "User";
  const userEmail = session?.user?.email || "";
  const userId = session?.user?.id || "";

  const unreadCount = notifications.filter((n) => !n.isRead).length;

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

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    // SECURITY: CLIENT role users should be redirected to /portal, not /dashboard
    if (status === "authenticated" && userRole === "CLIENT") {
      router.push("/portal");
    }
  }, [status, router, userRole]);

  useEffect(() => {
    if (session) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 45000);
      return () => clearInterval(interval);
    }
  }, [session, fetchNotifications]);

  const markAsRead = async (notifId: string) => {
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
  };

  const markAllAsRead = async () => {
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
  };

  const deleteNotification = async (notifId: string) => {
    try {
      await fetch(`/api/notifications?id=${notifId}`, {
        method: "DELETE",
        credentials: "include",
      });
      setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    } catch (err) {
      console.error("Failed to delete notification:", err);
    }
  };

  const handleNavigate = (href: string) => {
    router.push(href);
    setMobileOpen(false);
  };

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (!session) return null;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar - wider and more spacious */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-300 relative",
          collapsed ? "w-[72px]" : "w-[280px]"
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          userRole={userRole}
          userName={userName}
          pathname={pathname}
          onNavigate={handleNavigate}
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
            pathname={pathname}
            onNavigate={handleNavigate}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header - taller and more prominent */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-5 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
            </Sheet>
            <h2 className="text-base font-semibold text-foreground">
              {allNavItems.find((i) => pathname === i.href || (i.href !== "/dashboard" && pathname.startsWith(i.href + "/")))?.title || "Dashboard"}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme Selector Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Change theme">
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

            {/* Notifications Dropdown */}
            <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between p-3 border-b">
                  <span className="text-sm font-semibold">Notifications</span>
                  {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllAsRead}>
                      <Check className="h-3 w-3 mr-1" /> Mark all read
                    </Button>
                  )}
                </div>
                <ScrollArea className="max-h-80">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      No notifications yet
                    </div>
                  ) : (
                    notifications.slice(0, 20).map((notif) => {
                      const NotifIcon = notifIcons[notif.type] || Info;
                      return (
                        <div
                          key={notif.id}
                          className={cn(
                            "flex items-start gap-3 p-3 hover:bg-accent/50 cursor-pointer transition-colors border-b last:border-0",
                            !notif.isRead && "bg-primary/5"
                          )}
                          onClick={async () => {
                            if (!notif.isRead) await markAsRead(notif.id);
                            if (notif.link && notif.link.startsWith("/")) {
                              router.push(notif.link);
                              setNotifOpen(false);
                            }
                          }}
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
                                {notif.title}
                              </span>
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                {formatRelativeTime(notif.createdAt)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {notif.message}
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
                    })
                  )}
                </ScrollArea>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 h-9">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                      {userName.split(" ").map((n) => n[0]).join("")}
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
                <DropdownMenuItem onClick={async () => { await signOut({ redirect: false }); router.push("/login"); }}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content - more padding */}
        <main className="flex-1 p-5 md:p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
