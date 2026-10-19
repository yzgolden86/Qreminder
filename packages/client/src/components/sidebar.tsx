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
  LayoutGrid,
  CalendarRange,
  CreditCard,
  Receipt,
  PieChart,
  BellRing,
  Layers,
  Sparkles,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/lib/theme-provider";
import { useToast } from "@/hooks/use-toast";
import { QreminderLogo } from "@/components/icons/qreminder-logo";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { writeAppearancePendingToStorage } from "@/lib/theme-storage";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/i18n/I18nProvider";
import { useAccountIdentity } from "@/modules/settings/application/use-account-email";
import type { MessageKey } from "@/i18n/messages";

type NavIconKey =
  | "dashboard"
  | "calendar"
  | "cards"
  | "notifications"
  | "payments"
  | "budgets"
  | "workspaces"
  | "annualReport"
  | "settings";

interface NavItem {
  path: string;
  labelKey: MessageKey;
  icon: NavIconKey;
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
  { path: "/settings", labelKey: "nav.settings", icon: "settings" },
];

const NAV_ICON_MAP: Record<NavIconKey, LucideIcon> = {
  dashboard: LayoutGrid,
  calendar: CalendarRange,
  cards: CreditCard,
  payments: Receipt,
  budgets: PieChart,
  notifications: BellRing,
  workspaces: Layers,
  annualReport: Sparkles,
  settings: SlidersHorizontal,
};

interface NavListProps {
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: (() => void) | undefined;
}

function NavList({ items, collapsed, onNavigate }: NavListProps) {
  const { t } = useI18n();
  return (
    <div className="grid gap-1.5">
      {items.map((item) => {
        const IconComponent = NAV_ICON_MAP[item.icon];
        const navLink = (
          <NavLink
            key={item.path}
            href={item.path}
            end={item.end ?? false}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center rounded-xl transition-all duration-200",
                collapsed ? "justify-center px-2.5 py-2.5" : "gap-3.5 px-3.5 py-2.5 text-[15px] font-medium",
                isActive
                  ? "bg-primary/[0.12] font-semibold text-primary shadow-[inset_0_1px_0_hsl(var(--primary)/0.2)]"
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
                      "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_10px_hsl(var(--primary))] transition-all duration-200",
                      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-40",
                    )}
                  />
                )}
                <IconComponent
                  className={cn(
                    "h-[19px] w-[19px] shrink-0 transition-transform duration-200",
                    isActive ? "scale-105 text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
                {!collapsed && <span className="truncate tracking-tight">{t(item.labelKey)}</span>}
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
    <div className="border-b border-border px-3.5 py-3.5">
      <Link
        href="/"
        onClick={onNavigate}
        className={cn("flex items-center", collapsed ? "justify-center" : "gap-3")}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#111720] text-[#f8fafc] shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_12px_24px_-16px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
          <QreminderLogo className="h-5 w-5" />
        </div>
        {!collapsed && <span className="text-[16px] font-bold tracking-tight text-foreground">Qreminder</span>}
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
  const { email } = useAccountIdentity();

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

      {!collapsed && (
        <div className="border-b border-border px-3.5 py-2.5">
          <WorkspaceSwitcher />
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <NavList items={primaryNav} collapsed={collapsed} onNavigate={onNavigate} />
        <div className="my-3.5 h-px bg-border/60" />
        <NavList items={systemNav} collapsed={collapsed} onNavigate={onNavigate} />
      </nav>

      {email && !collapsed ? (
        <div className="border-t border-border/70 px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/20">
              {email.slice(0, 1).toUpperCase()}
            </div>
            <span className="truncate text-[13px] font-medium text-muted-foreground" title={email}>{email}</span>
          </div>
        </div>
      ) : null}

      <div className={cn("grid gap-1 border-t border-border/70 px-2.5 py-2.5", collapsed && "place-items-center")}>
        {collapsed ? (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleToggleTheme} className="h-9 w-9 text-muted-foreground hover:text-foreground">
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
                <Button variant="ghost" size="icon" onClick={handleLogout} className="h-9 w-9 text-muted-foreground hover:text-destructive">
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
              className="h-8 justify-start gap-2.5 px-2.5 text-[13.5px] font-medium text-muted-foreground hover:text-foreground"
            >
              <span className="relative flex h-4 w-4 items-center justify-center">
                <Sun className="absolute h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              </span>
              <span>{t("header.toggleTheme")}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-8 justify-start gap-2.5 px-2.5 text-[13.5px] font-medium text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span>{t("header.logout")}</span>
            </Button>
          </>
        )}
      </div>

      {onToggleCollapse && (
        <div className="border-t border-border/70 px-2.5 py-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className={cn("h-8 w-full text-muted-foreground hover:text-foreground", collapsed ? "justify-center px-0" : "justify-start gap-2.5 px-2.5 text-[13.5px] font-medium")}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /><span>{t("nav.collapse")}</span></>}
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
          "sticky top-0 hidden h-screen shrink-0 border-r border-border/80 bg-card/85 backdrop-blur-xl transition-[width] duration-300 md:block",
          collapsed ? "w-[64px]" : "w-[238px]",
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
