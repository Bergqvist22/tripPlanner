import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { exchangeRates } from "@/db/schema";
import { isCurrency } from "./currency";

// How much of each currency one euro buys today, by ISO 4217 code.
export type RatesPerEuro = Record<string, number>;

// The adapter in front of the exchange-rate service. It rejects when the
// service cannot be reached or does not answer with rates.
export type RateSource = () => Promise<RatesPerEuro>;

// Frankfurter: free, without a key, with daily rates from central banks.
const FRANKFURTER_URL = "https://api.frankfurter.dev/v2/rates?base=EUR";

const frankfurterSchema = z.array(z.object({ quote: z.string(), rate: z.number() }));

// EXCHANGE_RATES_URL points it at another address serving the same format.
const frankfurter: RateSource = async () => {
  const response = await fetch(process.env.EXCHANGE_RATES_URL ?? FRANKFURTER_URL, {
    cache: "no-store",
    // A Trip is not kept waiting for a service that is slow to answer.
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error(`The exchange-rate service answered ${response.status}`);
  const quotes = frankfurterSchema.parse(await response.json());
  return { EUR: 1, ...Object.fromEntries(quotes.map(({ quote, rate }) => [quote, rate])) };
};

let source = frankfurter;

// Rates are daily, so the ones fetched are good for a day.
const FRESH_FOR_MS = 24 * 60 * 60 * 1000;

// A service that failed is left alone for a while, so that a Trip is not kept
// waiting for it on every read.
const RETRY_AFTER_MS = 5 * 60 * 1000;
let failedAt: number | undefined;

// Puts another source in place of the service, for tests.
export function replaceRateSource(replacement: RateSource) {
  source = replacement;
  failedAt = undefined;
}

type StoredRate = typeof exchangeRates.$inferSelect;

// Fetches today's rates and stores them over the last known ones. False when
// that could not be done, which leaves the last known ones as they were.
async function refreshRates() {
  if (failedAt !== undefined && Date.now() - failedAt < RETRY_AFTER_MS) return false;
  try {
    const fetched = await source();
    const fetchedAt = new Date();
    const rates = Object.entries(fetched)
      .filter(([currency, perEuro]) => isCurrency(currency) && Number.isFinite(perEuro) && perEuro > 0)
      .map(([currency, perEuro]) => ({ currency, perEuro, fetchedAt }));
    if (rates.length === 0) throw new Error("The exchange-rate service answered without rates");
    await db()
      .insert(exchangeRates)
      .values(rates)
      .onConflictDoUpdate({
        target: exchangeRates.currency,
        set: { perEuro: sql`excluded.per_euro`, fetchedAt: sql`excluded.fetched_at` },
      });
    failedAt = undefined;
    return true;
  } catch {
    failedAt = Date.now();
    return false;
  }
}

// Costs in other currencies, brought to one display currency.
export type Conversion = {
  displayCurrency: string;
  // Whether an exchange rate is known for the currency.
  hasRate(currency: string): boolean;
  // The cost in the display currency, to the cent. Undefined when no rate is
  // known for one of the two currencies.
  inDisplayCurrency(cost: number, currency: string): number | undefined;
  // Whether a rate older than a day had to be used, or none could be had.
  outOfDate: boolean;
};

// For costs in these currencies. Rates are fetched at most once a day, and
// not at all when every cost is already in the display currency. When they
// cannot be fetched the last known ones are used.
export async function conversionTo(displayCurrency: string, currencies: string[]): Promise<Conversion> {
  const others = [...new Set(currencies)].filter((currency) => currency !== displayCurrency);
  if (others.length === 0) {
    return { displayCurrency, hasRate: () => true, inDisplayCurrency: (cost) => cost, outOfDate: false };
  }

  const now = Date.now();
  const isFresh = ({ fetchedAt }: StoredRate) => now - fetchedAt.getTime() < FRESH_FOR_MS;
  let stored = await db().select().from(exchangeRates);
  let fetchFailed = false;
  if (!stored.some(isFresh)) {
    fetchFailed = !(await refreshRates());
    if (!fetchFailed) stored = await db().select().from(exchangeRates);
  }

  const rates = new Map(stored.map((rate) => [rate.currency, rate]));
  const display = rates.get(displayCurrency);
  const used = [displayCurrency, ...others].flatMap((currency) => rates.get(currency) ?? []);
  return {
    displayCurrency,
    hasRate: (currency) => rates.has(currency),
    inDisplayCurrency(cost, currency) {
      if (currency === displayCurrency) return cost;
      const rate = rates.get(currency);
      if (!rate || !display) return undefined;
      return Math.round(((cost * display.perEuro) / rate.perEuro) * 100) / 100;
    },
    outOfDate: fetchFailed || used.some((rate) => !isFresh(rate)),
  };
}
