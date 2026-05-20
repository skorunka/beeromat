// Build a Revolut payment link. The club's configured `revolutHandle`
// may be a bare tag ("johndoe") or a full revolut.me URL — both are
// normalised to an amount-prefilled payment URL:
//   https://revolut.me/<tag>/<amount><CURRENCY>

function minorToDecimal(amountMinor: bigint): string {
  const major = amountMinor / 100n;
  const cents = amountMinor % 100n;
  return `${major}.${cents.toString().padStart(2, '0')}`;
}

export function buildRevolutUrl(
  handle: string,
  amountMinor: bigint,
  currencyCode: string,
): string {
  const trimmed = handle.trim().replace(/\/+$/, '');
  const base = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://revolut.me/${trimmed.replace(/^@/, '')}`;
  return `${base}/${minorToDecimal(amountMinor)}${currencyCode.toUpperCase()}`;
}
