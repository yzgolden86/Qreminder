/**
 * 汇率解析辅助。
 *
 * 从 exchange_rates 表解析「支付币种 → 用户基础币种」在指定日期的汇率快照。
 * 表内汇率统一以 USD 为 base（1 USD = rate × fromCurrency），因此跨币种
 * 换算通过 USD 交叉汇率完成：
 *
 *   1 EUR = rate(USD→BASE) / rate(USD→EUR)  BASE
 *
 * 找不到当天汇率时，回退到该日期之前最近一条（最多 LOOKBACK_DAYS 天），
 * 仍然没有则返回 null——调用方应把快照字段留空（历史统计将回退到当前汇率）。
 */
import { and, eq, lte, desc } from "drizzle-orm";
import { exchangeRates } from "../db/schema.js";
import type { Database } from "../db/types.js";

/** 允许回看的最大天数：超过这个窗口的旧汇率视为无效。 */
const LOOKBACK_DAYS = 7;

export interface RateSnapshot {
  /** 1 单位支付币种等于多少基础币种。 */
  rate: number;
  /** 汇率实际生效日期（YYYY-MM-DD），可能早于请求日期。 */
  date: string;
}

function shiftDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 查询某币种在指定日期（或之前最近一天）相对 USD 的汇率行。
 */
async function findUsdRate(
  db: Database,
  currency: string,
  date: string,
): Promise<{ rate: number; date: string } | null> {
  // USD 本身相对 USD 恒为 1，表内不存这一行。
  if (currency === "USD") return { rate: 1, date };

  const cutoff = shiftDate(date, -LOOKBACK_DAYS);
  const [row] = await db
    .select({ rate: exchangeRates.rate, date: exchangeRates.date })
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.baseCurrency, "USD"),
        eq(exchangeRates.fromCurrency, currency),
        lte(exchangeRates.date, date),
      ),
    )
    .orderBy(desc(exchangeRates.date))
    .limit(1);

  if (!row || row.date < cutoff) return null;
  return row;
}

/**
 * 解析「paymentCurrency → baseCurrency」在 date 当天的汇率快照。
 *
 * @returns 快照（rate + 实际生效日期）；表内无可用数据时返回 null。
 */
export async function resolveRateSnapshot(
  db: Database,
  paymentCurrency: string,
  baseCurrency: string,
  date: string,
): Promise<RateSnapshot | null> {
  const from = paymentCurrency.toUpperCase();
  const base = baseCurrency.toUpperCase();

  if (from === base) return { rate: 1, date };

  const [usdToFrom, usdToBase] = await Promise.all([
    findUsdRate(db, from, date),
    findUsdRate(db, base, date),
  ]);

  if (!usdToFrom || !usdToBase) return null;
  if (usdToFrom.rate === 0) return null;

  return {
    rate: usdToBase.rate / usdToFrom.rate,
    // 快照生效日期取两条汇率中较早的那天，忠实反映数据来源。
    date: usdToFrom.date < usdToBase.date ? usdToFrom.date : usdToBase.date,
  };
}
