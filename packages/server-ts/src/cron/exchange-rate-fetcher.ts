/**
 * Exchange rate fetcher cron job.
 *
 * Fetches daily exchange rates from Frankfurter or FloatRates API and stores
 * them in the exchange_rates table. Runs once per day (typically at 00:00 UTC).
 *
 * Purpose:
 * - Enable historical payment analysis using accurate rates from payment date
 * - Avoid relying on frontend localStorage cache for financial calculations
 * - Provide rate data for all users in a workspace consistently
 *
 * Flow:
 * 1. Check if today's rates already exist for the target currencies
 * 2. If missing, fetch from preferred provider (default: floatrates)
 * 3. On failure, try fallback provider (frankfurter)
 * 4. Write rates to exchange_rates table (upsert by date+base+from)
 * 5. Return summary of fetched/skipped currencies
 */

import { eq, and } from "drizzle-orm";
import { exchangeRates } from "../db/schema.js";
import type { Database } from "../db/types.js";

/** Currencies to fetch daily. Matches frontend SUPPORTED_CURRENCIES. */
const TARGET_CURRENCIES = [
  "AUD", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD",
  "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN", "MYR", "NOK",
  "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "ZAR",
] as const;

/** Base currency for rate storage (matches frontend default). */
const BASE_CURRENCY = "USD";

const FETCH_TIMEOUT_MS = 15_000;

type ExchangeRateProvider = "frankfurter" | "floatrates";

interface FetchedRate {
  currency: string;
  rate: number;
  date: string;
}

export interface ExchangeRateFetchResult {
  date: string;
  fetched: number;
  skipped: number;
  failed: number;
  provider: ExchangeRateProvider | null;
  errors: string[];
}

/**
 * Fetches rates from Frankfurter API v2 (https://api.frankfurter.dev).
 * Returns rates with USD as base (1 USD = X currency).
 */
async function fetchFromFrankfurter(signal: AbortSignal): Promise<FetchedRate[]> {
  const url = `https://api.frankfurter.dev/v2/latest?base=${BASE_CURRENCY}`;
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`Frankfurter API returned ${response.status}`);
  }

  const data = await response.json() as unknown;

  // Frankfurter v2 returns: [{ base, quote, rate, date }, ...]
  if (!Array.isArray(data)) {
    throw new Error("Frankfurter response is not an array");
  }

  const rates: FetchedRate[] = [];
  let sharedDate: string | null = null;

  for (const item of data) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof item.quote !== "string" ||
      typeof item.rate !== "number" ||
      typeof item.date !== "string"
    ) {
      continue;
    }

    if (!TARGET_CURRENCIES.includes(item.quote as typeof TARGET_CURRENCIES[number])) {
      continue;
    }

    sharedDate ??= item.date;
    rates.push({ currency: item.quote, rate: item.rate, date: item.date });
  }

  if (!sharedDate || rates.length === 0) {
    throw new Error("Frankfurter returned no valid rates");
  }

  return rates;
}

/**
 * Fetches rates from FloatRates API (https://www.floatrates.com/daily/usd.json).
 * Returns rates with USD as base (1 USD = X currency).
 */
async function fetchFromFloatrates(signal: AbortSignal): Promise<FetchedRate[]> {
  const url = "https://www.floatrates.com/daily/usd.json";
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`FloatRates API returned ${response.status}`);
  }

  const data = await response.json() as unknown;

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("FloatRates response is not an object");
  }

  const rates: FetchedRate[] = [];
  let sharedDate: string | null = null;

  for (const [currencyCode, currencyData] of Object.entries(data)) {
    if (
      typeof currencyData !== "object" ||
      currencyData === null ||
      typeof currencyData.inverseRate !== "number" ||
      typeof currencyData.date !== "string"
    ) {
      continue;
    }

    const upperCode = currencyCode.toUpperCase();
    if (!TARGET_CURRENCIES.includes(upperCode as typeof TARGET_CURRENCIES[number])) {
      continue;
    }

    const dateOnly = currencyData.date.split(" ")[0]; // "2025-01-15 00:00:01" -> "2025-01-15"
    if (!dateOnly) {
      continue;
    }
    sharedDate ??= dateOnly;
    rates.push({
      currency: upperCode,
      rate: currencyData.inverseRate,
      date: sharedDate!, // Safe: sharedDate is assigned just above
    });
  }

  if (!sharedDate || rates.length === 0) {
    throw new Error("FloatRates returned no valid rates");
  }

  return rates;
}

/**
 * Fetches rates from the specified provider with timeout.
 */
async function fetchRates(
  provider: ExchangeRateProvider,
): Promise<FetchedRate[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const fetcher = provider === "frankfurter" ? fetchFromFrankfurter : fetchFromFloatrates;
    return await fetcher(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Main cron entry point: fetch and store today's exchange rates.
 *
 * @param db - Database instance
 * @param options - Configuration options
 * @returns Result summary
 */
export async function fetchDailyExchangeRates(
  db: Database,
  options: {
    date?: string; // YYYY-MM-DD, defaults to today UTC
    preferredProvider?: ExchangeRateProvider;
    force?: boolean; // If true, refetch even if rates already exist for this date
  } = {},
): Promise<ExchangeRateFetchResult> {
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const preferred = options.preferredProvider ?? "floatrates";
  const fallback: ExchangeRateProvider = preferred === "frankfurter" ? "floatrates" : "frankfurter";

  const result: ExchangeRateFetchResult = {
    date,
    fetched: 0,
    skipped: 0,
    failed: 0,
    provider: null,
    errors: [],
  };

  // Check if rates already exist for today
  if (!options.force) {
    const existing = await db
      .select({ currency: exchangeRates.fromCurrency })
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.date, date),
          eq(exchangeRates.baseCurrency, BASE_CURRENCY),
        ),
      );

    if (existing.length === TARGET_CURRENCIES.length) {
      result.skipped = existing.length;
      return result;
    }
  }

  // Fetch rates from preferred provider, fall back on error
  let fetchedRates: FetchedRate[] | null = null;

  try {
    fetchedRates = await fetchRates(preferred);
    result.provider = preferred;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(`${preferred}: ${message}`);

    try {
      fetchedRates = await fetchRates(fallback);
      result.provider = fallback;
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      result.errors.push(`${fallback}: ${fallbackMessage}`);
    }
  }

  if (!fetchedRates || fetchedRates.length === 0) {
    result.failed = TARGET_CURRENCIES.length;
    return result;
  }

  // Write rates to database (upsert)
  const now = new Date().toISOString();

  for (const { currency, rate, date } of fetchedRates) {
    try {
      // Check if this exact rate already exists
      const existing = await db
        .select({ id: exchangeRates.id })
        .from(exchangeRates)
        .where(
          and(
            eq(exchangeRates.date, date),
            eq(exchangeRates.baseCurrency, BASE_CURRENCY),
            eq(exchangeRates.fromCurrency, currency),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing rate
        const existingId = existing[0]!.id;
        await db
          .update(exchangeRates)
          .set({
            rate,
            provider: result.provider!,
            updatedAt: now,
          })
          .where(eq(exchangeRates.id, existingId));
      } else {
        // Insert new rate
        await db.insert(exchangeRates).values({
          id: crypto.randomUUID(),
          date,
          baseCurrency: BASE_CURRENCY,
          fromCurrency: currency,
          rate,
          provider: result.provider!,
          createdAt: now,
          updatedAt: now,
        });
      }

      result.fetched++;
    } catch (error) {
      result.failed++;
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${currency}: ${message}`);
    }
  }

  return result;
}
