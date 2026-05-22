// v1.2 forms hardening — shared major-unit ⇄ minor-unit money helper.
//
// Lifted verbatim from the (previously duplicated) logic in
// components/treasurer/manual-payment-form.tsx so the amount schemas in
// lib/validation/payments.ts and lib/validation/beer-types.ts and the forms
// themselves all parse money the same way.

/**
 * Parse a major-unit decimal string (e.g. "120", "120.50", "120,50") into
 * integer minor units (e.g. 12050n). Returns null when the input is not a
 * well-formed amount with at most two fractional digits.
 */
export function toMinor(major: string): bigint | null {
  if (!/^\d+([.,]\d{1,2})?$/.test(major.trim())) return null;
  const [whole = '0', frac = ''] = major.trim().replace(',', '.').split('.');
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0'));
}
