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
        "relative overflow-hidden rounded-lg border border-border bg-card p-5 shadow-card transition-all duration-300 hover:bg-card-hover",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="grid gap-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p
            className={cn(
              "text-3xl font-bold tracking-tight",
              variant === 'primary' && "text-foreground",
              variant === 'warning' && "text-warning",
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
            "flex h-11 w-11 items-center justify-center rounded-lg",
            variant === 'default' && "bg-secondary text-muted-foreground",
            variant === 'primary' && "bg-secondary text-primary",
            variant === 'warning' && "bg-warning/10 text-warning",
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
