import { useEffect, useState } from "react";
import Link, { NavLink } from "@/components/router-link";
import { useRouter } from "@/lib/router";
import {
  LayoutDashboard,
  CalendarDays,
  CreditCard,
  Bell,
  ShieldCheck,
  Settings as SettingsIcon,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme-provider";
import { useToast } from "@/hooks/use-toast";
import { QreminderLogo } from "@/components/icons/qreminder-logo";
import { writeAppearancePendingToStorage } from "@/lib/theme-storage";
import { authClient } from "@/lib/auth-client";
import { useI18n } from "@/i18n/I18nProvider";
import { useAccountIdentity } from "@/modules/settings/application/use-account-email";
import type { MessageKey } from "@/i18n/messages";

type NavIconKey = "dashboard" | "calendar" | "cards" | "notifications" | "admin" | "settings";

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
  { path: "/notifications", labelKey: "nav.notifications", icon: "notifications" },
];

const systemNav: NavItem[] = [
  { path: "/admin/users", labelKey: "nav.adminUsers", icon: "admin", adminOnly: true },
  { path: "/settings", labelKey: "nav.settings", icon: "settings" },
];

function renderNavIcon(icon: NavIconKey, className: string) {
  switch (icon) {
    case "dashboard":
      return <LayoutDashboard className={className} />;
    case "calendar":
      return <CalendarDays className={className} />;
    case "cards":
      return <CreditCard className={className} />;
    case "notifications":
      return <Bell className={className} />;
    case "admin":
      return <ShieldCheck className={className} />;
    case "settings":
      return <SettingsIcon className={className} />;
  }
}

interface NavListProps {
  items: NavItem[];
  onNavigate?: (() => void) | undefined;
  role: string;
}

function NavList({ items, onNavigate, role }: NavListProps) {
  const { t } = useI18n();
  const isAdmin = role === "admin";
  return (
    <div className="grid gap-0.5">
      {items.map((item) => {
        if (item.adminOnly && !isAdmin) return null;
        return (
          <NavLink
            key={item.path}
            href={item.path}
            end={item.end ?? false}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group relative flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] font-medium transition-all duration-150",
                isActive
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200",
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-30",
                  )}
                />
                {renderNavIcon(item.icon, cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", isActive && "scale-110"))}
                <span className="truncate">{t(item.labelKey)}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}

function useNowMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}

interface BrandHeaderProps {
  onNavigate?: (() => void) | undefined;
}

function BrandHeader({ onNavigate }: BrandHeaderProps) {
  const { locale, formatDateTime } = useI18n();
  const now = useNowMinute();
  const dateLabel = formatDateTime(now, { month: "short", day: "numeric", weekday: "short" });
  return (
    <div className="border-b border-border px-3 py-3">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#111720] text-[#f8fafc] shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_12px_24px_-16px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
          <QreminderLogo className="h-4 w-4" />
        </div>
        <div className="grid leading-tight">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[13px] font-semibold tracking-tight text-foreground">Qreminder</span>
            <span className="num-display text-[9px] font-medium text-muted-foreground/70">v2.0</span>
          </div>
          <span
            className="text-[10px] text-muted-foreground/70"
            lang={locale}
          >
            {dateLabel}
          </span>
        </div>
      </Link>
    </div>
  );
}

interface SidebarContentProps {
  onNavigate?: (() => void) | undefined;
}

function SidebarContent({ onNavigate }: SidebarContentProps) {
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
      <BrandHeader onNavigate={onNavigate} />

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <NavList items={primaryNav} onNavigate={onNavigate} role={role} />
        <div className="my-2.5 h-px bg-border/60" />
        <NavList items={systemNav} onNavigate={onNavigate} role={role} />
      </nav>

      {email ? (
        <div className="border-t border-border px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/10 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
              {email.slice(0, 1).toUpperCase()}
            </div>
            <span className="truncate text-[11px] font-medium text-muted-foreground" title={email}>{email}</span>
          </div>
        </div>
      ) : null}

      <div className="grid gap-0.5 border-t border-border px-2 py-2">
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
      </div>
    </div>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[176px] shrink-0 border-r border-border bg-card md:block">
        <SidebarContent />
      </aside>

      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card/90 px-4 py-3 backdrop-blur-xl md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#111720] text-[#f8fafc] ring-1 ring-white/10">
            <QreminderLogo className="h-4 w-4" />
          </div>
          <span className="text-base font-extrabold tracking-tight text-foreground">Qreminder</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          className="h-9 w-9"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[220px] bg-card shadow-xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 z-10 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
