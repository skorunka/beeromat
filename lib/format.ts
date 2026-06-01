// Currency + number formatting helpers used by the UI.
// Amounts are always stored as integer minor units (CZK halléř, EUR cent)
// — convert to a major-unit number at the formatting boundary only.

export function formatMoney(
  amountMinor: bigint,
  currencyCode: string,
  locale: string,
): string {
  const amountMajor = Number(amountMinor) / 100;
  // Adaptive precision: drop the decimals when the amount is a whole
  // unit ("380 Kč"), but show two when there's a fractional part
  // ("380,50 Kč"). Cleaner for the common whole-koruna case without
  // losing precision when cents matter.
  const hasCents = amountMinor % 100n !== 0n;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(amountMajor);
}

/**
 * Compact currency formatting for tight UI surfaces (the header
 * balance badge, future bottom-nav chips, etc.). Drops fractional
 * digits — "380 Kč" instead of "380,00 Kč" — to save horizontal
 * space. Use `formatMoney` when precision matters (settle screens,
 * admin reconciliation views).
 */
export function formatMoneyCompact(
  amountMinor: bigint,
  currencyCode: string,
  locale: string,
): string {
  const amountMajor = Number(amountMinor) / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amountMajor);
}

/**
 * Weekday + date label for a drink session / round — e.g.
 * "pondělí 1. 6." (cs) or "Monday, 6/1" (en). Used as the default
 * (editable) session title so an unnamed round reads as the
 * tennis-and-beer day it happened on, rather than a generic "Round".
 */
export function formatDayLabel(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
  }).format(date);
}
