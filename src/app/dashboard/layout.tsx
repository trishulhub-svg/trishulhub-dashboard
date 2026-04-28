"use client";

import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Bot,
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
  XCircle,
  CalendarDays,
} from "lucide-react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
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

const navItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
  { title: "Agents", href: "/dashboard/agents", icon: Bot, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
  { title: "CRM", href: "/dashboard/crm", icon: Crosshair, roles: ["SUPER_ADMIN", "ADMIN"] },
  { title: "Projects", href: "/dashboard/projects", icon: FolderKanban, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
  { title: "Finance", href: "/dashboard/finance", icon: DollarSign, roles: ["SUPER_ADMIN", "ADMIN"] },
  { title: "Team", href: "/dashboard/team", icon: Users, roles: ["SUPER_ADMIN"] },
  { title: "Leave", href: "/dashboard/leave", icon: CalendarDays, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
  { title: "API Keys", href: "/dashboard/api-keys", icon: Key, roles: ["SUPER_ADMIN"] },
  { title: "Approvals", href: "/dashboard/approvals", icon: Shield, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
  { title: "Settings", href: "/dashboard/settings", icon: Settings, roles: ["SUPER_ADMIN", "ADMIN", "DEVELOPER"] },
];

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
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
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
  const filteredNavItems = navItems.filter((item) => item.roles.includes(userRole));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border">
        <Image
          src="/200px.png"
          alt="TrishulHub"
          width={28}
          height={28}
          className="rounded"
          priority
        />
        {!collapsed && (
          <div>
            <h1 className="font-bold text-sidebar-primary text-lg leading-tight">TrishulHub</h1>
            <p className="text-xs text-muted-foreground">AI Agent Dashboard</p>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 py-2">
        <nav className="space-y-1 px-2">
          {filteredNavItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <button
                key={item.href}
                onClick={() => onNavigate(item.href)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors w-full text-left",
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className={cn("h-4 w-4 shrink-0", collapsed && "mx-auto")} />
                {!collapsed && <span>{item.title}</span>}
              </button>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="border-t border-sidebar-border p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {userName.split(" ").map((n) => n[0]).join("")}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-muted-foreground truncate">{userRole}</p>
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

  const userRole = (session?.user as { role?: string })?.role as UserRole || "DEVELOPER";
  const userName = session?.user?.name || "User";
  const userEmail = session?.user?.email || "";
  const userId = (session?.user as { id?: string })?.id || "";

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch("/api/notifications?userId=" + userId, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch {
      // ignore
    }
  }, [userId]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetchNotifications();
      // Poll every 30 seconds for new notifications
      const interval = setInterval(fetchNotifications, 30000);
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
    } catch {
      // ignore
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
      await Promise.all(unreadIds.map((id) => markAsRead(id)));
    } catch {
      // ignore
    }
  };

  const deleteNotification = async (notifId: string) => {
    try {
      await fetch(`/api/notifications?id=${notifId}`, {
        method: "DELETE",
        credentials: "include",
      });
      setNotifications((prev) => prev.filter((n) => n.id !== notifId));
    } catch {
      // ignore
    }
  };

  const handleNavigate = (href: string) => {
    router.push(href);
    setMobileOpen(false);
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce" />
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-300 relative",
          collapsed ? "w-16" : "w-64"
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
          className="absolute top-20 -right-3 z-10 h-6 w-6 rounded-full border bg-background shadow-sm hidden md:flex"
          onClick={() => setCollapsed(!collapsed)}
        >
          <ChevronLeft className={cn("h-3 w-3 transition-transform", collapsed && "rotate-180")} />
        </Button>
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar">
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
        {/* Header */}
        <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
            </Sheet>
            <h2 className="text-sm font-medium text-muted-foreground hidden sm:block">
              {navItems.find((i) => pathname === i.href || (i.href !== "/dashboard" && pathname.startsWith(i.href)))?.title || "Dashboard"}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>

            {/* Notifications Dropdown */}
            <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
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
                            if (notif.link) {
                              router.push(notif.link);
                              setNotifOpen(false);
                            }
                          }}
                        >
                          <div className={cn(
                            "mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0",
                            notif.type === "ERROR" || notif.type === "WARNING" ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
                            notif.type === "SUCCESS" ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" :
                            notif.type === "TASK" || notif.type === "APPROVAL" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
                            notif.type === "AGENT" ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" :
                            "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          )}>
                            <NotifIcon className="h-3 w-3" />
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
                            className="h-5 w-5 shrink-0 opacity-0 hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notif.id);
                            }}
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
                <Button variant="ghost" className="flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {userName.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:block text-sm">{userName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="p-2">
                  <p className="text-sm font-medium">{userName}</p>
                  <p className="text-xs text-muted-foreground">{userEmail}</p>
                  <Badge variant="secondary" className="mt-1 text-xs">{userRole}</Badge>
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

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
