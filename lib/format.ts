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
