---
description: "Task list for Forms & Input Hardening (v1.2)"
---

# Tasks: Forms & Input Hardening (v1.2)

**Input**: Design documents from `specs/003-forms-input-hardening/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/forms.md

**Tests**: Test tasks ARE included — spec SC-007 requires every acceptance
scenario to have an automated E2E assertion, and the constitution makes
Playwright E2E a verification gate.

**Organization**: Tasks are grouped by user story. Stories are sliced by form
group; each is independently implementable and independently verifiable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US4 maps the task to its spec user story

**Verifiable Tasks rule (constitution).** Every task below is observable by a
gate (`typecheck`, `lint`, `i18n:check`, `forms:check`, `build`) or an
acceptance E2E test. No task relies on unverifiable "looks done".

## Path Conventions

Single Next.js App Router app at the repository root: `app/`, `components/`,
`lib/`, `messages/`, `scripts/`, `tests/e2e/`, `tests/unit/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bring the chosen form library into the project.

- [X] T001 Add runtime dependencies `react-hook-form@7.76.0` and `@hookform/resolvers@5.4.0` via `pnpm add`; confirm `zod` stays at 4.4.x; run `pnpm install` and `pnpm typecheck` and confirm both succeed.

**Checkpoint**: The form library resolves and the project still type-checks.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The cross-cutting validation infrastructure every form migration
depends on — the message-key catalog, the shared money helper, and the `Form`
UI primitive.

**⚠️ CRITICAL**: No user-story form migration can begin until this phase is complete.

- [X] T002 [P] Create `lib/validation/messages.ts` exporting the generic `forms.*` error-key constants (`required`, `email`, `tooShort`, `tooLong`, `notANumber`, `notAWholeNumber`, `mustBePositive`) per data-model.md.
- [X] T003 Add the `forms` namespace to `messages/cs.json` and `messages/en.json` with values for every key in `lib/validation/messages.ts`, in the v1.1 mate-to-mate tone and gender-neutral Czech; confirm `pnpm i18n:check` passes (catalog parity).
- [X] T004 [P] Create `lib/validation/money.ts` exporting `toMinor(major: string): bigint | null` (major-unit decimal string → integer minor units), lifted verbatim from the duplicated logic in `components/treasurer/manual-payment-form.tsx`.
- [X] T005 Create `components/ui/form.tsx` — the shadcn-style react-hook-form primitives `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`, `FormRootError` per contracts/forms.md §1: `FormControl` wires `aria-invalid`/`aria-describedby`, `FormMessage` renders `t(key)` and carries `role="alert"`, `FormRootError` renders form-level errors distinctly, controls keep ≥44 px targets. Confirm `pnpm typecheck` and `pnpm lint` pass.

**Checkpoint**: Foundation ready — form migrations can begin.

---

## Phase 3: User Story 1 - Trustworthy auth & onboarding forms (Priority: P1) 🎯 MVP

**Goal**: Sign-in, PIN setup, PIN unlock, and invitation-accept validate
in-app, in the active locale, with no native browser bubble.

**Independent Test**: On each auth/onboarding form, submit invalid input → an
in-app localized message appears beside the field, no native bubble; correct
it → the message clears; switch language → the message re-renders translated.

