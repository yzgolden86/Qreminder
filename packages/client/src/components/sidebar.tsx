import { useEffect, useRef, useState } from "react";
import Link, { NavLink } from "@/components/router-link";
import { useRouter } from "@/lib/router";
import {
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/lib/theme-provider";
import { useToast } from "@/hooks/use-toast";
import { QreminderLogo } from "@/components/icons/qreminder-logo";
import { writeAppearancePendingToStorage } from "@/lib/theme-storage";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/i18n/I18nProvider";
import { useAccountIdentity } from "@/modules/settings/application/use-account-email";
import type { MessageKey } from "@/i18n/messages";

type NavIconKey = "dashboard" | "calendar" | "cards" | "notifications" | "payments" | "budgets" | "workspaces" | "annualReport" | "admin" | "auditLogs" | "diagnostics" | "settings";

interface NavItem {
  path: string;
  labelKey: MessageKey;
  icon: NavIconKey;
  adminOnly?: boolean;
  end?: boolean;
}

const primaryNav: NavItem[] = [
  { path: "/", labelKey: "nav.subscriptions", icon: "dashboard", end: true },
  { path: "/calendar", labelKey: "nav.calendar", icon: "calendar" },
  { path: "/cards", labelKey: "nav.cards", icon: "cards" },
  { path: "/payments", labelKey: "nav.payments", icon: "payments" },
  { path: "/budgets", labelKey: "nav.budgets", icon: "budgets" },
  { path: "/notifications", labelKey: "nav.notifications", icon: "notifications" },
  { path: "/workspaces", labelKey: "nav.workspaces", icon: "workspaces" },
  { path: "/annual-report", labelKey: "nav.annualReport", icon: "annualReport" },
];

const systemNav: NavItem[] = [
  { path: "/admin/users", labelKey: "nav.adminUsers", icon: "admin", adminOnly: true },
  { path: "/admin/diagnostics", labelKey: "nav.diagnostics", icon: "diagnostics", adminOnly: true },
  { path: "/admin/audit-logs", labelKey: "nav.auditLogs", icon: "auditLogs", adminOnly: true },
  { path: "/settings", labelKey: "nav.settings", icon: "settings" },
];

// --- PLACEHOLDER_ICONS ---

function NavIconDashboard({ className, isActive }: { className?: string; isActive?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="2" y="2" width="7" height="7" rx="2" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 1 : 0.6} />
      <rect x="11" y="2" width="7" height="4" rx="1.5" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.7 : 0.4} />
      <rect x="11" y="8" width="7" height="10" rx="2" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.5 : 0.3} />
      <rect x="2" y="11" width="7" height="7" rx="2" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.7 : 0.4} />
    </svg>
  );
}

function NavIconCalendar({ className, isActive }: { className?: string; isActive?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="2" y="4" width="16" height="14" rx="2.5" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.15 : 0.1} stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.5" />
      <path d="M2 8h16" stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.5" />
      <circle cx="7" cy="13" r="1.5" fill={isActive ? "hsl(var(--primary))" : "currentColor"} />
      <rect x="6" y="2" width="1.5" height="3" rx="0.75" fill={isActive ? "hsl(var(--primary))" : "currentColor"} />
      <rect x="12.5" y="2" width="1.5" height="3" rx="0.75" fill={isActive ? "hsl(var(--primary))" : "currentColor"} />
    </svg>
  );
}

function NavIconCards({ className, isActive }: { className?: string; isActive?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="1" y="5" width="18" height="12" rx="2.5" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.15 : 0.1} stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.5" />
      <rect x="1" y="8" width="18" height="3" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.6 : 0.4} />
      <rect x="4" y="13.5" width="5" height="1.5" rx="0.75" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.8 : 0.5} />
    </svg>
  );
}

function NavIconNotifications({ className, isActive }: { className?: string; isActive?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M10 2C7.239 2 5 4.239 5 7v3c0 1.2-.5 2.2-1.5 3 .25.25 2.5.5 6.5.5s6.25-.25 6.5-.5c-1-.8-1.5-1.8-1.5-3V7c0-2.761-2.239-5-5-5Z" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.8 : 0.5} />
      <path d="M8.5 14.5c0 .828.672 1.5 1.5 1.5s1.5-.672 1.5-1.5" stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" />
      {isActive && <circle cx="14.5" cy="4.5" r="2.5" fill="hsl(0 80% 60%)" />}
    </svg>
  );
}

