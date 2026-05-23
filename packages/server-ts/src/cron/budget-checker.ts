/**
 * 预算超额检查器。
 *
 * 被 notification-cron 调用，检查用户预算使用率，
 * 超过 80% 或 100% 时生成提醒消息。
 */
import { eq } from "drizzle-orm";
import { budgets, subscriptions, subscriptionPayments } from "../db/schema.js";
import type { Database } from "../db/types.js";

export interface BudgetAlert {
  budgetId: string;
  scopeType: string;
  scopeId: string;
  period: string;
  budgetAmount: number;
  spent: number;
  usagePercent: number;
  level: "warning" | "exceeded";
}

export async function checkBudgetAlerts(
  db: Database,
  userId: string,
): Promise<BudgetAlert[]> {
  const [userBudgets, allPayments, allSubs] = await Promise.all([
    db.select().from(budgets).where(eq(budgets.user, userId)),
    db.select().from(subscriptionPayments).where(eq(subscriptionPayments.user, userId)),
    db.select().from(subscriptions).where(eq(subscriptions.user, userId)),
  ]);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentYear = String(now.getFullYear());

  const subMap = new Map(allSubs.map((s) => [s.id, s]));
  const alerts: BudgetAlert[] = [];

  for (const budget of userBudgets) {
    if (!budget.enabled) continue;

    const relevantPayments = allPayments.filter((p) => {
      const inPeriod = budget.period === "monthly"
        ? p.paidAt.startsWith(currentMonth)
        : p.paidAt.startsWith(currentYear);
      if (!inPeriod) return false;

      if (budget.scopeType === "global") return true;
      const sub = subMap.get(p.subscriptionId);
      if (!sub) return false;

      if (budget.scopeType === "category") return sub.category === budget.scopeId;
      if (budget.scopeType === "tag") return (sub.tags ?? []).includes(budget.scopeId ?? "");
      if (budget.scopeType === "payment_method") return sub.paymentMethod === budget.scopeId;
      return false;
    });

    const spent = relevantPayments.reduce((sum, p) => sum + p.amount, 0);
    const usagePercent = budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0;

    if (usagePercent >= 100) {
      alerts.push({
        budgetId: budget.id,
        scopeType: budget.scopeType,
        scopeId: budget.scopeId ?? "",
        period: budget.period,
        budgetAmount: budget.amount,
        spent,
        usagePercent,
        level: "exceeded",
      });
    } else if (usagePercent >= 80) {
      alerts.push({
        budgetId: budget.id,
        scopeType: budget.scopeType,
        scopeId: budget.scopeId ?? "",
        period: budget.period,
        budgetAmount: budget.amount,
        spent,
        usagePercent,
        level: "warning",
      });
    }
  }

  return alerts;
}

export function formatBudgetAlertMessage(alerts: BudgetAlert[]): string | null {
  if (alerts.length === 0) return null;

  const lines = alerts.map((a) => {
    const scope = a.scopeType === "global" ? "总预算" : `${a.scopeType}:${a.scopeId}`;
    const status = a.level === "exceeded" ? "已超支" : "即将超支";
    return `${scope} (${a.period}) ${status}: ${a.usagePercent}% (${a.spent}/${a.budgetAmount})`;
  });

  return lines.join("\n");
}