- [X] T006 [P] [US1] Create `lib/validation/auth.ts` — the sign-in email schema and the PIN setup/unlock schemas (exactly 4 digits; setup adds a cross-field refinement that `confirmPin` equals `pin`), each emitting catalog keys per data-model.md (`forms.email`, `pin.setup.invalidFormat`, `pin.setup.mismatch`).
- [X] T007 [P] [US1] Create `lib/validation/invitation.ts` — the invitation-accept `displayName` schema (trimmed, non-empty, max 80) emitting `invitation.errorNameRequired`.
- [X] T008 [US1] Migrate `app/[locale]/(auth)/sign-in/SignInForm.tsx` to `react-hook-form` + the `Form` primitives + `lib/validation/auth.ts`; remove the native `required` attribute; map a Turnstile failure to `FormRootError` (not a field error).
- [X] T009 [US1] Migrate `components/pin/pin-gate.tsx` (both `setup` and `unlock` modes) to `react-hook-form` + `lib/validation/auth.ts`; render the PIN-mismatch cross-field error via `FormMessage`; preserve the forgot-PIN escape, the wrong-PIN attempts-remaining message, and the lockout handling as `FormRootError`.
- [X] T010 [US1] Migrate `app/[locale]/(auth)/invitation/[token]/InvitationForm.tsx` to `react-hook-form` + the `Form` primitives + `lib/validation/invitation.ts`; remove native constraints; map action error codes to `FormRootError`.
- [X] T011 [US1] Wire the shared schemas into the sign-in / PIN / invitation Server Actions in `lib/auth/actions.ts` and the invitation-accept action — replace the hand-rolled checks with `schema.safeParse`, transcribing the rules 1:1; keep every action signature and return type unchanged (FR-014).
- [X] T012 [US1] Update `tests/e2e/fixtures/auth.ts` (`signInAndUnlock`) for any input `id`/role/selector changed by T008–T010, so the existing v1 E2E suite still drives sign-in + PIN; run a smoke E2E to confirm the auth fixture works.
- [X] T013 [P] [US1] Create `tests/e2e/forms-auth.spec.ts` asserting US1 acceptance scenarios 1–6: invalid PIN/email/name → in-app localized message and **no native validation bubble**; PIN mismatch cross-field message; locale switch re-renders a visible error; double-tap submit fires the action once.

**Checkpoint**: Auth & onboarding forms fully hardened and independently testable.

---

## Phase 4: User Story 2 - Trustworthy money forms (Priority: P2)

**Goal**: The settle "paid another way" form and the treasurer manual-payment
form validate amounts and notes in-app, in the active locale, before the
Server Action runs.

**Independent Test**: On each money form, enter a malformed/zero amount or omit
a required note → in-app localized message, no native bubble, the action does
not fire; a valid entry records exactly as in v1.

- [ ] T014 [P] [US2] Create `lib/validation/payments.ts` — the schemas for the settle "paid another way" form (`amountMajor` decimal → minor units > 0, `note` trimmed non-empty) and the treasurer manual-payment form (`amountMajor` > 0, optional `note`), using `toMinor` from `lib/validation/money.ts` and emitting `settle.invalidAmount` / `settle.noteRequired`.
- [ ] T015 [US2] Migrate `components/settle/paid-other-method.tsx` to `react-hook-form` + the `Form` primitives + `lib/validation/payments.ts`; remove native `required`.
- [ ] T016 [US2] Migrate `components/treasurer/manual-payment-form.tsx` to `react-hook-form` + `lib/validation/payments.ts`; replace the `toast.error` validation feedback with `FormMessage`; remove native `required`; **keep the `#manual-amount` and `#manual-note` input ids** that `tests/e2e/us4-treasurer-manual.spec.ts` depends on.
- [ ] T017 [US2] Wire the shared schemas into `markPaidOtherMethodAction` (`app/[locale]/(app)/settle/actions.ts`) and `recordManualPaymentAction` (`app/[locale]/(app)/admin/balances/actions.ts`) — replace the inline/hand-rolled validation; keep action signatures and return types unchanged (FR-014).
- [ ] T018 [P] [US2] Create `tests/e2e/forms-money.spec.ts` asserting US2 acceptance scenarios 1–4: non-numeric/zero/negative amount and missing required note → in-app localized message, no native bubble, action not fired; a valid amount + note records as in v1.

**Checkpoint**: US1 and US2 form groups both hardened and independently testable.

---

## Phase 5: User Story 3 - Trustworthy admin forms (Priority: P3)

**Goal**: Member invite, banking profile, and the beer-type / restock / adjust
forms validate in-app, in the active locale, beside the field.

