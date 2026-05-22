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

/** A non-negative whole-number string (stock count / threshold). */
const wholeNumber = z
  .string()
  .trim()
  .refine((v) => /^\d+$/.test(v), { error: formMessages.notAWholeNumber });

/** Beer-type create — name, price, opening stock, low-stock threshold. */
export const beerTypeCreateSchema = z.object({
  name: nameField,
  price: priceField,
  initialStock: wholeNumber,
  lowStockThreshold: wholeNumber,
});
export type BeerTypeCreateValues = z.infer<typeof beerTypeCreateSchema>;

/** Beer-type edit — name, price, low-stock threshold (stock is not edited). */
export const beerTypeEditSchema = z.object({
  name: nameField,
  price: priceField,
  lowStockThreshold: wholeNumber,
});
export type BeerTypeEditValues = z.infer<typeof beerTypeEditSchema>;
