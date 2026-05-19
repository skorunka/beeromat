---
description: "Implementation task list for the beeromat v1 MVP — Beer Consumption Ledger"
---

# Tasks: Beer Consumption Ledger (v1 MVP)

**Input**: Design documents from `specs/001-beer-consumption-ledger/`

**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `research.md`, `data-model.md`, `contracts/`

**Tests**: Test tasks ARE included for this feature. The plan establishes Vitest + RTL + PGlite for unit/integration and Playwright for E2E, and the constitution's Dev Workflow gate requires a test plan in every PR. Tests are NOT strict TDD-first — they are listed as part of each story's deliverable and may be written interleaved with implementation, but each story phase MUST land with its test tasks completed before moving on.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- All file paths are repository-relative.

## Path Conventions

Single Next.js application; project root contains `app/`, `lib/`, `components/`, `drizzle/`, `tests/`, `messages/`, `public/`. See `plan.md` § Project Structure for the canonical layout.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, tooling, and skeleton directory layout.

- [ ] T001 Initialize Next.js 16 app with TypeScript strict + App Router at repo root via `pnpm create next-app@latest . --typescript --eslint --tailwind --app --src-dir=false --import-alias='@/*'`
- [ ] T002 [P] Install runtime dependencies: `pnpm add drizzle-orm @neondatabase/serverless better-auth resend qrcode argon2 @upstash/ratelimit @upstash/redis next-intl @marsidev/react-turnstile react-email zod`
- [ ] T003 [P] Install dev dependencies: `pnpm add -D drizzle-kit vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @playwright/test @electric-sql/pglite tsx @types/qrcode prettier eslint-config-prettier`
- [ ] T004 [P] Initialize shadcn/ui with `new-york` style in `components/ui/`, install `button`, `dialog`, `form`, `input`, `label`, `card`, `sonner`, `toast`, `badge`, `separator`, `dropdown-menu`, `sheet` via `pnpm dlx shadcn@latest init` then `add`
- [ ] T005 Configure `tsconfig.json` for strict mode + `noUncheckedIndexedAccess: true` + path alias `@/*` → `./*`
- [ ] T006 [P] Configure `eslint.config.mjs` with Next.js + Prettier compat; add `import/order`, `unused-imports`, `no-restricted-imports` rules
- [ ] T007 [P] Configure `.prettierrc` with project conventions (semi: true, singleQuote: true, trailingComma: 'all', printWidth: 100)
- [ ] T008 Add `package.json` scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test:unit`, `test:e2e`, `test`, `db:generate`, `db:migrate`, `db:push`, `db:studio`, `db:seed`, `i18n:check`
- [ ] T009 Create directory skeleton: `app/[locale]/`, `app/api/`, `components/`, `lib/auth/`, `lib/db/schema/`, `lib/db/queries/`, `lib/balance/`, `lib/qr-platba/`, `lib/permissions/`, `lib/rate-limit/`, `lib/i18n/`, `drizzle/`, `messages/`, `tests/unit/`, `tests/integration/`, `tests/e2e/`, `public/icons/`
- [ ] T010 Write `.env.example` containing ONLY deployment-scoped vars (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, RESEND_API_KEY, EMAIL_FROM, NEXT_PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, SEED_ADMIN_EMAIL, SEED_ADMIN_NAME, SEED_CLUB_NAME, SEED_CLUB_CURRENCY, SEED_CLUB_LOCALE) per Constitution v1.1.1
- [ ] T011 Implement `lib/env.ts` with Zod schema parsing `process.env` at module load; export typed `env` object; throw early on missing required vars
- [ ] T012 [P] Configure `next.config.ts` with `experimental.typedRoutes: true`, `images.remotePatterns` for Vercel/Neon if needed, and the next-intl plugin wrapper
- [ ] T013 [P] Add `.gitignore` entries for `.env.local`, `node_modules`, `.next`, `playwright-report`, `test-results`, `coverage`

**Checkpoint**: `pnpm dev` boots a blank Next.js page; `pnpm typecheck` passes; `pnpm lint` passes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting infrastructure every user story depends on. No user-story implementation may begin until this phase is complete.

**⚠️ CRITICAL**: All US-phase work is gated on this phase.

### Database foundation

- [ ] T014 Create `drizzle.config.ts` pointing at `lib/db/schema/index.ts` with Neon connection string from `env.DATABASE_URL` and `dialect: 'postgresql'`
- [ ] T015 Implement `lib/db/client.ts` exporting a Drizzle instance backed by `@neondatabase/serverless` HTTP driver (no WebSockets in serverless functions)
- [ ] T016 Implement `lib/db/schema/auth.ts` re-exporting Better Auth's Drizzle adapter table definitions (users, sessions, accounts, verifications)
- [ ] T017 [P] Implement `lib/db/schema/clubs.ts`: `clubs` table + `club_banking_profiles` table per `data-model.md` §1, §2; include `member_role`, `invitation_status`, `payment_status`, `payment_origin`, `stock_change_kind` enums
- [ ] T018 [P] Implement `lib/db/schema/members.ts`: `members`, `invitations`, `device_sessions` tables per data-model §3, §4, §5; include all indexes and the partial unique constraints
- [ ] T019 Implement `lib/db/schema/index.ts` re-exporting all schema files for the Drizzle client
- [ ] T020 Generate initial migration with `pnpm db:generate`; verify generated SQL in `drizzle/0001_init_auth.sql` and `drizzle/0002_clubs.sql` and `drizzle/0003_members.sql` matches data-model.md

### Authentication foundation

- [ ] T021 Implement `lib/auth/better-auth.ts` server config: instantiate Better Auth with Drizzle adapter, magic-link plugin (`expiresIn: 300`, `disableSignUp: true`), Resend `sendMagicLink` callback, session config (httpOnly secure cookies)
- [ ] T022 [P] Implement `lib/auth/client.ts` exporting a Better Auth client with `magicLinkClient()` plugin for use in Client Components
- [ ] T023 [P] Implement `lib/auth/pin.ts` device-PIN service with `setPin`, `verifyPin`, `clearPin` functions using `argon2.hash` / `argon2.verify` with argon2id variant; export PHC-string-based storage helpers
- [ ] T024 [P] Implement `lib/auth/session.ts` exporting `currentSession()`, `requireMember()`, `requireRole(...)`, `requireUnlocked()` helpers per `contracts/auth.md`
- [ ] T025 Mount Better Auth at `app/api/auth/[...all]/route.ts` per Better Auth's Next.js docs

### Email + Resend templates

- [ ] T026 [P] Implement `lib/email/resend.ts` wrapping the Resend SDK with typed `sendEmail` helper using `env.RESEND_API_KEY`
- [ ] T027 [P] Create `emails/MagicLinkEmail.tsx` react-email template (subject, header, big button, plain-text fallback)
- [ ] T028 [P] Create `emails/InvitationEmail.tsx` react-email template (welcomes the invitee, explains beeromat, includes magic-link button + plain-text URL)

### Rate limiting + bot mitigation

- [ ] T029 [P] Implement `lib/rate-limit/index.ts` with two `@upstash/ratelimit` sliding-window limiters: `magicLinkPerEmail` (3/hour) and `magicLinkPerIp` (10/hour)
- [ ] T030 [P] Implement `lib/turnstile/verify.ts` with `verifyTurnstileToken(token, remoteIp)` POSTing to `https://challenges.cloudflare.com/turnstile/v0/siteverify`, returning `boolean`
- [ ] T031 [P] Create `components/turnstile-widget.tsx` wrapping `@marsidev/react-turnstile` with our site key from `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `onSuccess`/`onError` callbacks

### Permissions module

- [ ] T032 [P] Implement `lib/permissions/index.ts` exporting `Role` type, `roleSatisfies(actual, required)` (hierarchy: club_admin ⊇ treasurer ⊇ stock_manager ⊇ member), and assert helpers

### i18n foundation

- [ ] T033 [P] Implement `lib/i18n/routing.ts` (next-intl routing config with `locales: ['cs', 'en']`, `defaultLocale: 'cs'`, `localePrefix: 'as-needed'`)
- [ ] T034 [P] Implement `lib/i18n/request.ts` (`getRequestConfig` reading the `[locale]` segment and loading `messages/{locale}.json`)
- [ ] T035 [P] Implement `proxy.ts` (Next.js 16 middleware convention) using next-intl middleware for locale detection
- [ ] T036 [P] Create initial `messages/cs.json` and `messages/en.json` catalogs with placeholder keys for `app.title`, `auth.signIn.*`, `pin.setup.*`, `pin.unlock.*`, `errors.*`

### PWA + base layout

- [ ] T037 [P] Implement `app/manifest.ts` per Next.js 16 `MetadataRoute.Manifest` with `name: 'beeromat'`, `short_name: 'beeromat'`, `display: 'standalone'`, `theme_color`, `background_color`, `start_url: '/'`, and 192/512/maskable icons referencing files added in T038
- [ ] T038 [P] Add PWA icons under `public/icons/` (192×192, 512×512, maskable 512×512); use a placeholder beer-mug icon for v1 (replace before launch)
- [ ] T039 Implement `app/[locale]/layout.tsx` root layout with: html lang, NextIntlClientProvider, Tailwind base styles, `sonner` toaster mount, theme color meta
- [ ] T040 Implement `app/[locale]/(app)/layout.tsx` (authenticated layout) calling `requireMember()` server-side and rendering the PIN-gate component for `requireUnlocked()` check

### Seed script

- [ ] T041 Implement `scripts/seed.ts` (run via `pnpm db:seed` / `tsx`) that inserts the single v1 `clubs` row from `SEED_CLUB_*` env vars + an empty `club_banking_profiles` row + a placeholder `members` row with role `club_admin` for `SEED_ADMIN_EMAIL` (the Better Auth `users` row is created lazily on first magic-link sign-in)

**Checkpoint**: `pnpm db:migrate && pnpm db:seed` succeeds against a fresh Neon branch; `pnpm dev` boots; visiting `/` redirects to `/cs/sign-in` (auth required); magic-link send works against `delivered@resend.dev` and clicking the link logs in the seed admin; PIN setup flow is reachable.

---

## Phase 3: User Story 1 - Log a beer and see my running tab (Priority: P1) 🎯 MVP

**Goal**: A signed-in member opens the app, unlocks with their PIN, picks a beer from a list, taps Log, and sees their session tab update.

**Independent Test**: With the seeded admin signed in and one `beer_types` row configured, the admin can log three beers across a few minutes and see their tab reflect three entries with correct line totals and a running session total. No other user story is required.

### Tests for User Story 1

- [ ] T042 [P] [US1] Unit test for `lib/balance/calculate.ts` covering: empty session, single consumption, multiple consumptions, voided consumption, transfer-in, transfer-out, voided transfer (`tests/unit/balance.spec.ts`)
- [ ] T043 [P] [US1] Integration test for `logBeer` server action against PGlite: happy path, OUT_OF_STOCK, BEER_NOT_AVAILABLE, auto-open session, stock_changes row written (`tests/integration/log-beer.spec.ts`)
- [ ] T044 [P] [US1] Integration test for `voidConsumption`: within-window self-undo, after-window-by-stock-manager, ALREADY_VOIDED, FORBIDDEN, stock incremented back (`tests/integration/void-consumption.spec.ts`)
- [ ] T045 [P] [US1] Playwright E2E covering Story 1 acceptance scenarios 1-4 (sign-in → unlock → log 3 beers → view tab → undo last) (`tests/e2e/us1-log-beer.spec.ts`)

### Schema for User Story 1

- [ ] T046 [P] [US1] Implement `lib/db/schema/catalog.ts` with `beer_types` and `stock_changes` tables per data-model §6, §12, including the `stock_change_kind` enum values and the `current_stock` CHECK constraint
- [ ] T047 [P] [US1] Implement `lib/db/schema/sessions.ts` with `drink_sessions` table per data-model §7, including the partial unique index for at-most-one-open-session-per-club
- [ ] T048 [P] [US1] Implement `lib/db/schema/consumption.ts` with `consumptions` and `consumption_voids` tables per data-model §8, §9
- [ ] T049 [US1] Generate migrations `drizzle/0004_catalog.sql`, `drizzle/0005_sessions.sql`, `drizzle/0006_consumption.sql` via `pnpm db:generate` (depends on T046–T048)

### Balance + queries

- [ ] T050 [P] [US1] Implement `lib/balance/calculate.ts` exporting `effectiveConsumptionTotal(memberId, sessionId?)` and `memberBalance(memberId)` as pure SQL queries against `consumptions`, `consumption_voids`, `bet_transfers`, `bet_transfer_voids`, `payments` (bet/payment joins return zero until those tables exist)
- [ ] T051 [P] [US1] Implement `lib/db/queries/sessions.ts` with `getOpenSessionForClub(clubId)` and `getOrCreateOpenSession(clubId, userId)`
- [ ] T052 [P] [US1] Implement `lib/db/queries/consumption.ts` with `getMyTabForCurrentSession(memberId)` returning the shape from `contracts/consumption.md` (`MemberTab`)
- [ ] T053 [P] [US1] Implement `lib/db/queries/catalog.ts` with `getBeerTypeCatalog(clubId, includeArchived)` returning the shape from `contracts/stock.md`

### Server actions

- [ ] T054 [US1] Implement `logBeer` server action in `app/[locale]/(app)/log/actions.ts` per `contracts/consumption.md`; single-transaction stock decrement + session auto-open + consumption insert + stock_changes audit row (depends on T046, T047, T048, T051)
- [ ] T055 [US1] Implement `voidConsumption` server action in `app/[locale]/(app)/log/actions.ts` per `contracts/consumption.md`; permission check, append `consumption_voids`, increment stock + audit row (depends on T054)

### UI

- [ ] T056 [US1] Implement PIN-gate component in `components/pin/pin-gate.tsx` (numpad UI, 4-digit input, calls `unlockDevice` server action from contracts/auth.md; renders gate above `(app)` layout until unlocked)
- [ ] T057 [P] [US1] Implement `unlockDevice` server action in `app/[locale]/(auth)/actions.ts` per contracts/auth.md (resolves device_id cookie, verifies argon2, lockout logic)
- [ ] T058 [P] [US1] Implement the log screen at `app/[locale]/(app)/log/page.tsx` (Server Component fetching `getOpenSessionForClub` + `getBeerTypeCatalog`)
- [ ] T059 [P] [US1] Implement `components/log/beer-grid.tsx` (Client Component rendering each beer type as a large tap target ≥ 44×44 px, calls `logBeer` action, optimistic UI, sonner toast on success/error)
- [ ] T060 [P] [US1] Implement my-tab view at `app/[locale]/(app)/tab/page.tsx` (Server Component fetching `getMyTabForCurrentSession`, renders list + total)
- [ ] T061 [P] [US1] Implement `components/log/undo-button.tsx` for the in-window undo on the most recent consumption
- [ ] T062 [US1] Add cs + en translation keys for log/tab screens to `messages/cs.json` and `messages/en.json`

**Checkpoint**: Seeded admin can sign in, set PIN, configure a beer type via direct DB insert (or use US7 path once available), log 3 beers, see the tab with running total, and undo the last one within the 5-minute window. SC-001 (< 5s open → log) verifiable.

---

## Phase 4: User Story 5 - Invite and onboard a new member (Priority: P1)

**Goal**: An admin invites by email; the invitee receives a magic link, sets a display name + PIN, lands on the home screen.

**Independent Test**: Admin can invite a fresh email; the recipient completes magic-link + display-name + PIN setup; the new member then logs a beer (validates against US1). End-to-end without manual DB intervention.

### Tests for User Story 5

- [ ] T063 [P] [US5] Integration test for `inviteMember` action: happy path, ALREADY_MEMBER, ALREADY_INVITED, email side-effect verified (`tests/integration/invite-member.spec.ts`)
- [ ] T064 [P] [US5] Integration test for `acceptInvitation` action: valid token, expired token, already-accepted token, invalid token; verify member row + device_session created + Better Auth session set (`tests/integration/accept-invitation.spec.ts`)
- [ ] T065 [P] [US5] Playwright E2E covering US5 acceptance scenarios 1-4 (admin invites → invitee opens email link → fills form → lands on home → can log a beer) (`tests/e2e/us5-invite-onboard.spec.ts`)

### Server actions

- [ ] T066 [US5] Implement `inviteMember` action in `app/[locale]/(app)/admin/members/actions.ts` per `contracts/admin.md` (role check, duplicate guards, generate token, hash, dispatch Resend email with `InvitationEmail` template)
- [ ] T067 [US5] Implement `acceptInvitation` action in `app/[locale]/(auth)/actions.ts` per `contracts/auth.md` (one transaction: create user + member, mark invitation accepted, create device_session with PIN, set cookies)
- [ ] T068 [P] [US5] Implement `resendInvitation` action (rotates token, dispatches email)
- [ ] T069 [P] [US5] Implement `revokeInvitation` action (status → 'revoked')

### UI

- [ ] T070 [P] [US5] Implement invitation landing page at `app/[locale]/(auth)/invitation/[token]/page.tsx` (Server Component validates token + renders the welcome form)
- [ ] T071 [P] [US5] Implement `components/auth/invitation-form.tsx` (Client Component: display name + PIN + confirm-PIN + submit calling `acceptInvitation`)
- [ ] T072 [US5] Implement admin members page at `app/[locale]/(app)/admin/members/page.tsx` (server-render member list + pending invitations via `getClubMembers` + `getPendingInvitations` queries)
- [ ] T073 [P] [US5] Implement `components/admin/invite-form.tsx` (Client Component: email input, role dropdown, submit calling `inviteMember`)
- [ ] T074 [US5] Add cs + en translation keys for invitation flow + admin members

**Checkpoint**: Admin can invite `friend@example.com`; friend receives a real email via Resend; friend completes onboarding and immediately can log a beer (US1). SC-002 (< 3 min onboarding) verifiable.

---

## Phase 5: User Story 2 - Settle my tab via QR Platba (Priority: P1)

**Goal**: A member with an outstanding balance taps "Pay my tab," sees a QR Platba code, scans with their bank app, returns and marks "I paid" — balance shows "pending confirmation."

**Independent Test**: A member with a known balance can complete the full settle flow producing a valid SPAYD string (verified against qr-platba.cz validator) and a `payments` row with status `claimed`.

### Tests for User Story 2

- [ ] T075 [P] [US2] Unit test for `lib/qr-platba/spayd.ts`: valid output for canonical inputs, escaping rules, currency formatting (`tests/unit/spayd.spec.ts`)
- [ ] T076 [P] [US2] Unit test for `lib/qr-platba/render.ts`: SVG output is well-formed, includes the SPAYD payload, error-correction level M (`tests/unit/qr-render.spec.ts`)
- [ ] T077 [P] [US2] Integration test for `initiateSettle` action: NO_BALANCE / BANKING_NOT_CONFIGURED / CLAIM_PENDING branches; variable_symbol allocation is monotonic (`tests/integration/initiate-settle.spec.ts`)
- [ ] T078 [P] [US2] Integration test for `confirmTransferMade`: happy path creates `claimed` payment + state transition; BALANCE_CHANGED, INVALID_VS, CLAIM_PENDING rejected (`tests/integration/confirm-transfer-made.spec.ts`)
- [ ] T079 [P] [US2] Playwright E2E covering US2 acceptance scenarios 1-5 (configure banking → settle → scan QR (decode in test) → mark paid → balance shows pending) (`tests/e2e/us2-settle.spec.ts`)

### Schema for User Story 2

- [ ] T080 [P] [US2] Implement `lib/db/schema/payments.ts` with `payments` and `payment_state_transitions` tables per data-model §13, §14, including enums and the partial unique index on (`club_id`, `variable_symbol`)
- [ ] T081 [US2] Generate migration `drizzle/0008_payments.sql` via `pnpm db:generate`

### QR Platba module

- [ ] T082 [P] [US2] Implement `lib/qr-platba/spayd.ts` exporting `buildSpaydString({ iban, amountMinor, currencyCode, variableSymbol, message })` per research.md §7
- [ ] T083 [P] [US2] Implement `lib/qr-platba/render.ts` exporting `renderQrSvg(spaydString): string` using `qrcode` package with error-correction `M`
- [ ] T084 [P] [US2] Implement `lib/qr-platba/revolut.ts` exporting `buildRevolutUrl(handle, amountMinor, currencyCode): string | null`

### Server actions + queries

- [ ] T085 [US2] Implement `initiateSettle` action in `app/[locale]/(app)/settle/actions.ts` per `contracts/payments.md` (depends on T080, T082, T083, T084)
- [ ] T086 [US2] Implement `confirmTransferMade` action in `app/[locale]/(app)/settle/actions.ts` per `contracts/payments.md`
- [ ] T087 [P] [US2] Implement `markPaidOtherMethod` action in `app/[locale]/(app)/settle/actions.ts` per `contracts/payments.md`
- [ ] T088 [P] [US2] Implement `lib/db/queries/payments.ts` with `getMyBalance(memberId)` returning `{ balanceMinor, pendingConfirmationMinor, currencyCode }`
- [ ] T089 [US2] Extend `lib/balance/calculate.ts` to include payments in the final balance derivation (depends on T080)
- [ ] T090 [US2] Implement `updateBankingProfile` action in `app/[locale]/(app)/admin/settings/actions.ts` per `contracts/admin.md` (UPSERT into `club_banking_profiles`, with IBAN mod-97 validation)

### UI

- [ ] T091 [P] [US2] Implement settle page at `app/[locale]/(app)/settle/page.tsx` (Server Component: balance fetch + initiateSettle call + render QR or "no balance" state)
- [ ] T092 [P] [US2] Implement `components/settle/qr-display.tsx` (renders the SVG QR + payment details + "I paid" button)
- [ ] T093 [P] [US2] Implement `components/settle/revolut-button.tsx` (conditional render if revolut handle configured)
- [ ] T094 [P] [US2] Implement `components/settle/paid-other-method.tsx` (form for cash / direct Revolut path)
- [ ] T095 [P] [US2] Implement admin banking-settings page at `app/[locale]/(app)/admin/settings/banking/page.tsx` and `components/admin/banking-form.tsx` (IBAN, account holder, revolut handle, QR message)
- [ ] T096 [US2] Add cs + en translation keys for settle + banking-settings flows

**Checkpoint**: Member with non-zero balance can produce a QR that decodes to a valid SPAYD payload (verified at https://qr-platba.cz/pro-vyvojare/validator/); marking "I paid" creates a `claimed` payment; admin banking page lets admin configure IBAN. SC-003 (< 60s settle excluding bank-app time) verifiable.

---

## Phase 6: User Story 3 - Treasurer confirms received payments (Priority: P1)

**Goal**: Treasurer sees a list of `claimed` payments, taps once to confirm each (or selects multiple and confirm-all), or disputes with a reason.

**Independent Test**: With one `claimed` payment in the DB, treasurer can sign in, see it in the pending list, tap once to confirm, and observe the member's balance finalise from "pending confirmation" to "settled."

### Tests for User Story 3

- [ ] T097 [P] [US3] Integration test for `confirmPayment`: single-row state transition, INVALID_STATE rejection, balance updates (`tests/integration/confirm-payment.spec.ts`)
- [ ] T098 [P] [US3] Integration test for `bulkConfirmPayments`: 5-row bulk, mixed success/skip handling (`tests/integration/bulk-confirm.spec.ts`)
- [ ] T099 [P] [US3] Integration test for `disputePayment`: state transition + balance restoration (`tests/integration/dispute-payment.spec.ts`)
- [ ] T100 [P] [US3] Playwright E2E covering US3 acceptance scenarios 1-4 + SC-007a single-tap requirement (`tests/e2e/us3-treasurer-confirm.spec.ts`)

### Server actions + queries

- [ ] T101 [US3] Implement `confirmPayment` action in `app/[locale]/(app)/admin/pending/actions.ts` per `contracts/payments.md` (single-tap, no form, single transaction)
- [ ] T102 [US3] Implement `bulkConfirmPayments` action in `app/[locale]/(app)/admin/pending/actions.ts` (batch of up to 100 ids, per-row failure handling)
- [ ] T103 [P] [US3] Implement `disputePayment` action in `app/[locale]/(app)/admin/pending/actions.ts`
- [ ] T104 [P] [US3] Implement `voidConfirmedPayment` action in `app/[locale]/(app)/admin/pending/actions.ts`
- [ ] T105 [P] [US3] Implement `lib/db/queries/payments.ts` `getPendingClaimsForTreasurer({ from, to, memberId, minAmount, maxAmount })` with date/member/amount filters
- [ ] T106 [P] [US3] Implement `lib/db/queries/payments.ts` `getAllMemberBalances(clubId)` for the treasurer all-members view

### UI

- [ ] T107 [US3] Implement treasurer pending page at `app/[locale]/(app)/admin/pending/page.tsx` (Server Component: list of `claimed` payments with filters)
- [ ] T108 [P] [US3] Implement `components/treasurer/pending-list.tsx` (Client Component: checkboxes for multi-select, "Confirm received" button per row, "Confirm all selected" button, dispute modal)
- [ ] T109 [P] [US3] Implement treasurer balances overview at `app/[locale]/(app)/admin/balances/page.tsx`
- [ ] T110 [P] [US3] Implement member notification badge: on every protected page load, query for `disputed` payments belonging to the member and surface a one-time banner ("Your payment claim was disputed: <reason>")
- [ ] T111 [US3] Add cs + en translation keys for treasurer pending + balances

**Checkpoint**: Treasurer confirms a single `claimed` payment in exactly one tap (verified by counting clicks in E2E test); bulk-confirming 5 payments uses 5+1 taps. SC-007 (< 5 min reconcile) and SC-007a (exactly 1 tap) verifiable.

---

## Phase 7: User Story 4 - Treasurer records a manual payment (Priority: P2)

**Goal**: Treasurer records cash or out-of-band payments directly against a member's balance.

**Independent Test**: Treasurer picks any member, records a `120.00 CZK` payment with note "cash 2026-05-20", and the member's balance decreases by 120.00.

### Tests for User Story 4

- [ ] T112 [P] [US4] Integration test for `recordManualPayment`: confirmed-directly, treasurer_initiated origin, audit transition row (`tests/integration/record-manual-payment.spec.ts`)
- [ ] T113 [P] [US4] Playwright E2E for US4 acceptance scenarios 1-2 (`tests/e2e/us4-treasurer-manual.spec.ts`)

### Server action + UI

- [ ] T114 [US4] Implement `recordManualPayment` action in `app/[locale]/(app)/admin/balances/actions.ts` per `contracts/payments.md`
- [ ] T115 [P] [US4] Implement `components/treasurer/manual-payment-form.tsx` (member picker, amount input in currency, note field, submit)
- [ ] T116 [US4] Wire the manual-payment form into the per-member detail page in `app/[locale]/(app)/admin/balances/[memberId]/page.tsx`
- [ ] T117 [US4] Add cs + en translation keys

**Checkpoint**: Treasurer records a cash payment against a member; balance decreases; audit history shows treasurer-initiated origin.

---

## Phase 8: User Story 6 - Bet transfer between members (Priority: P2)

**Goal**: Loser of a bet transfers a winner's consumption (in the current open session) onto themselves.

**Independent Test**: With two members each having a consumption in the open session, one initiates a transfer of the other's consumption; both balances update; original consumptions unchanged; transfer event visible in both members' history.

### Tests for User Story 6

- [ ] T118 [P] [US6] Integration test for `createBetTransfer`: happy path, OUT_OF_SCOPE (past session), ALREADY_TRANSFERRED, SELF_TRANSFER, NOT_FOUND (`tests/integration/create-bet-transfer.spec.ts`)
- [ ] T119 [P] [US6] Integration test for `voidBetTransfer`: original-logger path, treasurer path, ALREADY_VOIDED, balance restored (`tests/integration/void-bet-transfer.spec.ts`)
- [ ] T120 [P] [US6] Integration test for `getTransferableConsumptionsForCurrentSession`: filter logic correct (excludes self, excludes already-transferred, excludes past sessions) (`tests/integration/transferable-list.spec.ts`)
- [ ] T121 [P] [US6] Playwright E2E covering US6 acceptance scenarios 1-5 (`tests/e2e/us6-bet-transfer.spec.ts`)

### Schema for User Story 6

- [ ] T122 [P] [US6] Implement `lib/db/schema/bets.ts` with `bet_transfers` and `bet_transfer_voids` tables per data-model §10, §11, including the CHECK constraint and partial unique index
- [ ] T123 [US6] Generate migration `drizzle/0007_bets.sql` via `pnpm db:generate`

### Server actions + queries

- [ ] T124 [US6] Implement `createBetTransfer` action in `app/[locale]/(app)/bet/actions.ts` per `contracts/bets.md`
- [ ] T125 [P] [US6] Implement `voidBetTransfer` action in `app/[locale]/(app)/bet/actions.ts` per `contracts/bets.md`
- [ ] T126 [P] [US6] Implement `lib/db/queries/bets.ts` `getTransferableConsumptionsForCurrentSession(memberId)` per `contracts/bets.md`
- [ ] T127 [US6] Update `lib/balance/calculate.ts` to apply bet_transfers + bet_transfer_voids to the effective consumption total (this finalises FR-024)

### UI

- [ ] T128 [P] [US6] Implement bet-transfer page at `app/[locale]/(app)/bet/page.tsx` (Server Component: list of transferable consumptions grouped by member)
- [ ] T129 [P] [US6] Implement `components/bet/transfer-list.tsx` (Client Component: pick one or more consumptions, tap "Transfer to me", calls `createBetTransfer`, optimistic UI)
- [ ] T130 [P] [US6] Update my-tab and history views to surface transfer entries with direction indicators (in/out)
- [ ] T131 [US6] Add cs + en translation keys

**Checkpoint**: Two members can create a bet transfer; balances update; history shows it. SC-005 (95% logged within 60s) supported by the now-complete logging UX.

---

## Phase 9: User Story 7 - Stock management & low-stock alerts (Priority: P2)

**Goal**: Stock manager records restocks/adjustments via admin UI; low-stock indicator appears on the log screen when stock crosses threshold.

**Independent Test**: Stock manager sets a beer type to threshold 5 with stock 6; members log 2 beers; low-stock indicator now visible on log screen for all members; stock manager records a restock of 10; indicator clears.

### Tests for User Story 7

- [ ] T132 [P] [US7] Integration test for `recordRestock`: stock increases, stock_changes row written (`tests/integration/restock.spec.ts`)
- [ ] T133 [P] [US7] Integration test for `recordStockAdjustment`: positive + negative adjustments, WOULD_GO_NEGATIVE rejection (`tests/integration/stock-adjustment.spec.ts`)
- [ ] T134 [P] [US7] Integration test for beer_type CRUD: create / update price / archive / unarchive; verify price snapshot semantics (`tests/integration/beer-type-crud.spec.ts`)
- [ ] T135 [P] [US7] Integration test for `getStockHistory` filters and aggregation (`tests/integration/stock-history.spec.ts`)
- [ ] T136 [P] [US7] Playwright E2E covering US7 acceptance scenarios 1-4 (`tests/e2e/us7-stock.spec.ts`)

### Server actions + queries

- [ ] T137 [P] [US7] Implement `createBeerType` action in `app/[locale]/(app)/admin/beer-types/actions.ts` per `contracts/stock.md`
- [ ] T138 [P] [US7] Implement `updateBeerType` action in `app/[locale]/(app)/admin/beer-types/actions.ts`
- [ ] T139 [P] [US7] Implement `archiveBeerType` and `unarchiveBeerType` actions
- [ ] T140 [P] [US7] Implement `recordRestock` action per `contracts/stock.md`
- [ ] T141 [P] [US7] Implement `recordStockAdjustment` action per `contracts/stock.md`
- [ ] T142 [P] [US7] Implement `lib/db/queries/stock.ts` `getStockHistory({ beerTypeId, limit, cursor })`

### UI

- [ ] T143 [P] [US7] Implement beer-types admin page at `app/[locale]/(app)/admin/beer-types/page.tsx` (list + add button + per-row edit/archive)
- [ ] T144 [P] [US7] Implement `components/admin/beer-type-form.tsx` (create + edit form: name, price, threshold, initial stock, display order)
- [ ] T145 [P] [US7] Implement restock + adjustment modals in `components/admin/restock-dialog.tsx` and `components/admin/adjustment-dialog.tsx`
- [ ] T146 [P] [US7] Implement stock history view at `app/[locale]/(app)/admin/beer-types/[id]/history/page.tsx`
- [ ] T147 [P] [US7] Update the log screen's beer-grid to render the low-stock badge when `current_stock <= low_stock_threshold` and disable tap when `current_stock === 0` with a clear out-of-stock message
- [ ] T148 [US7] Add cs + en translation keys for stock management

**Checkpoint**: Stock manager can fully manage the catalog; out-of-stock blocking works; low-stock indicator visible across all members' log screens within 5s (SC-006).

---

## Phase 10: User Story 8 - Cross-session history (Priority: P3)

**Goal**: A member browses past drink sessions and drills into details, including transfer entries with direction labels.

**Independent Test**: Member with consumptions in 2+ past sessions can view a history list and drill into either session to see line items with transfers correctly attributed.

### Tests for User Story 8

- [ ] T149 [P] [US8] Integration test for `getSessionHistory` pagination + paid-status calculation (`tests/integration/session-history.spec.ts`)
- [ ] T150 [P] [US8] Integration test for `getSessionDetail` (`tests/integration/session-detail.spec.ts`)
- [ ] T151 [P] [US8] Playwright E2E for US8 acceptance scenarios 1-3 (`tests/e2e/us8-history.spec.ts`)

### Queries + UI

- [ ] T152 [P] [US8] Implement `getSessionHistory({ memberId, limit, cursor })` in `lib/db/queries/consumption.ts` per `contracts/consumption.md`
- [ ] T153 [P] [US8] Implement `getSessionDetail({ sessionId, memberId })` in `lib/db/queries/consumption.ts`
- [ ] T154 [P] [US8] Implement history list page at `app/[locale]/(app)/history/page.tsx`
- [ ] T155 [P] [US8] Implement session-detail page at `app/[locale]/(app)/history/[sessionId]/page.tsx`
- [ ] T156 [US8] Add cs + en translation keys for history

**Checkpoint**: Member can review their full history with auditable transfer attribution.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening, observability, deployment, and verification against the spec's Success Criteria.

### Performance + observability

- [ ] T157 [P] Add `EXPLAIN ANALYZE` checks for the top 5 query paths (`getMyTabForCurrentSession`, `getMyBalance`, `getBeerTypeCatalog`, `getPendingClaimsForTreasurer`, `getAllMemberBalances`); ensure all execute in <50ms at 50k-consumption scale via PGlite seeded benchmark
- [ ] T158 [P] Add structured logging (`lib/log.ts`) on every server action: actor, action, outcome, duration — for Vercel log drains; no PII beyond user_id
- [ ] T159 [P] Add `Sentry` or equivalent error reporting if free-tier-fitting; otherwise stick with Vercel logs

### Security hardening

- [ ] T160 [P] Audit every server action for `requireMember()` / `requireRole()` enforcement at the top; add `tests/unit/permissions.spec.ts` covering positive/negative role checks
- [ ] T161 [P] Verify all forms that take user input are wrapped in `<form>` with Server Action submission (CSRF protection via Next.js); add E2E test verifying CSRF token rejection on cross-origin POST
- [ ] T162 [P] Verify `lib/env.ts` rejects production deploys missing any required env var; add a CI step `pnpm typecheck && pnpm build` that exercises this
- [ ] T163 [P] Add CSP headers (Next.js `headers()` config) restricting script/img/connect-src to expected origins (Vercel, Turnstile, Resend dashboard if any client embedding)

### i18n + a11y

- [ ] T164 [P] Run `pnpm i18n:check` (custom script comparing cs.json + en.json key sets); fix any missing keys
- [ ] T165 [P] Add automated a11y checks via `@axe-core/playwright` on key pages (log, settle, treasurer pending, admin settings); fix any violations
- [ ] T166 [P] Verify all interactive controls are operable with one thumb (44×44 px touch targets); add a Playwright viewport test at 360×640 (cheap Android phone size)

### Deployment

- [ ] T167 Deploy preview to Vercel with a Neon dev branch; verify magic-link, settle (with a test IBAN), and treasurer flows end-to-end against the real Neon + Resend + Turnstile + Upstash services
- [ ] T168 Run `quickstart.md` end-to-end on a fresh machine (or fresh Neon branch) — validates the developer-onboarding path
- [ ] T169 Run the full Playwright suite against the preview deploy
- [ ] T170 Run a manual session of "log 5 beers, settle, treasurer confirm" with a real Czech bank app scanning the QR — closes the loop on SC-003

### Documentation

- [ ] T171 [P] Write `README.md` at repo root: project overview, link to spec/plan/quickstart, deploy badge, screenshots
- [ ] T172 [P] Add `docs/operations.md` for the seed admin: how to invite the first wave of members, how to back up Neon, how to rotate secrets
- [ ] T173 [P] Add `docs/troubleshooting.md`: PIN locked, magic link expired, Turnstile failures, Resend domain verification

### Spec compliance check

- [ ] T174 Run the spec's Success Criteria checklist (SC-001 through SC-011); attach evidence in a `docs/sc-evidence.md` (screenshots, timing measurements, audit-history reviews)
- [ ] T175 Re-run Constitution Check from `plan.md` against the actually-built system; document any drift in `docs/constitution-compliance.md`; file follow-up issues for any drift

**Checkpoint**: v1 is production-quality. SC-001 through SC-011 verified with evidence. Constitution principles all upheld.

---

## Dependencies & Execution Order

### Phase dependencies

| Phase | Depends on | Notes |
|---|---|---|
| 1 Setup | (none) | Can start immediately |
| 2 Foundational | 1 | **Blocks all user-story phases** |
| 3 US1 (P1) | 2 | MVP slice; deliverable on its own |
| 4 US5 (P1) | 2 | Independent of US1 in code; sequential for delivery sanity |
| 5 US2 (P1) | 2, US1 (in practice) | Settles consumption from US1 |
| 6 US3 (P1) | 2, US2 | Confirms claims from US2 |
| 7 US4 (P2) | 2, US2 (shares payments schema) | |
| 8 US6 (P2) | 2, US1 (transfers reference consumptions) | |
| 9 US7 (P2) | 2, US1 (uses beer_types / stock_changes from US1) | |
| 10 US8 (P3) | 2, US1, US2, US6 | Aggregates everything that came before |
| 11 Polish | All user-story phases | Final-mile work |

### Within each user story

- Tests can be written in parallel with implementation (interleaved is fine); each phase MUST land with its test tasks complete.
- Schema tasks block server-action tasks that touch those tables.
- Server actions block UI tasks that call them.
- Queries can be written in parallel with their consumers if the consumer mocks the query temporarily — in practice they ship together.

### Parallel opportunities

- All `[P]` tasks within a phase can run concurrently if multiple developers are available.
- Across phases, US1 + US5 can be parallel (different files, different routes, only foundational shared).
- US7 (Stock admin UI) can be parallel with US2 + US3 once US1's schema lands.
- Polish phase tasks are almost entirely parallelizable.

---

## Parallel Example: User Story 1

```text
# After Phase 2 completes, these can all start in parallel:
- T042 [P] [US1] balance unit test
- T046 [P] [US1] catalog schema (beer_types, stock_changes)
- T047 [P] [US1] sessions schema (drink_sessions)
- T048 [P] [US1] consumption schema (consumptions, consumption_voids)
- T050 [P] [US1] balance/calculate.ts
- T051 [P] [US1] queries/sessions.ts
- T056 [P] [US1] components/pin/pin-gate.tsx (uses foundational PIN service)
```

T049 (migration generation) joins after T046–T048. T054 (logBeer) joins after schema + queries. T058–T061 (UI) joins after the action.

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1)
2. **STOP and VALIDATE**: deploy a preview, sign in as the seed admin, log a beer, undo it, verify the audit trail
3. This is the smallest deployable beeromat — useful but limited to the seed admin

### Recommended P1 progression (full P1 = real v1)

1. Setup → Foundational → US1 → US5 (multi-user) → US2 (member self-pay) → US3 (treasurer confirm)
2. At this point you have a complete payment loop. Deploy to the real club; collect feedback; iterate before adding P2 features.

### Incremental P2 → P3

3. US4 (treasurer manual) — small slice, big quality-of-life for exception cases
4. US6 (bet transfers) — well-isolated; can be developed by a single contributor in parallel with US7
5. US7 (stock) — admin-side; doesn't change the daily UX much but solves the "out of stock" angering problem
6. US8 (history) — quality-of-life; lowest urgency

### Polish before each milestone deploy

- Run the Phase-11 tasks **incrementally** — don't save them for the end. After each P1 story, run security + a11y checks for the new surfaces.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks. Stay strict about this.
- `[Story]` label is mandatory on user-story phase tasks and forbidden on Setup, Foundational, and Polish tasks.
- Each user-story phase ends in a **Checkpoint** — the story should be independently demonstrable before the next phase starts.
- Commit after every logical group (typically every 3–5 tasks) with a clear `<phase>: <action>` message.
- Avoid cross-story file conflicts: a server action for US6 lives in `app/[locale]/(app)/bet/` and does not touch `app/[locale]/(app)/log/` actions.
- Spec FRs are referenced from `contracts/*.md` and `data-model.md`; if an FR seems missing from these tasks, surface it before continuing — don't silently drop coverage.

---

## Task count summary

| Phase | Tasks | Marked [P] |
|---|---|---|
| 1 Setup | 13 (T001–T013) | 8 |
| 2 Foundational | 28 (T014–T041) | 20 |
| 3 US1 (P1) — Log a beer | 21 (T042–T062) | 14 |
| 4 US5 (P1) — Invite/onboard | 12 (T063–T074) | 7 |
| 5 US2 (P1) — Settle (QR) | 22 (T075–T096) | 16 |
| 6 US3 (P1) — Treasurer confirm | 15 (T097–T111) | 11 |
| 7 US4 (P2) — Manual payment | 6 (T112–T117) | 3 |
| 8 US6 (P2) — Bet transfer | 14 (T118–T131) | 10 |
| 9 US7 (P2) — Stock & low-stock | 17 (T132–T148) | 14 |
| 10 US8 (P3) — History | 8 (T149–T156) | 6 |
| 11 Polish | 19 (T157–T175) | 16 |
| **Total** | **175** | **125 parallelizable** |

**Suggested MVP scope**: Phase 1 + Phase 2 + Phase 3 (US1) = 62 tasks. Real-club v1: through Phase 6 (US3) = 110 tasks.
