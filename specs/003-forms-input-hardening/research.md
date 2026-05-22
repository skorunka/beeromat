# Phase 0 Research: Forms & Input Hardening (v1.2)

All NEEDS CLARIFICATION from the spec were resolved before planning (User
Story 4 — date-picker scope — answered by the user: guardrail only). This
document records the library-version verification the constitution requires
and the design decisions the plan rests on.

## Decision 1 — Form library and versions

**Decision**: Adopt `react-hook-form@7.76.0` and `@hookform/resolvers@5.4.0`
(both latest stable, web-verified 2026-05-22). `zod` stays at the
already-installed `4.4.x`. The Zod resolver is imported as
`import { zodResolver } from '@hookform/resolvers/zod'`.

**Rationale**:
- Constitution v1.5.0 *names* `react-hook-form` with a Zod resolver as the
  chosen standard, so the library choice is pre-ratified; this feature only
  pins the version.
- `react-hook-form@7.76.0` declares React `^16.8 || ^17 || ^18 || ^19` as a
  peer — React 19.2 is supported.
- `@hookform/resolvers` added Zod 4 support in **v5.1.0** (Zod 4, Zod 4-mini,
  and still Zod 3); v5.4.0 carries the later type-compatibility fixes for the
  Zod 4 resolver. It peer-depends on `react-hook-form@^7.55.0`, satisfied by
  7.76.0. So the project's existing `zod@4.4.x` works with `zodResolver`
  unchanged — no Zod downgrade, no `zod/v4` import gymnastics.

**Alternatives considered**:
- *TanStack Form* — capable, but the constitution already chose
  react-hook-form; deviating would need an amendment for no benefit.
- *Native `<form>` + `useActionState` only, no client library* — leaves
  validation server-round-trip-only, which is the slow, no-inline-feedback
  experience v1.2 exists to remove.
- *Staying on Zod 3* — pointless; the project is already on Zod 4 server-side
  and resolvers v5 supports it.

## Decision 2 — Localized validation messages: schemas emit catalog keys

**Decision**: Shared Zod schemas carry **catalog message keys as their issue
messages**, never user-facing text. Example:
`z.string().min(1, { error: 'forms.required' })`. The client maps
`fieldState.error.message` (the key) through `next-intl`'s `t()` at render
time; the `FormMessage` primitive does this centrally. The schema file stays
locale-free and runs identically on client and server.

**Rationale**:
- A schema shared between client and Server Action cannot bake in a locale —
  the server doesn't know the request locale at schema-definition time and the
  client must re-render messages when the user switches language (FR-008).
- Emitting a stable key keeps the catalog the single source of message *text*
  (FR-003) and lets `i18n:check` (gate 6) verify every key resolves.
- Many target strings **already exist** in the catalog — `pin.setup.mismatch`,
  `pin.setup.invalidFormat`, `settle.invalidAmount`, `admin.invalidIban`,
  `admin.adjustReasonRequired`, `invitation.errorNameRequired`, etc. The
  schema error keys point at those; only genuinely new messages (a small,
  generic `forms.*` set — required / tooShort / tooLong / notANumber /
  notAWholeNumber / mustBePositive) are added.
- Where a Zod message needs a number (max length), the catalog string states
  the bound literally and the schema and string are kept in agreement; no
  runtime interpolation is needed for v1.2's fields.

**Alternatives considered**:
- *Zod global `errorMap` returning translated text on the server, plain keys
  on the client* — two code paths for one schema; rejected, the key-everywhere
  approach is uniform.
- *Per-locale schema instances* — defeats "one shared schema" (FR-004).

## Decision 3 — react-hook-form ↔ Server Action integration

**Decision**: Forms stay `'use client'` components. Each uses
`useForm({ resolver: zodResolver(schema), mode: 'onTouched' })`. Submission is
`form.handleSubmit(async (values) => { ... })`, which runs client-side Zod
validation first and only then calls the **existing Server Action** inside the
existing `useTransition`. The action's discriminated-union result
(`{ ok: false, code }`) is mapped back onto the form:

- Field-attributable codes → `form.setError('<field>', { message: '<key>' })`
  (e.g. `DUPLICATE_NAME` → the name field, `NOT_FOUND` for a member email).
- Non-field codes (Turnstile failure, generic `INVALID_INPUT` fallback, action
  errors) → a form-level error region rendered by a `FormRootError` primitive
  — kept visually and semantically distinct from field errors (FR-012).

The Server Action keeps its exact signature and return type (FR-014). It
swaps its inline `z.object({...})` for an import of the shared schema; because
the schema validates the same inputs, server behaviour is unchanged. Actions
that currently hand-roll validation (sign-in, PIN, invitation, member invite,
settle) gain a schema whose rules are transcribed 1:1 from the existing manual
checks — verified by keeping their existing unit/E2E coverage green.

**Rationale**:
- Reuses the project's established `useTransition` + discriminated-union
  pattern, so the action layer and its tests are untouched.
- Server-side `safeParse` stays the authoritative boundary (FR-005); the
  client resolver is the UX layer over the identical schema.
