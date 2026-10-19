import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  variant?: 'default' | 'primary' | 'warning';
  className?: string;
}

const ACCENT: Record<NonNullable<StatCardProps['variant']>, string> = {
  default: "bg-foreground/25",
  primary: "bg-primary shadow-[0_0_10px_hsl(var(--primary))]",
  warning: "bg-warning shadow-[0_0_10px_hsl(var(--warning))]",
};

const ICON: Record<NonNullable<StatCardProps['variant']>, string> = {
  default: "text-muted-foreground bg-secondary/70 border-border/70",
  primary: "text-primary bg-primary/10 border-primary/25",
  warning: "text-warning bg-warning/10 border-warning/25",
};

const VALUE: Record<NonNullable<StatCardProps['variant']>, string> = {
  default: "text-foreground",
  primary: "text-foreground",
  warning: "text-warning",
};

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  variant = 'default',
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "surface-card lift-on-hover group relative overflow-hidden rounded-xl p-4 sm:p-5",
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100",
          variant === "warning" ? "bg-warning/15" : "bg-primary/15",
        )}
      />

      <span
        aria-hidden
        className={cn(
          "absolute left-4 top-5 h-1.5 w-1.5 rounded-full transition-transform duration-300 group-hover:scale-125",
          ACCENT[variant],
        )}
      />

      <div className="ml-4 flex items-start justify-between gap-4">
        <div className="grid min-w-0 gap-2">
          <p className="text-[13px] font-semibold tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className={cn("num-display text-[28px] font-bold leading-none tracking-tight sm:text-[32px]", VALUE[variant])}>
            {value}
          </p>
          {subtitle && (
            <p className="text-[13px] font-medium text-muted-foreground/90">{subtitle}</p>
          )}
        </div>
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-300 group-hover:scale-105",
            ICON[variant],
          )}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}
