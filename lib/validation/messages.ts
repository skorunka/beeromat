// v1.2 forms hardening — generic validation message keys.
//
// Shared Zod schemas (lib/validation/*) emit *catalog keys*, never literal
// text, as their issue messages — the same schema runs on the client and in
// the Server Action, and only the UI knows the locale. The client `Form`
// primitive (components/ui/form.tsx) translates the key at render time.
//
// These constants cover the generic cases. Form-specific messages reuse keys
// that already exist in the catalog (pin.setup.mismatch, settle.invalidAmount,
// admin.invalidIban, …) — see specs/003-forms-input-hardening/data-model.md.

export const formMessages = {
  required: 'forms.required',
  email: 'forms.email',
  tooShort: 'forms.tooShort',
  tooLong: 'forms.tooLong',
  notANumber: 'forms.notANumber',
  notAWholeNumber: 'forms.notAWholeNumber',
  mustBePositive: 'forms.mustBePositive',
} as const;

export type FormMessageKey = (typeof formMessages)[keyof typeof formMessages];
