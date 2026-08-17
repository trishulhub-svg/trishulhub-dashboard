"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, FolderKanban, FileText, HeadphonesIcon,
  LogOut, Menu,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet, SheetContent, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const portalNav = [
  { title: "Dashboard", href: "/portal", icon: LayoutDashboard },
  { title: "My Projects", href: "/portal/projects", icon: FolderKanban },
  { title: "Invoices", href: "/portal/invoices", icon: FileText },
  { title: "Support", href: "/portal/support", icon: HeadphonesIcon },
];

function NavItems({ pathname, onNavigate, onNavClick }: { pathname: string; onNavigate: (href: string) => void; onNavClick?: () => void }) {
  return (
    <nav className="space-y-1" aria-label="Portal navigation">
      {portalNav.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/portal" && pathname.startsWith(item.href + "/"));
        return (
          <button
            key={item.href}
            onClick={() => { onNavigate(item.href); onNavClick?.(); }}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors w-full text-left",
              isActive
                ? "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
                : "text-foreground hover:bg-muted/70"
            )}
            type="button"
          >
            <item.icon className="h-4 w-4" />
            <span>{item.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    // CRITICAL FIX: Redirect non-CLIENT users away from portal
    // Previously any authenticated user could access portal pages
    if (status === "authenticated" && session?.user) {
      const userRole = session.user.role
      if (!userRole || userRole !== "CLIENT") {
        router.push("/dashboard");
      }
    }
  }, [status, session, router]);

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

  // SECURITY: Prevent non-CLIENT users from seeing portal content (even briefly)
  if (!session || !session.user?.role || session.user.role !== "CLIENT") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <h2 className="text-xl font-bold">Access Denied</h2>
          <p className="text-muted-foreground">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const userName = session.user?.name || "Client";

  const handleNavigate = (href: string) => {
    router.push(href);
  };

  return (
    <div className="th-app-shell min-h-screen min-h-dvh flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-border glass-topbar">
        <div className="flex items-center justify-between h-14 px-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden size-11 min-h-11 min-w-11" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                glassNav
                overlayClassName="th-nav-overlay"
                className="th-nav-drawer th-nav-glass w-64 rounded-[32px] p-4 border-0"
              >
                <SheetTitle className="sr-only">Portal navigation</SheetTitle>
                <div className="flex items-center gap-2 mb-4">
                  <Image
                    src="/200px.png"
                    alt="TrishulHub"
                    width={24}
                    height={24}
                    className="rounded"
                  />
                  <span className="font-bold tracking-tight text-foreground">TrishulHub</span>
                </div>
                <NavItems pathname={pathname} onNavigate={handleNavigate} onNavClick={() => setSheetOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2">
              <Image
                src="/200px.png"
                alt="TrishulHub"
                width={24}
                height={24}
                className="rounded"
              />
              <h1 className="font-bold tracking-tight text-foreground hidden sm:block">TrishulHub</h1>
            </div>
            <div className="hidden md:flex items-center gap-1">
              <NavItems pathname={pathname} onNavigate={handleNavigate} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:block">{userName}</span>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {userName.split(" ").map((n) => n[0]).join("")}
              </AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="icon" onClick={() => { signOut({ callbackUrl: "/login" }); }} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="th-page-shell flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">{children}</main>

      {/* Footer */}
      <footer className="border-t glass-topbar py-4 text-center text-xs text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} TrishulHub. AI-Powered Web Development Platform.</p>
      </footer>
    </div>
  );
}
