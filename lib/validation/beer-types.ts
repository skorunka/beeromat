// v1.2 forms hardening — shared schemas for the beer-type add/edit forms.
//
// The forms collect string inputs (a major-unit price, digit-string stock
// counts); the schema validates those strings and the component converts to
// the action's representation (`toMinor`, `Number`). Constraint failures emit
// catalog keys.

import { z } from 'zod';

import { formMessages } from './messages';
import { toMinor } from './money';

const nameField = z
  .string()
  .trim()
  .min(1, { error: formMessages.required })
  .max(120, { error: formMessages.tooLong });

/** A major-unit price string that parses to a positive minor-unit amount. */
const priceField = z.string().trim().refine(
  (v) => {
    const minor = toMinor(v);
    return minor !== null && minor > 0n;
  },
  { error: 'admin.beerTypeFieldsError' },
);

/** Optional buy-price (spec 011) — empty string OR a non-negative
 *  major-unit decimal that parses cleanly. Zero is allowed (a
 *  donated case). The cross-field "sell ≥ buy" rule is applied on
 *  the whole object via .superRefine below. */
const buyPriceField = z
  .string()
  .trim()
  .refine(
    (v) => {
      if (v === '') return true;
      const minor = toMinor(v);
      return minor !== null && minor >= 0n;
    },
    { error: 'admin.beerTypeFieldsError' },
  );

/** A non-negative whole-number string (stock count / threshold). */
const wholeNumber = z
  .string()
  .trim()
  .refine((v) => /^\d+$/.test(v), { error: formMessages.notAWholeNumber });

/** Cross-field check: when both are set, sell ≥ buy. Otherwise the
 *  per-field checks above already fired. Emits a catalog key against
 *  the buyPrice field so the inline error lands where the user can
 *  fix it. */
function sellAboveBuy(
  values: { price: string; buyPrice?: string },
  ctx: z.RefinementCtx,
): void {
  const buy = values.buyPrice?.trim() ?? '';
  if (buy === '') return;
  const sellMinor = toMinor(values.price);
  const buyMinor = toMinor(buy);
  if (sellMinor === null || buyMinor === null) return;
  if (buyMinor > sellMinor) {
    ctx.addIssue({
      code: 'custom',
      path: ['buyPrice'],
      message: 'admin.beerTypeBuyAboveSell',
    });
  }
}

/** Beer-type create — name, price, optional buy price, opening stock,
 *  low-stock threshold. */
export const beerTypeCreateSchema = z
  .object({
    name: nameField,
    price: priceField,
    buyPrice: buyPriceField.optional().default(''),
    initialStock: wholeNumber,
    lowStockThreshold: wholeNumber,
  })
  .superRefine(sellAboveBuy);
export type BeerTypeCreateValues = z.infer<typeof beerTypeCreateSchema>;

/** Beer-type edit — name, price, optional buy price, low-stock
 *  threshold (stock is not edited). */
export const beerTypeEditSchema = z
  .object({
    name: nameField,
    price: priceField,
    buyPrice: buyPriceField.optional().default(''),
    lowStockThreshold: wholeNumber,
  })
  .superRefine(sellAboveBuy);
export type BeerTypeEditValues = z.infer<typeof beerTypeEditSchema>;