**Independent Test**: For each admin form, submit a malformed email / IBAN /
non-integer quantity / empty reason → in-app localized message, no native
bubble, other fields keep their values; valid input proceeds as in v1.

- [ ] T019 [P] [US3] Create `lib/validation/members.ts` — the member-invite schema (`email` trimmed non-empty email-format → `forms.email`; `role` one of the four `Role` values).
- [ ] T020 [P] [US3] Create `lib/validation/banking.ts` — the banking-profile schema (`iban` empty-or [15–34, structural regex, **plus** a `.refine()` calling `isValidIban` from `lib/qr-platba/iban`] → `admin.invalidIban`; `accountHolderName`/`revolutHandle` max 120, `defaultQrMessage` max 60 → `forms.tooLong`).
- [ ] T021 [P] [US3] Create `lib/validation/beer-types.ts` — the beer-type add/edit schema (`name` trimmed non-empty max 120; `unitPriceMajor` decimal parsing via `toMinor` to > 0; `initialStock`/`lowStockThreshold` integer ≥ 0).
- [ ] T022 [P] [US3] Create `lib/validation/stock.ts` — the restock schema (`quantity` integer > 0 → `admin.invalidQuantity`; `reason` optional max 500) and the stock-adjust schema (`delta` integer non-zero → `admin.invalidDelta`; `reason` trimmed non-empty max 500 → `admin.adjustReasonRequired`).
- [ ] T023 [US3] Migrate `components/admin/invite-form.tsx` to `react-hook-form` + the `Form` primitives + `lib/validation/members.ts`; remove native constraints; map `ALREADY_MEMBER`/`ALREADY_INVITED` onto the email field via `setError`, `EMAIL_SEND_FAILED` to `FormRootError`.
- [ ] T024 [US3] Migrate `components/admin/banking-form.tsx` to `react-hook-form` + `lib/validation/banking.ts`; remove native constraints; the IBAN error flags the IBAN field specifically while other fields keep their values.
- [ ] T025 [US3] Migrate `components/admin/beer-type-manager.tsx` (the add/edit, restock, and adjust forms it hosts) to `react-hook-form` + `lib/validation/beer-types.ts` and `lib/validation/stock.ts`; remove native constraints; map `DUPLICATE_NAME` onto the name field and `WOULD_GO_NEGATIVE`/`ARCHIVED` to `FormRootError`.
- [ ] T026 [US3] Wire the shared schemas into the Server Actions — `inviteMemberAction` (`admin/members/actions.ts`), `updateBankingProfileAction` (`admin/settings/actions.ts`), and `createBeerTypeAction`/`updateBeerTypeAction`/`recordRestockAction`/`recordStockAdjustmentAction` (`admin/beer-types/actions.ts`) — replacing inline `z.object()` / hand-rolled checks; keep all signatures and return types unchanged (FR-014).
- [ ] T027 [P] [US3] Create `tests/e2e/forms-admin.spec.ts` asserting US3 acceptance scenarios 1–4: malformed email / IBAN / non-positive-integer quantity / empty adjust reason → in-app localized message, no native bubble, sibling fields preserved.

**Checkpoint**: All three form groups (US1–US3) hardened and independently testable.

---

## Phase 6: User Story 4 - A locale-aware standard for date entry (Priority: P3)

**Goal**: A verification gate so a native date/time input — or a native
browser-validation constraint — can never reach `main`. (Decision: guardrail
only; no date-picker component is built — see spec.md US4.)

**Independent Test**: The gate fails when a native date/time input is injected
into the app source and passes against the migrated v1.2 source.

