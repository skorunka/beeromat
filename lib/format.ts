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

/** Calendar-day key (UTC) — matches the breakdown's day bucketing. */
function dayKeyUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** True when `date` falls on the same UTC calendar day as `now`. */
export function isSameDay(date: Date, now: Date): boolean {
  return dayKeyUTC(date) === dayKeyUTC(now);
}

/**
 * Human day label relative to `now`: the "today"/"yesterday" words for
 * those two days, otherwise a fallback — the weekday+date label
 * ('day', default, for session headers like "pondělí 1. 6.") or a
 * medium date with year ('date', for history lists where pinning down
 * the exact day of an older session still matters). The today/
 * yesterday words are passed in so the helper stays locale-agnostic.
 */
export function formatRelativeDay(
  date: Date,
  now: Date,
  locale: string,
  labels: { today: string; yesterday: string },
  fallback: 'day' | 'date' = 'day',
): string {
  const key = dayKeyUTC(date);
  if (key === dayKeyUTC(now)) return labels.today;
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (key === dayKeyUTC(yesterday)) return labels.yesterday;
  if (fallback === 'date') {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
  }
  return formatDayLabel(date, locale);
}
