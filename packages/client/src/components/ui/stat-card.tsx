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

const ICON_VARIANTS: Record<NonNullable<StatCardProps['variant']>, string> = {
  default: "bg-secondary text-muted-foreground ring-1 ring-border/50",
  primary: "bg-primary/10 text-primary ring-1 ring-primary/20",
  warning: "bg-warning/10 text-warning ring-1 ring-warning/20",
};

const VALUE_VARIANTS: Record<NonNullable<StatCardProps['variant']>, string> = {
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
        "surface-card lift-on-hover group relative overflow-hidden rounded-xl p-5",
        className,
      )}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-60",
          variant === 'primary' && "bg-primary/25",
          variant === 'warning' && "bg-warning/25",
          variant === 'default' && "bg-foreground/10",
        )}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="grid min-w-0 gap-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {title}
          </p>
          <p
            className={cn(
              "num-display text-3xl font-bold leading-tight",
              VALUE_VARIANTS[variant],
            )}
          >
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105",
            ICON_VARIANTS[variant],
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
