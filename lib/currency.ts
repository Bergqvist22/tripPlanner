// ISO 4217 codes known to the runtime, e.g. "SEK", "USD".
export const CURRENCIES: readonly string[] = Intl.supportedValuesOf("currency");

const known = new Set(CURRENCIES);

export function isCurrency(code: string) {
  return known.has(code);
}

// A cost as travellers read it, e.g. "SEK 4,500.50".
export function formattedCost(cost: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, currencyDisplay: "code" }).format(cost);
}