- Progressive enhancement: if the client layer has not hydrated, the native
  `<form>` still posts and the Server Action still rejects invalid input — its
  error is surfaced in-app via `FormRootError`, never as a native bubble,
  because the `required`/`pattern` attributes are removed (Decision 5).

**Alternatives considered**:
- *`useActionState` as the form driver* — works for simple forms but doesn't
  give per-field, pre-submit inline validation; react-hook-form is the layer
  that does, and the constitution picked it.

## Decision 4 — Shared-schema location and the Form UI primitive

**Decision**: Shared schemas live in **`lib/validation/<domain>.ts`**, grouped
by form domain (`auth`, `invitation`, `members`, `banking`, `beer-types`,
`stock`, `payments`), with `lib/validation/messages.ts` holding the new
`forms.*` error-key constants. A new **`components/ui/form.tsx`** provides the
shadcn-style react-hook-form primitives — `Form`, `FormField`, `FormItem`,
`FormLabel`, `FormControl`, `FormMessage`, `FormRootError` — that wire
`aria-invalid` / `aria-describedby` / `role="alert"` automatically and render
messages through `t()`.

**Rationale**:
- `lib/validation/` matches the existing `lib/<domain>/` layout (`lib/auth`,
  `lib/balance`, `lib/permissions`, …) and is import-neutral: both a
  `components/` form and an `app/.../actions.ts` Server Action import it
  without a component reaching into a route folder.
- A single `Form` primitive set is what makes "every form behaves the same"
  (SC-001/002/005) and accessibility (FR-009) a property of the primitive
  rather than 11 hand-built repetitions. shadcn/ui's `form` component is the
  community-standard shape of exactly this; the project already uses shadcn/ui
  over base-ui, so it is idiomatic here.

**Alternatives considered**:
- *Schemas co-located beside each Server Action* — would force `components/`
  forms to import from `app/` route folders; rejected.
- *Hand-rolled error rendering per form* — what v1.2 exists to eliminate.

## Decision 5 — The `forms:check` verification gate

**Decision**: Add `scripts/forms-check.ts`, run as `pnpm forms:check`, joining
`i18n:check` as a verification gate. It scans `app/` and `components/` and
**fails** if it finds:
1. a native date/time input — `type="date"`, `type="time"`, or
   `type="datetime-local"` (FR-015 / FR-016 / SC-006); or
2. a native browser-validation constraint on an input — the `required`
   attribute or a `pattern` attribute (FR-001 — these are what pop the native
   bubble).

`maxLength` and `inputMode` are **not** flagged: `maxLength` caps input length
without triggering a validation bubble (the PIN field legitimately uses it),
and `inputMode` only hints the keyboard.

**Rationale**:
- FR-016 / SC-006 require that a native date/time input or a native-validation
  form cannot reach `main`; a static gate is the only thing that makes that a
  100%-of-the-time guarantee rather than a review habit.
- `required` is the single attribute that, today, hands validation to the
  browser — banning it in source is the precise, greppable enforcement of
  FR-001. After the migration the count is zero, so the gate is stable.
- Mirroring `i18n:check` (a `tsx` script wired as a `pnpm` script and a CI
  gate) keeps the verification-infra pattern consistent and needs no new
  tooling.

**Alternatives considered**:
- *An ESLint rule* — heavier to author and the project's lint is framework
  default; a focused script matches the existing `i18n:check` precedent.
- *Also statically detecting "a form whose only validation is native"* — not
  reliably decidable from source; banning `required`/`pattern` outright is the
  decidable proxy and is in fact stricter.

## Decision 6 — Date-picker component deferred (User Story 4)

**Decision**: No date-picker component is built in v1.2. An audit of `app/`
and `components/` confirmed **zero** native date/time inputs and **zero**
screens that collect a date or time. v1.2 ships only the `forms:check`
guardrail (Decision 5). `react-day-picker` remains the constitution's named
standard for whenever a feature first needs date entry.

**Rationale**: The constitution explicitly states no picker work is needed
until a feature requires date entry; building a UI component with zero
consumers is speculative. The guardrail makes the rule enforced; the component
is a future feature's first task. (User-confirmed during `/speckit-specify`.)

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| Latest stable `react-hook-form` | 7.76.0 (React 19 peer-supported) |
| Latest stable `@hookform/resolvers` | 5.4.0 (Zod 4 support since 5.1.0) |
| Zod version | Stay on installed 4.4.x — resolvers v5 supports it |
| How localized messages survive a shared schema | Schemas emit catalog keys; UI translates (Decision 2) |
| Where shared schemas live | `lib/validation/<domain>.ts` (Decision 4) |
| How the date-entry rule is enforced | `forms:check` gate; picker deferred (Decisions 5–6) |

## Sources

- [react-hook-form — npm registry](https://registry.npmjs.org/react-hook-form/latest)
- [@hookform/resolvers — npm registry](https://registry.npmjs.org/@hookform/resolvers/latest)
- [@hookform/resolvers — npm](https://www.npmjs.com/package/@hookform/resolvers)
- [react-hook-form/resolvers — Releases](https://github.com/react-hook-form/resolvers/releases)