function NavIconAdmin({ className, isActive }: { className?: string; isActive?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <path d="M10 1.5l7 3.5v4c0 4.5-3 7.5-7 9.5-4-2-7-5-7-9.5v-4l7-3.5Z" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.2 : 0.1} stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.5 10l2 2 3.5-4" stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NavIconSettings({ className, isActive }: { className?: string; isActive?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="10" r="3" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.6 : 0.4} />
      <path d="M10 1.5a1 1 0 011 1v1.07a5.5 5.5 0 011.9 1.1l.93-.54a1 1 0 011.37.37l1 1.73a1 1 0 01-.37 1.37l-.93.53a5.5 5.5 0 010 2.2l.93.53a1 1 0 01.37 1.37l-1 1.73a1 1 0 01-1.37.37l-.93-.54a5.5 5.5 0 01-1.9 1.1V17.5a1 1 0 01-1 1h-2a1 1 0 01-1-1v-1.07a5.5 5.5 0 01-1.9-1.1l-.93.54a1 1 0 01-1.37-.37l-1-1.73a1 1 0 01.37-1.37l.93-.53a5.5 5.5 0 010-2.2l-.93-.53a1 1 0 01-.37-1.37l1-1.73a1 1 0 011.37-.37l.93.54A5.5 5.5 0 018 3.57V2.5a1 1 0 011-1h2Z" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.2 : 0.12} stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.2" />
    </svg>
  );
}

function NavIconPayments({ className, isActive }: { className?: string; isActive?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="2" y="5" width="16" height="11" rx="2" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.18 : 0.1} stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.5" />
      <path d="M5 9.5h3M5 12h6M13 12h2" stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14.5" cy="9.5" r="1.5" fill={isActive ? "hsl(var(--primary))" : "currentColor"} />
    </svg>
  );
}

function NavIconBudgets({ className, isActive }: { className?: string; isActive?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="10" cy="10" r="7" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.15 : 0.08} stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.5" />
      <circle cx="10" cy="10" r="3" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.5 : 0.3} />
      <path d="M10 3v3M10 14v3M3 10h3M14 10h3" stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function NavIconWorkspaces({ className, isActive }: { className?: string; isActive?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <circle cx="7" cy="7" r="3" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.7 : 0.4} />
      <circle cx="13" cy="7" r="2.5" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.5 : 0.3} />
      <path d="M2 17c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 14c1-1 2-1.5 3.5-1.5 2 0 3.5 1.5 3.5 3.5" stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function NavIconAuditLogs({ className, isActive }: { className?: string; isActive?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="3" y="2" width="14" height="16" rx="2" fill={isActive ? "hsl(var(--primary))" : "currentColor"} opacity={isActive ? 0.15 : 0.08} stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.5" />
      <path d="M6 6h8M6 10h8M6 14h5" stroke={isActive ? "hsl(var(--primary))" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function renderNavIcon(icon: NavIconKey, isActive: boolean, className: string) {
  switch (icon) {
    case "dashboard":
      return <NavIconDashboard className={className} isActive={isActive} />;
    case "calendar":
      return <NavIconCalendar className={className} isActive={isActive} />;
    case "cards":
      return <NavIconCards className={className} isActive={isActive} />;
    case "notifications":
      return <NavIconNotifications className={className} isActive={isActive} />;
    case "payments":
      return <NavIconPayments className={className} isActive={isActive} />;
    case "budgets":
      return <NavIconBudgets className={className} isActive={isActive} />;
    case "workspaces":
      return <NavIconWorkspaces className={className} isActive={isActive} />;
    case "annualReport":
      return <NavIconAuditLogs className={className} isActive={isActive} />;
    case "admin":
      return <NavIconAdmin className={className} isActive={isActive} />;
    case "auditLogs":
      return <NavIconAuditLogs className={className} isActive={isActive} />;
    case "diagnostics":
      return <NavIconAdmin className={className} isActive={isActive} />;
    case "settings":
      return <NavIconSettings className={className} isActive={isActive} />;
  }
}

// --- PLACEHOLDER_NAVLIST ---

interface NavListProps {
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
  role: string;
}

function NavList({ items, collapsed, onNavigate, role }: NavListProps) {
  const { t } = useI18n();
  const isAdmin = role === "admin";
  return (
    <div className="grid gap-0.5">
      {items.map((item) => {
        if (item.adminOnly && !isAdmin) return null;
        const navLink = (
          <NavLink
            key={item.path}
            href={item.path}
            end={item.end ?? false}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center rounded-md transition-all duration-150",
                collapsed ? "justify-center px-2 py-2" : "gap-2.5 px-2.5 py-2 text-[13px] font-medium",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                {!collapsed && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200",
                      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-30",
                    )}
                  />
                )}
                {renderNavIcon(item.icon, isActive, cn("h-[18px] w-[18px] shrink-0 transition-transform duration-200", isActive && "scale-110"))}
                {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
              </>
            )}
          </NavLink>
        );

        if (collapsed) {
          return (
            <Tooltip key={item.path}>
              <TooltipTrigger asChild>{navLink}</TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {t(item.labelKey)}
              </TooltipContent>
            </Tooltip>
          );
        }
        return navLink;
      })}
    </div>
  );
}

