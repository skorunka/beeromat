---
description: "Task list for Admin Configuration + Self-Bootstrap (v1.8)"
---

# Tasks: Admin Configuration + Self-Bootstrap (v1.8)

**Input**: Design documents from `specs/008-admin-config/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/admin-config.md, quickstart.md

**Tests**: One unit test (the bootstrap rule's race-safe state machine) and one E2E spec (the happy paths from quickstart Scenarios A–C). Both explicitly named in spec §Assumptions; not full TDD, but the bootstrap-rule unit test runs as part of the standard test:unit gate from T002 onward.

**Organization**: Two co-equal P1 user stories. US1 (self-bootstrap) is a server-side change in one file with one unit test. US2 (admin-config UI) is the larger surface — Zod schema + DB query + server action + form + page + nav + i18n. US1 ships first because the admin must exist to reach the admin UI (US2's manual exercise depends on US1).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1 / US2 maps the task to its spec user story

**Verifiable Tasks rule (constitution v1.7.0).** Every task is observable by a gate (`typecheck`, `lint`, `test:unit`, `i18n:check`, `forms:check`, `build`, `test:e2e`) or by an Acceptance Scenario in spec.md (the manual quickstart walk at T012).

## Path Conventions

Single Next.js App Router app at the repository root: `app/`,
`components/`, `lib/`, `messages/`, `tests/`.

---

## Phase 1: Setup

**Purpose**: None — v1.8 adds no dependency, no env var, no migration (data-model.md confirms every column already exists in v1's `clubs` + `club_banking_profiles` schema). Proceed to Phase 2.

---

## Phase 2: Foundational

**Purpose**: None — US1 and US2 are independent surfaces with no shared blocking infrastructure. Proceed to US1.

---

## Phase 3: User Story 1 — Self-bootstrap on fresh deployment (Priority: P1) 🎯 MVP

**Goal**: When the `users` table is empty, the first email that completes the magic-link round-trip is auto-promoted to `club_admin` on the seeded club. One-shot, race-safe, idempotent.

**Independent Test**: On a freshly migrated DB with zero users and one seeded club, drive the sign-in form for any email, complete the magic-link via Mailpit, and observe (a) a `users` row created for that email AND (b) a `members` row with `role = 'club_admin'` on the seeded club. A second sign-in with a different email does NOT promote (no new `club_admin` row).

**⚠️ Strictly precedes US2's manual exercise** — the admin must exist to reach `/admin/config`. US2's implementation tasks (T003–T009) can run in parallel with US1's tasks; only T012 (manual quickstart) depends on US1 being live.

- [ ] T001 [US1] In `lib/auth/better-auth.ts`, add a transactional bootstrap branch inside the magic-link plugin's verification-complete callback (`callbacks.after.signIn` or the equivalent post-verify hook — see contracts/admin-config.md §2). Inside a single Drizzle transaction: (a) read `SELECT count(*) FROM users FOR UPDATE` to serialise any race, (b) if `count === 1` (the user Better Auth just created is the very first), look up the single seeded club, insert one `members` row with `role = 'club_admin'`, `isActive = true`, `acceptedInvitationAt = new Date()`, `createdByUserId = null`, (c) if `count > 1` or the seeded club is missing, no-op (log a warning in the latter case). Behaviour MUST match data-model.md §2 state machine and contracts/admin-config.md §2 transactional procedure.
- [ ] T002 [P] [US1] New unit test `tests/unit/bootstrap-rule.spec.ts` covering the four cases from data-model.md §2: (a) state A → state B (empty users, first sign-in completes, member row with `club_admin` is created on the seeded club); (b) state B idempotency (second sign-in by the same user does NOT duplicate the member row); (c) state C (subsequent unknown email creates a user row but no member row); (d) race safety (two parallel bootstrap calls against an empty users table produce exactly one `club_admin` member row — use Promise.all with two transactional invocations and assert the count is exactly 1 after both settle). Uses PGlite + the existing `tests/helpers/db.ts` scaffolding; mock the magic-link verify side so the test exercises ONLY the bootstrap branch.

**Checkpoint**: After T001 + T002, US1 is shippable. The bootstrap fires once on a fresh DB; `pnpm test:unit` covers the four invariants.

---

## Phase 4: User Story 2 — Admin edits club config from the UI (Priority: P1)

**Goal**: A signed-in `club_admin` can change the club name, currency, default locale, and banking profile through `/admin/config` and see the change reflected on every member-facing screen on the next render.

**Independent Test**: Sign in as the admin (the seeded one or the bootstrapped one from US1). Navigate to `/admin/config`. Change the club name from "Test Club" to "TK Slávia Praha", save. (a) Reloading `/admin/config` shows the new name in the field. (b) Navigating to a member-facing screen that displays the club name shows the new name. (c) Changing currency to EUR triggers the confirmation modal (FR-008); confirming saves and a money-display screen renders new amounts in EUR.

- [ ] T003 [P] [US2] Create `lib/validation/admin-config.ts` with the Zod schema specified in data-model.md §3: `name` (trim/min1/max120), `currencyCode` (regex `^[A-Z]{3}$`), `defaultLocale` (`enum([...routing.locales])`), nested `banking` object with `iban` (optional, refined against the existing `validIban` from `lib/iban.ts`), `accountHolderName` (required-if-iban via cross-field `.refine`), `revolutHandle` (optional, 2–64 chars), `defaultQrMessage` (optional, 1–140 chars). Export `AdminConfigInput` type from the schema. The same schema is consumed by both the client form (T007) and the server action (T006).
- [ ] T004 [P] [US2] Create `lib/db/queries/club-config.ts` with two functions: `getClubConfig(clubId)` returning the joined `clubs` row + `club_banking_profiles` row (null banking row → return empty banking shape), and `updateClubConfigTx(input, clubId, userId)` that opens a single Drizzle transaction and runs `UPDATE clubs SET name, currencyCode, defaultLocale WHERE id = clubId` + `INSERT INTO club_banking_profiles (...) ON CONFLICT (clubId) DO UPDATE SET iban, accountHolderName, revolutHandle, defaultQrMessage, updatedAt = now(), updatedByUserId = userId`. Returns the updated `getClubConfig` shape so callers can revalidate caches.
- [ ] T005 [P] [US2] Add an `admin.config.*` namespace to both `messages/cs.json` and `messages/en.json`. Keys: `title`, `clubSectionHeading`, `bankingSectionHeading`, `nameLabel`, `currencyLabel`, `defaultLocaleLabel`, `ibanLabel`, `accountHolderLabel`, `revolutHandleLabel`, `defaultQrMessageLabel`, `submit`, `saved`, `currencyChangeWarningTitle`, `currencyChangeWarningBody` (interpolates `{oldCurrency}` and `{newCurrency}`), `currencyChangeConfirm`, `currencyChangeCancel`, `errorGeneric`, plus the admin-nav link label `nav.admin.config`. Czech and English copy is short, mate-to-mate, matches the rest of the catalogue. `pnpm i18n:check` MUST pass.
- [ ] T006 [US2] Create `app/[locale]/(app)/admin/config/actions.ts` exporting `updateClubConfig(input)`. Behaviour per contracts/admin-config.md §1: `await requireRole('club_admin')` (the existing helper from `lib/auth/session.ts`); the returned ctx carries `club.id` and `user.id`. Parse `input` through the T003 Zod schema. On parse failure return `{ ok: true, status: 'validation-failed' }`. On parse success call `updateClubConfigTx(parsed, ctx.club.id, ctx.user.id)` (T004). Then `revalidatePath('/admin/config')`, `revalidatePath('/admin')`, `revalidatePath('/')`. Return `{ ok: true, status: 'ok' }`. RBAC failure surfaces as `{ ok: true, status: 'forbidden' }` (defensive — the route is also guarded at page load).
- [ ] T007 [US2] Create `app/[locale]/(app)/admin/config/AdminConfigForm.tsx` as a client component. Props: `{ defaults: AdminConfigInput }` (server-loaded by T008). Uses `useForm<AdminConfigInput>` with `zodResolver(adminConfigSchema)` (T003). Two sections per i18n headings (T005): club block (name / currency / default locale), banking block (iban / account holder / revolut handle / default QR message). On submit: if `values.currencyCode !== defaults.currencyCode`, open the currency-change confirmation Dialog (the existing `Dialog` primitive from `components/ui/dialog.tsx`) with the interpolated warning body; only on confirm does the form actually call `updateClubConfig`. On `ok` status show a `toast.success(t('saved'))`. On `validation-failed` the per-field errors are already painted by the resolver. On `forbidden` show `toast.error(t('errorGeneric'))`.
- [ ] T008 [US2] Create `app/[locale]/(app)/admin/config/page.tsx` as a server component. `const ctx = await requireRole('club_admin')`. `const config = await getClubConfig(ctx.club.id)` (T004). Render `<main>` with `<h1>{t('title')}</h1>` followed by `<AdminConfigForm defaults={config} />`. Export `const metadata = { title: '🍺 beeromat — ' + t('title') }` so the browser tab shows the admin context.
- [ ] T009 [US2] Wire a "Config" link into the admin home/nav. Inspect `app/[locale]/(app)/admin/page.tsx` (the admin index) and any admin nav component; add a link to `/admin/config` with the i18n label `nav.admin.config` from T005. Place it before "Members" (members management is conceptually downstream of having the club configured first). Use the existing `Link` from `@/lib/i18n/navigation`.

**Checkpoint**: After T003–T009, US2 is shippable. An admin can reach `/admin/config`, see the current values pre-filled, edit, save, and see propagation on next render. The currency-change warning fires when currency changes.

---

## Phase 5: Polish & ship

- [ ] T010 [P] New E2E spec `tests/e2e/admin-config.spec.ts` covering quickstart Scenarios A + B + C. Test A (US1 bootstrap): truncate `users` + `members` to recreate state A; drive the sign-in form for `freshadmin@example.test`; complete magic-link via the existing `tests/e2e/fixtures/auth.ts` helper; assert a `members` row with `role = 'club_admin'` exists for that user. Test B (US2 admin edit): signed-in as the bootstrapped admin, navigate to `/admin/config`, fill new club name, save; assert `clubs.name` updated in DB AND that a subsequent page-load shows the new name. Test C (RBAC): seed a regular `member`, sign them in, attempt `GET /admin/config` — assert redirect (or 403-equivalent). The currency-change confirmation dialog (FR-008) is covered by Test B (a separate sub-case asserts the dialog appears when currency is changed).
- [ ] T011 Run the seven verification gates: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` (with the new `bootstrap-rule.spec.ts` from T002), `pnpm i18n:check`, `pnpm forms:check`, `pnpm build`, then `npx playwright test tests/e2e/auth.spec.ts tests/e2e/email-i18n.spec.ts tests/e2e/admin-config.spec.ts`. All must pass.
- [ ] T012 Manual quickstart walk per `specs/008-admin-config/quickstart.md`. Scenarios A (self-bootstrap), B (admin edits config + currency-change warning + banking save), C (validation + RBAC). Scenario D (race) is already covered by T002's unit-test case (d), so no manual reproduction is needed for it. Use the `/dev` slash command to start the dev server + arm the error monitor before walking the scenarios.
- [ ] T013 Mark `specs/008-admin-config/spec.md` Status: `Shipped`. Merge `008-admin-config` into `main` with a merge commit referencing the spec, the v1.7.0 dep-sweep that landed on this branch via merge, and the constitution amendment. Push both branches.

