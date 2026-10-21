// Shared budget rules used by the estimate helper and the data validator.

export const BUFFER = 0.10;
export const ROUND_TO = 25;

export const RATES = {
  // USD per 1 unit of currency. See ESTIMATES.md for where these come from.
  USD: 1,
  EUR: 1.15,
  GBP: 1.33,
  MAD: 1 / 9.30,
};

export const CATEGORIES = ['gettingThere', 'staying', 'eating', 'doing'];

export function roundTo(n, step = ROUND_TO) {
  return Math.round(n / step) * step;
}

/** Trip total = (sum of the four categories) + 10% buffer, rounded to the nearest $25. */
export function budgetFromBreakdown(breakdown) {
  const subtotal = CATEGORIES.reduce((s, k) => s + breakdown[k], 0);
  return roundTo(subtotal * (1 + BUFFER));
}
