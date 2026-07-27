/**
 * Exchange rates API routes.
 *
 * Provides endpoints for querying stored exchange rates and manually refreshing
 * the rate cache (admin only).
 */

import { Hono } from "hono";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { z } from "zod";
import { exchangeRates } from "../db/schema.js";
import { fetchDailyExchangeRates } from "../cron/exchange-rate-fetcher.js";
import { requireSession } from "../middleware/require-session.js";
import { requireActiveWorkspaceRole } from "../lib/workspace-permissions.js";
import type { AppEnv } from "../app.js";

export const exchangeRatesRouter = new Hono<AppEnv>();

exchangeRatesRouter.use("*", requireSession);

/**
 * GET /api/exchange-rates
 * Query exchange rates for a specific date or date range.
 *
 * Query params:
 * - date: YYYY-MM-DD (returns rates for this specific date)
 * - from: YYYY-MM-DD (start of date range, inclusive)
 * - to: YYYY-MM-DD (end of date range, inclusive)
 * - base: base currency code (default: USD)
 *
 * Returns: Array of { date, baseCurrency, fromCurrency, rate, provider, updatedAt }
 */
exchangeRatesRouter.get("/", async (c) => {
  const db = c.get("deps").db;
  const { date, from, to, base = "USD" } = c.req.query();

  const conditions = [eq(exchangeRates.baseCurrency, base)];

  if (date) {
    conditions.push(eq(exchangeRates.date, date));
  } else if (from && to) {
    conditions.push(gte(exchangeRates.date, from));
    conditions.push(lte(exchangeRates.date, to));
  }

  const rates = await db
    .select({
      date: exchangeRates.date,
      baseCurrency: exchangeRates.baseCurrency,
      fromCurrency: exchangeRates.fromCurrency,
      rate: exchangeRates.rate,
      provider: exchangeRates.provider,
      updatedAt: exchangeRates.updatedAt,
    })
    .from(exchangeRates)
    .where(and(...conditions))
    .orderBy(desc(exchangeRates.date), exchangeRates.fromCurrency);

  return c.json(rates);
});

/**
 * GET /api/exchange-rates/coverage
 * Returns coverage summary: date range and available currencies.
 *
 * Response: {
 *   earliestDate: "2025-01-01",
 *   latestDate: "2025-07-26",
 *   currencies: ["EUR", "GBP", "JPY", ...],
 *   totalRecords: 5000
 * }
 */
exchangeRatesRouter.get("/coverage", async (c) => {
  const db = c.get("deps").db;
  const base = c.req.query("base") || "USD";

  const coverage = await db
    .select({
      date: exchangeRates.date,
      currency: exchangeRates.fromCurrency,
    })
    .from(exchangeRates)
    .where(eq(exchangeRates.baseCurrency, base))
    .orderBy(exchangeRates.date);

  if (coverage.length === 0) {
    return c.json({
      earliestDate: null,
      latestDate: null,
      currencies: [],
      totalRecords: 0,
    });
  }

  const dates = [...new Set(coverage.map((r) => r.date))].sort();
  const currencies = [...new Set(coverage.map((r) => r.currency))].sort();

  return c.json({
    earliestDate: dates[0],
    latestDate: dates[dates.length - 1],
    currencies,
    totalRecords: coverage.length,
  });
});

const refreshSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  provider: z.enum(["frankfurter", "floatrates"]).optional(),
  force: z.boolean().optional(),
});

/**
 * POST /api/exchange-rates/refresh
 * Manually trigger exchange rate fetch for today (admin only).
 *
 * Body (optional):
 * - date: YYYY-MM-DD (default: today)
 * - provider: "frankfurter" | "floatrates" (default: floatrates)
 * - force: boolean (default: false, set true to refetch even if rates exist)
 *
 * Returns: { date, fetched, skipped, failed, provider, errors }
 */
exchangeRatesRouter.post("/refresh", requireActiveWorkspaceRole("admin"), async (c) => {
  const db = c.get("deps").db;
  const body = await c.req.json();
  const parsed = refreshSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.issues }, 400);
  }

  const { date, provider, force } = parsed.data;

  const result = await fetchDailyExchangeRates(db, {
    ...(date && { date }),
    ...(provider && { preferredProvider: provider }),
    ...(force !== undefined && { force }),
  });

  return c.json(result);
});

