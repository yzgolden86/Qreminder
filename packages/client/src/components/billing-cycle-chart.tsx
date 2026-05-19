import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { Subscription } from "@/types/subscription";
import { CYCLE_LABELS } from "@/types/subscription";
import { useI18n } from "@/i18n/I18nProvider";
import { localizedLabel } from "@/i18n/locales";

interface BillingCycleChartProps {
  subscriptions: Subscription[];
}

const COLORS: readonly string[] = [
  "hsl(200 80% 50%)",
  "hsl(160 84% 45%)",
  "hsl(35 90% 55%)",
  "hsl(280 70% 55%)",
  "hsl(350 75% 55%)",
  "hsl(45 90% 50%)",
];

function colorAt(index: number): string {
  return COLORS[index % COLORS.length] ?? "hsl(160 84% 45%)";
}

export function BillingCycleChart({ subscriptions }: BillingCycleChartProps) {
  const { t, locale } = useI18n();

  const data = useMemo(() => {
    const active = subscriptions.filter((s) => s.status === "active" || s.status === "trial");
    const counts: Record<string, number> = {};
    for (const sub of active) {
      counts[sub.billingCycle] = (counts[sub.billingCycle] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([cycle, count], i) => ({
        name: localizedLabel(CYCLE_LABELS[cycle as keyof typeof CYCLE_LABELS], locale),
        value: count,
        color: colorAt(i),
      }))
      .sort((a, b) => b.value - a.value);
  }, [subscriptions, locale]);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        {t("statistics.noSubscriptionData")}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="h-[160px] w-full">
        <ResponsiveContainer width="100%" height="100%" debounce={50}>
          <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="50%"
              outerRadius="85%"
              paddingAngle={3}
              cornerRadius={3}
              dataKey="value"
              strokeWidth={0}
              isAnimationActive={false}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))" }}
              isAnimationActive={false}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {data.map((entry) => (
          <div key={entry.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span>{entry.name} ({entry.value})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
