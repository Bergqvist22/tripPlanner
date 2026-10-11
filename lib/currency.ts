// ISO 4217 codes known to the runtime, e.g. "SEK", "USD".
export const CURRENCIES: readonly string[] = Intl.supportedValuesOf("currency");

const known = new Set(CURRENCIES);

export function isCurrency(code: string) {
  return known.has(code);
}