interface BrandHeaderProps {
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}

function BrandHeader({ collapsed, onNavigate }: BrandHeaderProps) {
  return (
    <div className="border-b border-border px-3 py-3">
      <Link
        href="/"
        onClick={onNavigate}
        className={cn("flex items-center", collapsed ? "justify-center" : "gap-2.5")}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#111720] text-[#f8fafc] shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_12px_24px_-16px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
          <QreminderLogo className="h-4.5 w-4.5" />
        </div>
        {!collapsed && <span className="text-[14px] font-semibold tracking-tight text-foreground">Qreminder</span>}
      </Link>
    </div>
  );
}

interface SidebarContentProps {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: (() => void) | undefined;
}

function SidebarContent({ collapsed, onToggleCollapse, onNavigate }: SidebarContentProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { t } = useI18n();
  const { email, role } = useAccountIdentity();

  const handleToggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    writeAppearancePendingToStorage(true);
  };

  const handleLogout = async () => {
    try {
      await authClient.signOut();
      toast({
        title: t("header.logoutSuccessTitle"),
        description: t("header.logoutSuccessDescription"),
      });
      router.replace("/login");
    } catch {
      toast({
        title: t("header.logoutFailedTitle"),
        description: t("error.generic"),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex h-full flex-col">
      <BrandHeader collapsed={collapsed} onNavigate={onNavigate} />

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <NavList items={primaryNav} collapsed={collapsed} onNavigate={onNavigate} role={role} />
        <div className="my-2.5 h-px bg-border/60" />
        <NavList items={systemNav} collapsed={collapsed} onNavigate={onNavigate} role={role} />
      </nav>

      {email && !collapsed ? (
        <div className="border-t border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
              {email.slice(0, 1).toUpperCase()}
            </div>
            <span className="truncate text-[11px] font-medium text-muted-foreground" title={email}>{email}</span>
          </div>
        </div>
      ) : null}

      <div className={cn("grid gap-0.5 border-t border-border px-2 py-2", collapsed && "place-items-center")}>
        {collapsed ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleToggleTheme} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <span className="relative flex h-4 w-4 items-center justify-center">
                    <Sun className="absolute h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("header.toggleTheme")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("header.logout")}</TooltipContent>
            </Tooltip>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleTheme}
              className="h-7 justify-start gap-2 px-2 text-[12px] text-muted-foreground hover:text-foreground"
            >
              <span className="relative flex h-3.5 w-3.5 items-center justify-center">
                <Sun className="absolute h-3.5 w-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-3.5 w-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              </span>
              <span>{t("header.toggleTheme")}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-7 justify-start gap-2 px-2 text-[12px] text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{t("header.logout")}</span>
            </Button>
          </>
        )}
      </div>

      {onToggleCollapse && (
        <div className="border-t border-border px-2 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className={cn("h-7 w-full text-muted-foreground hover:text-foreground", collapsed ? "justify-center px-0" : "justify-start gap-2 px-2 text-[12px]")}
          >
            {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <><PanelLeftClose className="h-3.5 w-3.5" /><span>{t("nav.collapse")}</span></>}
          </Button>
        </div>
      )}
    </div>
  );
}

function useResponsiveCollapse() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 1024;
  });
  return [collapsed, setCollapsed] as const;
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useResponsiveCollapse();
  const drawerRef = useRef<HTMLDivElement | null>(null);

  // Lock body scroll + listen for Escape while the mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    // Focus drawer so screen readers/keyboard users land inside.
    drawerRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [mobileOpen]);

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r border-border bg-card transition-[width] duration-200 md:block",
          collapsed ? "w-[56px]" : "w-[200px]",
        )}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapse={() => setCollapsed(!collapsed)} />
      </aside>

      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card/90 px-4 py-3 backdrop-blur-xl md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#111720] text-[#f8fafc] ring-1 ring-white/10">
            <QreminderLogo className="h-4 w-4" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-foreground">Qreminder</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          className="h-9 w-9"
          aria-label="Open menu"
          aria-expanded={mobileOpen}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setMobileOpen(false)}
        />
        <div
          ref={drawerRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className={cn(
            "absolute left-0 top-0 h-full w-[240px] bg-card shadow-xl outline-none transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="absolute right-3 top-3 z-10 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
          <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>
    </>
  );
}
