import { useState } from "react";
import Link, { NavLink } from "@/components/router-link";
import { useRouter } from "@/lib/router";
import {
  List,
  CalendarDays,
  CreditCard,
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
import type { MessageKey } from "@/i18n/messages";

type NavIconKey = "subscriptions" | "calendar" | "cards" | "settings";

const navItems: Array<{ path: string; labelKey: MessageKey; icon: NavIconKey }> = [
  { path: "/", labelKey: "nav.subscriptions", icon: "subscriptions" },
  { path: "/calendar", labelKey: "nav.calendar", icon: "calendar" },
  { path: "/cards", labelKey: "nav.cards", icon: "cards" },
  { path: "/settings", labelKey: "nav.settings", icon: "settings" },
];

function renderNavIcon(icon: NavIconKey, className: string) {
  switch (icon) {
    case "subscriptions":
      return <List className={className} />;
    case "calendar":
      return <CalendarDays className={className} />;
    case "cards":
      return <CreditCard className={className} />;
    case "settings":
      return <SettingsIcon className={className} />;
  }
}

interface SidebarContentProps {
  onNavigate?: () => void;
}

function SidebarContent({ onNavigate }: SidebarContentProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { t } = useI18n();

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
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2.5 border-b border-border px-4 py-4"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#111720] text-[#f8fafc] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_24px_-16px_rgba(0,0,0,0.7)] ring-1 ring-white/10">
          <QreminderLogo className="h-[18px] w-[18px]" />
        </div>
        <div className="grid">
          <span className="text-[15px] font-extrabold tracking-tight text-foreground">Qreminder</span>
          <span className="text-[10px] text-muted-foreground">{t("app.tagline")}</span>
        </div>
      </Link>

      <nav className="flex-1 grid gap-0.5 px-2.5 py-3">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            href={item.path}
            end={item.path === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )
            }
          >
            {renderNavIcon(item.icon, "h-4 w-4")}
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="grid gap-0.5 border-t border-border px-2.5 py-2.5">
        <Button
          variant="ghost"
          onClick={handleToggleTheme}
          className="justify-start gap-2.5 px-2.5 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span>{t("header.toggleTheme")}</span>
        </Button>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="justify-start gap-2.5 px-2.5 text-[13px] text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
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
      <aside className="sticky top-0 hidden h-screen w-[200px] shrink-0 border-r border-border bg-card md:block">
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
          <div className="absolute left-0 top-0 h-full w-[240px] bg-card shadow-xl">
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
