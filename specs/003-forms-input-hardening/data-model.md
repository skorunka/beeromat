# Data Model: Forms & Input Hardening (v1.2)

## Database & domain entities — NO CHANGE

v1.2 adds **no tables, no columns, no migrations, no domain entities**. The v1
data model (`specs/001-beer-consumption-ledger/data-model.md`) and every
Server Action contract remain the source of truth. This feature operates
entirely in the input-collection and validation-presentation layer.

The "model" v1.2 *does* introduce is a set of **shared validation schemas** and
a **validation-message-key catalog convention**. They are design artifacts,
not persisted data — documented here because they are what `/speckit-tasks`
and `/speckit-implement` build against.

## Shared validation schemas (`lib/validation/`)

One Zod schema per form, each the **single source of validation truth** for
both the client `react-hook-form` resolver and the Server Action. Rules below
are transcribed from the current v1 behaviour; `/speckit-implement` MUST keep
them behaviour-equivalent (server acceptance unchanged — FR-005).

Every constraint that can fail carries a **catalog message key** (never literal
text — Decision 2 in research.md). `(key)` columns name the key the schema
emits; keys marked `*existing*` already live in the catalog.

### `lib/validation/auth.ts`

| Form | Field | Rule | Message key |
|------|-------|------|-------------|
| Sign-in | `email` | trimmed, non-empty, email format | `forms.email` |
| PIN setup | `pin` | exactly 4 digits (`/^\d{4}$/`) | `pin.setup.invalidFormat` *existing* |
| PIN setup | `confirmPin` | must equal `pin` (cross-field refinement) | `pin.setup.mismatch` *existing* |
| PIN unlock | `pin` | exactly 4 digits | `pin.setup.invalidFormat` *existing* |

### `lib/validation/invitation.ts`

| Form | Field | Rule | Message key |
|------|-------|------|-------------|
| Invitation accept | `displayName` | trimmed, non-empty, max 80 | `invitation.errorNameRequired` *existing* |

### `lib/validation/members.ts`

| Form | Field | Rule | Message key |
|------|-------|------|-------------|
| Member invite | `email` | trimmed, non-empty, email format | `forms.email` |
| Member invite | `role` | one of the four `Role` enum values | `forms.required` |

> The member-invite Server Action currently performs **no** format check on
> the email (it only checks already-member / already-invited). v1.2 adds the
> shared schema; this *tightens* the client and is a safe addition server-side
> (a malformed email could never have matched a member or invitation anyway).

### `lib/validation/banking.ts`

| Form | Field | Rule | Message key |
|------|-------|------|-------------|
| Banking profile | `iban` | trimmed; empty allowed (clears it); else 15–34 chars, `/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/`, **and** mod-97 checksum (`isValidIban`) | `admin.invalidIban` *existing* |
| Banking profile | `accountHolderName` | max 120 | `forms.tooLong` |
| Banking profile | `revolutHandle` | max 120 | `forms.tooLong` |
| Banking profile | `defaultQrMessage` | max 60 | `forms.tooLong` |

> The mod-97 checksum is not expressible as a Zod primitive; it is a Zod
> `.refine()` calling the existing `isValidIban` from `lib/qr-platba/iban`, so
> the same function runs client- and server-side.

### `lib/validation/beer-types.ts`

| Form | Field | Rule | Message key |
|------|-------|------|-------------|
| Beer-type add/edit | `name` | trimmed, non-empty, max 120 | `forms.required` / `forms.tooLong` |
| Beer-type add/edit | `unitPriceMajor` | decimal string, parses to minor units > 0 | `admin.beerTypeFieldsError` *existing* |
| Beer-type add | `initialStock` | integer ≥ 0 | `forms.notAWholeNumber` |
| Beer-type add/edit | `lowStockThreshold` | integer ≥ 0 | `forms.notAWholeNumber` |

> The action stores `unitPriceMinor` as a digit string; the *form* collects a
> major-unit decimal. The schema validates the major-unit decimal and a shared
> `toMinor` helper (see below) converts. Duplicate-name (`DUPLICATE_NAME`) is a
> DB-uniqueness check, not a schema rule — it stays a server result code mapped
> onto the `name` field via `setError` (FR-011/Decision 3).

### `lib/validation/stock.ts`

| Form | Field | Rule | Message key |
|------|-------|------|-------------|
| Restock | `quantity` | integer > 0 | `admin.invalidQuantity` *existing* |
| Restock | `reason` | optional, max 500 | `forms.tooLong` |
| Stock adjust | `delta` | integer, non-zero | `admin.invalidDelta` *existing* |
| Stock adjust | `reason` | trimmed, non-empty, max 500 | `admin.adjustReasonRequired` *existing* |

> `WOULD_GO_NEGATIVE` is an atomic DB guard, not a schema rule — it remains a
> server result code shown as a form-level error.

### `lib/validation/payments.ts`

| Form | Field | Rule | Message key |
|------|-------|------|-------------|
| Settle "paid another way" | `amountMajor` | decimal string, parses to minor units > 0 | `settle.invalidAmount` *existing* |
| Settle "paid another way" | `note` | trimmed, non-empty | `settle.noteRequired` *existing* |
| Treasurer manual payment | `amountMajor` | decimal string, parses to minor units > 0 | `settle.invalidAmount` *existing* |
| Treasurer manual payment | `note` | optional | — |

### `lib/validation/messages.ts`

Constants for the **new, generic** `forms.*` error keys (the form-specific
keys above already exist in the catalog and are reused as-is):

| Key | cs / en intent (mate tone, gender-neutral) |
|-----|--------------------------------------------|
| `forms.required` | "This one's needed." / "Doplň to ještě." |
| `forms.email` | "That email doesn't look right." / "Tenhle e-mail nevypadá správně." |
| `forms.tooShort` | "A bit short." / "Trochu krátké." |
| `forms.tooLong` | "That's too long." / "To je moc dlouhé." |
| `forms.notANumber` | "Needs to be a number." / "Tady patří číslo." |
| `forms.notAWholeNumber` | "Whole numbers only." / "Jen celé číslo." |
| `forms.mustBePositive` | "Needs to be more than zero." / "Musí být víc než nula." |

Exact wording is finalised during implementation against the v1.1 tone; the
keys are the contract.

## Shared helpers

- **`toMinor(major: string): bigint | null`** — major-unit decimal string →
  integer minor units. This logic exists today, duplicated, inside
  `manual-payment-form.tsx`. v1.2 lifts it to a shared module (e.g.
  `lib/validation/money.ts` or `lib/format.ts`) so the amount schemas and the
  forms use one implementation.
- **`isValidIban` / `normalizeIban`** — already shared in `lib/qr-platba/iban`;
  the banking schema's `.refine()` reuses them unchanged.

## Validation message flow (no state, but a data path)

```text
shared Zod schema ──emits──▶ issue.message = catalog key (e.g. "forms.email")
        │                                          │
   safeParse (server,                       zodResolver (client,
   Server Action —                          react-hook-form)
   authoritative)                                  │
        │                                   fieldState.error.message = key
   { ok:false, code }                              │
        │                                  FormMessage renders t(key)
        ▼                                          ▼
  mapped to setError /                  localized text beside the field,
  FormRootError on the client            re-rendered on locale switch
```

No persisted state changes. The only "transition" is a form field moving
between *untouched → invalid(key) → valid*, owned entirely by
`react-hook-form` in client memory.
