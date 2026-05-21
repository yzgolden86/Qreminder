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
  default: "bg-foreground/10",
  primary: "bg-primary",
  warning: "bg-warning",
};

const ICON: Record<NonNullable<StatCardProps['variant']>, string> = {
  default: "text-muted-foreground",
  primary: "text-primary",
  warning: "text-warning",
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
        "surface-card lift-on-hover group relative overflow-hidden rounded-lg p-4",
        className,
      )}
    >
      {/* Linear-style accent dot — replaces the bigger glow blob */}
      <span
        aria-hidden
        className={cn(
          "absolute left-4 top-4 h-1.5 w-1.5 rounded-full",
          ACCENT[variant],
        )}
      />

      <div className="ml-4 flex items-start justify-between gap-4">
        <div className="grid min-w-0 gap-2">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {title}
          </p>
          <p className={cn("num-display text-[28px] font-semibold leading-none", VALUE[variant])}>
            {value}
          </p>
          {subtitle && (
            <p className="text-[11.5px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <span className={cn("opacity-50 transition-opacity duration-200 group-hover:opacity-100", ICON[variant])}>
          {icon}
        </span>
      </div>
    </div>
  );
}