- [ ] T028 [US4] Create `scripts/forms-check.ts` (mirroring `scripts/i18n-check.ts`) — scans `app/` and `components/` and exits non-zero on G1 native `type="date"|"time"|"datetime-local"`, G2 the `required` attribute, or G3 the `pattern` attribute (allowing `maxLength`/`inputMode`/`type="tel|email|number"`) per contracts/forms.md §4; add the `forms:check` script to `package.json`.
- [ ] T029 [US4] Create `tests/unit/forms-check.test.ts` — a Vitest test that runs the gate's scan logic against a fixture containing a native `<input type="date">` (expect failure) and against clean markup (expect pass).
- [ ] T030 [US4] Wire `pnpm forms:check` into the project's CI gate list (`.github/workflows/`, alongside `i18n:check`); confirm `pnpm forms:check` passes against the fully migrated source.

**Checkpoint**: The date-entry guardrail is enforced; all four stories complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Confirm the migration broke nothing and every gate is green.

- [ ] T031 Run the full Playwright E2E suite (`pnpm exec playwright test`); fix any pre-existing v1/v1.1 spec that broke because a migrated form's markup changed (removed `required`, relocated error text from toast to `FormMessage`, changed selectors) — update the spec assertions, not the app behaviour.
- [ ] T032 Run all seven verification gates — `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm i18n:check`, `pnpm forms:check`, `pnpm build`, `pnpm exec playwright test` — and confirm every one passes.
- [ ] T033 Walk through `specs/003-forms-input-hardening/quickstart.md` "Manually verifying the hardening" against `pnpm dev` in both locales; confirm no native bubble appears on any of the 11 forms.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **blocks all user stories**.
- **User Stories (Phases 3–6)**: each depends only on Foundational. They are
  independent of each other and may proceed in parallel or in priority order
  (US1 → US2 → US3 → US4).
- **Polish (Phase 7)**: depends on all four stories being complete.

### User Story Dependencies

- **US1 (P1)** — after Foundational. No dependency on other stories.
- **US2 (P2)** — after Foundational. Independent of US1/US3.
- **US3 (P3)** — after Foundational. Independent of US1/US2.
- **US4 (P3)** — after Foundational. Independent; its gate, once added, also
  retro-confirms FR-001 across US1–US3 (run `forms:check` after they land).

### Within Each User Story

- Schema file(s) before the form migration that imports them.
- Form migration before (or with) its Server Action wiring.
- The E2E spec can be written in parallel ([P]) and is run to verify the story.

### Parallel Opportunities

- T002 and T004 (Foundational) are independent files — parallel.
- US1–US4 can each be taken by a different developer once Foundational lands.
- Within a story, the `lib/validation/*` schema files are all `[P]` (distinct
  files): T006+T007; T019+T020+T021+T022.
- Each story's E2E spec (T013, T018, T027) is `[P]` — a distinct new file.

---

## Parallel Example: User Story 3

```text
# The four US3 schema files are independent — create together:
Task: "Create lib/validation/members.ts"      (T019)
Task: "Create lib/validation/banking.ts"       (T020)
Task: "Create lib/validation/beer-types.ts"    (T021)
Task: "Create lib/validation/stock.ts"         (T022)

# Then the three form migrations (distinct component files) can also run in parallel,
# each followed by its slice of the T026 action-wiring.
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational.
2. Phase 3 US1 — auth & onboarding forms.
3. **STOP and VALIDATE**: `forms-auth.spec.ts` green; sign-in/PIN/invitation
   show in-app localized validation with no native bubble.
4. This is a shippable increment — the forms every member meets are hardened.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → verify → the highest-traffic forms are done (MVP).
3. US2 → verify → money forms done.
4. US3 → verify → admin forms done.
5. US4 → the guardrail locks the standard in; run `forms:check` to confirm
   US1–US3 left no native constraint behind.
6. Polish → full suite green.

### Notes

- [P] = different files, no dependency on an incomplete task.
- Commit after each task or logical group; reference the task ID (e.g. `T009`)
  and story (e.g. `US1`) in the message per the constitution.
- Server Action contracts MUST NOT change (FR-014) — actions swap their
  validation *source*, never their signature or return type.
- The `forms:check` gate only passes once **every** form group is migrated; do
  not wire it as merge-blocking in CI until US1–US3 have landed.