---

## Dependencies

```
Phase 3 (US1):  T001 ──► T002
                  │
                  ▼
Phase 5:        T010 (E2E covers both stories) ─► T011 (gates) ─► T012 (manual) ─► T013 (ship)
                  ▲
                  │
Phase 4 (US2):  T003 ─┐
                T004 ─┼─► T006 ─► T008 ─► T010
                T005 ─┤      ▲
                      │      │
                      └─► T007 (depends on T003 + T005)
                      │      ▲
                      │      │
                      └─► T009 (depends on T005)
```

**Parallel opportunities**:
- T002 runs in parallel with T003–T009 (US1 unit test is independent of US2 implementation).
- T003, T004, T005 all start in parallel at Phase 4 entry (different files, no internal deps).
- T010 begins as soon as T001 (bootstrap) + T008 (admin page) are done.

## Implementation strategy (MVP)

- **MVP = US1 only** would NOT be useful on its own — it only matters insofar as it unblocks an admin to use US2.
- **MVP = US1 + US2 (the spec's full scope)** is the natural shipping unit. They're co-P1 and complete each other.
- **Incremental delivery within US2** is possible if implementation time is tight: T003+T004+T005+T006+T008 ships a working `/admin/config` page WITHOUT the form interactivity; adding T007's confirmation modal and T009's nav link is a polish pass that can land in a follow-up commit on the same branch.

## Format validation

All 13 tasks follow `- [ ] T0NN [P?] [Story?] Description`:
- Setup + Foundational phases: no tasks (both empty).
- Phase 3 (US1): T001 (no P, [US1]), T002 ([P] [US1]).
- Phase 4 (US2): T003 ([P] [US2]), T004 ([P] [US2]), T005 ([P] [US2]), T006 ([US2]), T007 ([US2]), T008 ([US2]), T009 ([US2]).
- Phase 5 (Polish): T010 ([P]), T011 (no P), T012 (no P), T013 (no P). No story label on Polish per the format spec.

All tasks reference exact file paths. ✓
