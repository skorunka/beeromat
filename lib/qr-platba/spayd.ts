// Czech QR Platba (SPAYD / Short Payment Descriptor) string builder.
// research.md §7 — format:
//   SPD*1.0*ACC:<IBAN>*AM:<amount>*CC:<currency>*X-VS:<vs>*MSG:<msg>
//
// Every major Czech banking app scans this. The amount uses a decimal
// POINT (never a comma) with 2 decimals; values must not contain '*'.

export interface SpaydArgs {
  iban: string;
  amountMinor: bigint;
  currencyCode: string;
  variableSymbol: bigint;
  message: string;
}

/** Minor units (e.g. CZK halléř) → "decimal.point" major-unit string. */
function minorToDecimal(amountMinor: bigint): string {
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  const major = abs / 100n;
  const cents = abs % 100n;
  return `${negative ? '-' : ''}${major}.${cents.toString().padStart(2, '0')}`;
}

/**
 * SPAYD `MSG` must be ASCII and free of '*'. Czech diacritics are
 * stripped (the domestic bank network historically mangles non-ASCII
 * in this field). Capped at 60 chars per the spec's practical limit.
 */
function sanitizeMessage(message: string): string {
  return message
    .replace(/\*/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, 60);
}

export function buildSpaydString(args: SpaydArgs): string {
  const iban = args.iban.replace(/\s+/g, '').toUpperCase();
  const amount = minorToDecimal(args.amountMinor);
  const currency = args.currencyCode.toUpperCase();
  const msg = sanitizeMessage(args.message);

  const fields = [
    'SPD*1.0',
    `ACC:${iban}`,
    `AM:${amount}`,
    `CC:${currency}`,
    `X-VS:${args.variableSymbol}`,
  ];
  if (msg) fields.push(`MSG:${msg}`);
  return fields.join('*');
}
