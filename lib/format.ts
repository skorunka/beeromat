// Currency + number formatting helpers used by the UI.
// Amounts are always stored as integer minor units (CZK halléř, EUR cent)
// — convert to a major-unit number at the formatting boundary only.

export function formatMoney(
  amountMinor: bigint,
  currencyCode: string,
  locale: string,
): string {
  const amountMajor = Number(amountMinor) / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
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
