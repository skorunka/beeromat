// ISO 13616 IBAN validation — structural regex + mod-97 checksum.
// Used to guard the club banking profile (contracts/admin.md →
// updateBankingProfile) so a malformed IBAN never reaches a SPAYD QR.

const IBAN_STRUCTURE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

/** Normalise for storage/comparison: strip whitespace, upper-case. */
export function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * True when `raw` is a structurally valid IBAN whose mod-97 checksum
 * holds. Letters map A→10 … Z→35; the first four chars move to the end
 * before the modulo is taken (ISO 13616).
 */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!IBAN_STRUCTURE.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (ch) =>
    String(ch.charCodeAt(0) - 55),
  );

  // Reduce the (potentially long) numeric string modulo 97 in chunks to
  // stay within safe integer arithmetic.
  let remainder = 0;
  for (let i = 0; i < digits.length; i += 7) {
    remainder = Number(`${remainder}${digits.slice(i, i + 7)}`) % 97;
  }
  return remainder === 1;
}
