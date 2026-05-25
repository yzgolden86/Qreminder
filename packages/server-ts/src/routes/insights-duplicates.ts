/**
 * 重复订阅检测启发式。
 *
 * 策略：
 * 1. 规范化名称（去掉空格、标点、常见后缀如 "Pro", "Plus", "Premium" 等）
 * 2. 若名称完全相同 → 高置信度重复
 * 3. 若 token 重叠率 >= 0.6 且分类相同 → 中置信度重复
 * 4. 若分类相同且价格接近（差 <= 20%）且 currency 一致 → 低置信度提示
 *
 * 只检测 active/trial 订阅，已取消/暂停的忽略。同一 group 内按 price desc 排序，便于用户选择保留哪一个。
 *
 * 阈值说明：Jaccard 0.6 ≈ 3 token 名字共享 2 个、或 4 token 共享 2-3 个。低于这个就过分宽松（会把
 * "Hulu" 和 "Hulu Live TV" 漏掉是 OK 的，但 "GitHub Copilot Individual" vs "GitHub Copilot Business"
 * 必须能命中，否则 pass 3 会按"同分类相似价格"误判为低置信度。
 */
import type { InferSelectModel } from "drizzle-orm";
import type { subscriptions } from "../db/schema.js";

type SubscriptionRow = InferSelectModel<typeof subscriptions>;

export interface DuplicateMember {
  id: string;
  name: string;
  price: number;
  currency: string;
  billingCycle: string;
  category: string;
  status: string;
  logo: string | null;
}

export interface DuplicateGroup {
  /** Reason this group is flagged: "same-name" | "similar-name" | "same-category-price". */
  reason: "same-name" | "similar-name" | "same-category-price";
  /** 0..1 — higher = stronger signal. */
  confidence: number;
  /** Short human-readable explanation key (for client i18n). */
  reasonKey: string;
  members: DuplicateMember[];
}

const COMMON_SUFFIXES = [
  "pro",
  "plus",
  "premium",
  "lite",
  "free",
  "basic",
  "standard",
  "starter",
  "annual",
  "monthly",
  "yearly",
  "subscription",
  "trial",
  "family",
  "individual",
  "team",
];

/** Normalize a name: lowercase, strip punctuation, drop common product-tier suffixes. */
export function normalizeName(name: string): string {
  const lower = name
    .toLowerCase()
    .normalize("NFKD")
    // strip diacritics (e.g., "é" → "e") for matching purposes
    .replace(/\p{Diacritic}+/gu, "")
    .replace(/[^a-z0-9一-鿿\s]+/g, " ")
    .trim();
  const tokens = lower.split(/\s+/).filter(Boolean);
  const filtered = tokens.filter((t) => !COMMON_SUFFIXES.includes(t));
  // If filtering left nothing, fall back to the original tokens to avoid false collisions
  return (filtered.length > 0 ? filtered : tokens).join(" ");
}

function tokenSet(name: string): Set<string> {
  return new Set(normalizeName(name).split(/\s+/).filter(Boolean));
}

/** Jaccard similarity on token sets. */
function tokenOverlap(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const t of sa) if (sb.has(t)) intersection += 1;
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function toMember(row: SubscriptionRow): DuplicateMember {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    currency: row.currency,
    billingCycle: row.billingCycle,
    category: row.category,
    status: row.status,
    logo: row.logo ?? null,
  };
}

function sortByPriceDesc(members: DuplicateMember[]): DuplicateMember[] {
  return [...members].sort((a, b) => b.price - a.price);
}

/**
 * Detect duplicate subscriptions for a single user.
 *
 * Returns deduplicated groups — each subscription appears in at most one group, preferring the
 * strongest detection signal (same-name > similar-name > same-category-price).
 */
export function detectDuplicates(rows: SubscriptionRow[]): DuplicateGroup[] {
  const active = rows.filter((r) => r.status === "active" || r.status === "trial");
  if (active.length < 2) return [];

  const claimed = new Set<string>();
  const groups: DuplicateGroup[] = [];

  // Pass 1: same normalized name
  const byNormalized = new Map<string, SubscriptionRow[]>();
  for (const row of active) {
    const key = normalizeName(row.name);
    if (!key) continue;
    const bucket = byNormalized.get(key) ?? [];
    bucket.push(row);
    byNormalized.set(key, bucket);
  }
  for (const bucket of byNormalized.values()) {
    if (bucket.length < 2) continue;
    for (const r of bucket) claimed.add(r.id);
    groups.push({
      reason: "same-name",
      confidence: 0.95,
      reasonKey: "insights.duplicate.sameName",
      members: sortByPriceDesc(bucket.map(toMember)),
    });
  }

  // Pass 2: similar name + same category (token overlap >= 0.7)
  const remainingAfterPass1 = active.filter((r) => !claimed.has(r.id));
  for (let i = 0; i < remainingAfterPass1.length; i += 1) {
    const a = remainingAfterPass1[i];
    if (!a || claimed.has(a.id)) continue;
    const cluster: SubscriptionRow[] = [a];
    for (let j = i + 1; j < remainingAfterPass1.length; j += 1) {
      const b = remainingAfterPass1[j];
      if (!b || claimed.has(b.id)) continue;
      if (a.category && a.category === b.category && tokenOverlap(a.name, b.name) >= 0.6) {
        cluster.push(b);
      }
    }
    if (cluster.length >= 2) {
      for (const r of cluster) claimed.add(r.id);
      groups.push({
        reason: "similar-name",
        confidence: 0.75,
        reasonKey: "insights.duplicate.similarName",
        members: sortByPriceDesc(cluster.map(toMember)),
      });
    }
  }

  // Pass 3: same category + similar price (no name match required) — soft hint
  const remainingAfterPass2 = active.filter((r) => !claimed.has(r.id));
  const byCategory = new Map<string, SubscriptionRow[]>();
  for (const row of remainingAfterPass2) {
    if (!row.category) continue;
    const bucket = byCategory.get(row.category) ?? [];
    bucket.push(row);
    byCategory.set(row.category, bucket);
  }
  for (const bucket of byCategory.values()) {
    if (bucket.length < 2) continue;
    const visited = new Set<string>();
    for (let i = 0; i < bucket.length; i += 1) {
      const a = bucket[i];
      if (!a || visited.has(a.id)) continue;
      const cluster: SubscriptionRow[] = [a];
      for (let j = i + 1; j < bucket.length; j += 1) {
        const b = bucket[j];
        if (!b || visited.has(b.id)) continue;
        if (
          a.currency === b.currency
          && a.billingCycle === b.billingCycle
          && pricesClose(a.price, b.price)
        ) {
          cluster.push(b);
        }
      }
      if (cluster.length >= 2) {
        for (const r of cluster) visited.add(r.id);
        groups.push({
          reason: "same-category-price",
          confidence: 0.5,
          reasonKey: "insights.duplicate.sameCategoryPrice",
          members: sortByPriceDesc(cluster.map(toMember)),
        });
      }
    }
  }

  return groups;
}

function pricesClose(a: number, b: number): boolean {
  if (a === 0 && b === 0) return true;
  const max = Math.max(a, b);
  if (max === 0) return false;
  return Math.abs(a - b) / max <= 0.2;
}

export const __testing__ = {
  normalizeName,
  tokenOverlap,
  pricesClose,
};
