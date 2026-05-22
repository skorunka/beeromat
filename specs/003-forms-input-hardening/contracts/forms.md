# Contracts: Forms & Input Hardening (v1.2)

This feature exposes no new Server Action or HTTP interface. Its contracts are
(1) the in-app **Form primitive** API, (2) the **validation behaviour** every
migrated form must honour, (3) the **shared-schema** contract between client
and Server Action, and (4) the **`forms:check`** verification gate.

The v1 Server Action contracts (`specs/001-beer-consumption-ledger/contracts/`)
are **unchanged** — every action keeps its exact name, parameters, and
discriminated-union return type (FR-014).

---

## 1. Form primitive — `components/ui/form.tsx`

A shadcn-style wrapper over `react-hook-form`. Building forms from these
primitives is what makes consistency (SC-001/002/005) and accessibility
(FR-009) structural rather than per-form discipline.

| Export | Role |
|--------|------|
| `Form` | Provides the `react-hook-form` context (`FormProvider`). |
| `FormField` | Binds one schema field via `Controller`; supplies field state to descendants. |
| `FormItem` | Layout wrapper for one field; generates the id wired across label / control / message. |
| `FormLabel` | `<label>` bound to the control; gets the error colour when the field is invalid. |
| `FormControl` | Wraps the input; sets `aria-invalid`, `aria-describedby` (→ message id), and the error/description wiring. |
| `FormMessage` | Renders the field error. **MUST** translate: it receives a catalog *key* and renders `t(key)`. Renders nothing when the field is valid. Carries `role="alert"`. |
| `FormRootError` | Renders a **form-level** (non-field) error — Turnstile failure, uniqueness conflict, generic action failure. Visually and semantically distinct from `FormMessage` (FR-012). |

**Contract**:

- `FormMessage` MUST NOT receive pre-translated text — only a key — so a
  locale switch re-renders it (FR-008).
- `FormControl` MUST set `aria-invalid` and associate the message via
  `aria-describedby` (FR-009).
- All controls rendered through these primitives keep the ≥44 px touch target
  established in v1.1 (FR-013).
- No primitive may emit a native validation attribute (`required`, `pattern`)
  — see gate §4.

---

## 2. Validation behaviour contract (every migrated form)

Each of the 11 forms, once migrated, MUST satisfy:

| # | Behaviour | Source |
|---|-----------|--------|
| B1 | No browser-native validation bubble appears for any invalid input. | FR-001, SC-001 |
| B2 | Invalid input is reported in-app, beside the field, via `FormMessage`. | FR-002 |
| B3 | The message text comes from the catalog and renders in the active locale. | FR-003, SC-002 |
| B4 | Client validation uses the **same** shared schema the Server Action validates with. | FR-004, SC-004 |
| B5 | The Server Action's `safeParse` of the shared schema remains the authoritative check, unchanged in strictness. | FR-005 |
| B6 | Correcting a field clears its message without a full re-submit (`mode: 'onTouched'` + re-validate on change). | FR-006 |
| B7 | An invalid submit never clears the other fields' entered values. | FR-007, SC-003 |
| B8 | A visible message re-renders in the new locale when the user switches language. | FR-008 |
| B9 | The message is associated with its field for assistive tech. | FR-009 |
| B10 | The submit control is disabled while a submission is in flight; no double-submit. | FR-010 |
| B11 | Cross-field errors (PIN mismatch) render clearly, not mis-attributed to one field. | FR-011 |
| B12 | Form-level errors (Turnstile, conflicts, action failure) render via `FormRootError`, separate from field errors. | FR-012 |

**Server-result mapping** (Decision 3): an action's `{ ok: false, code }` is
mapped on return:

| Code class | Example codes | Mapped to |
|------------|---------------|-----------|
| Field-attributable | `DUPLICATE_NAME` → name; `ALREADY_MEMBER` / `ALREADY_INVITED` → email | `form.setError('<field>', { message: '<key>' })` |
| Form-level | `EMAIL_SEND_FAILED`, Turnstile failure, `INVALID_INPUT` fallback | `FormRootError` |

---

## 3. Shared-schema contract (`lib/validation/`)

- Each form has exactly one exported schema; the client form and the Server
  Action both import **that** schema (FR-004).
- A schema MUST be locale-free: every fallible constraint emits a **catalog
  key** as its message, not user text (research.md Decision 2).
- A Server Action MAY keep returning a coarse `INVALID_INPUT` code — the
  shared schema does not change the action's *return* contract, only its
  *internal* validation source.
- Adding the shared schema MUST NOT make a Server Action reject any input it
  accepted in v1 (it MAY newly reject input the client could never validly
  have produced — e.g. a malformed member-invite email — which is a safe
  tightening, see data-model.md).

---

## 4. `forms:check` verification gate — `scripts/forms-check.ts`

A new gate, run as `pnpm forms:check`, joining `i18n:check`. Mirrors the
`i18n:check` script shape (a `tsx` script, a `pnpm` script, a CI gate).

**The gate scans `app/` and `components/` and FAILS if it finds:**

| Rule | Rejected | Rationale |
|------|----------|-----------|
| G1 | `type="date"`, `type="time"`, `type="datetime-local"` on any element | FR-015 / FR-016 / SC-006 — native date/time pickers are banned |
| G2 | the `required` attribute on any form control | FR-001 — `required` is what triggers the native bubble |
| G3 | the `pattern` attribute on any form control | FR-001 — `pattern` also triggers native validation |

**The gate explicitly ALLOWS**: `maxLength` (caps length, no bubble — the PIN
field uses it legitimately), `inputMode`, `type="tel"|"email"|"number"` (these
are keyboard/semantics hints, not validation popups).

**Contract**:

- Exit non-zero with a file:line list on any violation; exit zero and print a
  one-line OK summary otherwise — same UX as `i18n:check`.
- On the v1.2 end state the gate passes (zero violations); introducing any
  banned construct fails it 100% of the time (SC-006).
- The gate is a build script — **not** shipped application code — so it
  respects the constitution's Test/Prod separation rule.

---

## 5. Acceptance → verification mapping

Every spec acceptance scenario maps to an automated check (SC-007):

| Spec scenario | Verified by |
|---------------|-------------|
| US1 1–6 (auth/onboarding forms) | E2E `us3-1xx-forms-auth.spec.ts` — invalid submit shows in-app localized message, no native bubble; correction clears it; locale switch re-renders; double-submit fires once |
| US2 1–4 (money forms) | E2E `us3-1xx-forms-money.spec.ts` — malformed/zero amount + missing note rejected in-app; valid records exactly as v1 |
| US3 1–4 (admin forms) | E2E `us3-1xx-forms-admin.spec.ts` — malformed email / IBAN / quantity / empty reason rejected in-app, other fields preserved |
| US4 1–2 (date guardrail) | `forms:check` unit behaviour — fails on an injected native date input, passes on current source |
| FR-001 / SC-001 / SC-006 | `forms:check` gate (G1–G3) across the whole app |
| FR-003 / SC-002 | `i18n:check` — every `forms.*` key resolves in both catalogs |
