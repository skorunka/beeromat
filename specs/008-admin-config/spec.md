# Feature Specification: Admin Configuration + Self-Bootstrap (v1.8)

**Feature Branch**: `008-admin-config`

**Created**: 2026-05-23

**Status**: Shipped

**Input**: User description: "Add an Admin Configuration section in the admin UI to manage club-scoped settings that currently live in environment variables (club name, currency, default locale, possibly banking profile fields). Move what makes sense from env into the in-app admin per constitution Principle II. Add a bootstrap rule: if the users table is empty, the first user that completes magic-link sign-in becomes the club admin automatically. Out of scope: multi-club admin UI, SEED env var elimination (they stay for bootstrap), member role escalation/de-escalation."

The constitution's Principle II is unambiguous: **tenant-scoped config
is admin-UI-driven, not env-var-driven**. The v1 deployment seeded the
single club from `SEED_CLUB_NAME` / `SEED_CLUB_CURRENCY` /
`SEED_CLUB_LOCALE` env vars and then never gave the admin a way to
change them. Today, "rename the club" or "switch from CZK to EUR"
requires a redeploy with new env vars — the canonical Principle II
violation.

v1.8 closes that gap with two reinforcing changes:

1. **Admin Configuration section** at `/admin/config`: a focused
   admin-only screen for editing the club's name, currency, default
   locale, and banking profile (IBAN, account holder, Revolut handle
   if used). Changes save through the existing v1.2 forms layer
   (react-hook-form + Zod), persist to the `clubs` row, and
   propagate to every screen that reads them.

2. **First-user self-bootstrap**: if the `users` table is empty, the
   FIRST email submitted to the sign-in form completes the magic-link
   round-trip AND is auto-promoted to `club_admin` on the single
   seeded club. No out-of-band SEED_ADMIN_EMAIL needed; `deploy +
   sign in once = you're the admin`.

Together: a fresh deployment is fully self-bootstrapping. Deploy →
sign in → land at `/admin/config` → set your club's name, currency,
locale, banking profile → invite the first members. No env-var
rewrite, no redeploy, no terminal access to the prod server.

This is **plumbing-plus-UI**: it adds one admin screen, one new
server action (`updateClubConfig`), one new bootstrap branch in
`requestMagicLinkAction`, and three new i18n key clusters. No new
domain entity (the `clubs` row already exists; we expose it for
editing). No schema migration if the columns we need already exist;
ONE small migration if `banking_profile.holder_name` (or similar) is
missing.

## Personas *(mandatory — constitution v1.4.0)*

- **P5 — Pavel, 45 · Fresh-install club admin**: New to beeromat. Deploys it for his tennis club (or has his cousin do it). Today he has to ssh in and re-edit env vars to change anything; he wants to do it from his phone instead. **This persona is the spec's primary user.**
- **P1 — Standa, 67 · Stock manager · Czech only**: Doesn't touch admin himself, but he's affected by every config change Pavel makes — if Pavel changes the currency from CZK to EUR mid-quarter, Standa's screens must reflect that immediately, with money formatted in the new currency from the next render. Standa is the canary persona for config-propagation correctness.
- **P3 — Tereza, 34 · Member · iPhone, bilingual**: Same as Standa for propagation — but also the persona who notices broken UX (e.g., if the bank IBAN field doesn't accept a Czech IBAN's spacing convention because we coded for IBAN-without-spaces only). She's the spec's UX correctness check.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Self-bootstrap on a fresh deployment (Priority: P1)

A freshly deployed beeromat has the single club row seeded but no
users. The FIRST email submitted to `/sign-in` triggers a magic-link
dispatch; clicking the link verifies the user, creates the user row,
auto-creates a `club_admin` member row for that user on the seeded
club, and lands the new user at the admin home (or
`/admin/config`).

**Why this priority**: This is the persona-blocker. Without it, Pavel
needs out-of-band terminal access on the prod server to seed the
admin's email — defeating the whole "self-bootstrap" promise. US1
must work for US2 to be reachable at all.

**Independent Test**: On a freshly migrated test database with zero
users and the one seeded club, hit `/sign-in` from a clean browser,
submit `freshadmin@example.test`. Open the magic-link from Mailpit.
Confirm the user lands at an authenticated screen and that a new
`members` row exists with `role = 'club_admin'` for that user on the
seeded club.

**Acceptance Scenarios** *(each names the persona it serves)*:

1. **P5 (Pavel, fresh install)** — **Given** the `users` table is empty and exactly one `clubs` row exists (the seeded one), **When** he submits his email to `/sign-in` and completes the magic-link verification, **Then** a `users` row is created for him AND a `members` row with `role = 'club_admin'` is auto-inserted linking him to the seeded club AND he lands on an authenticated admin-accessible screen.
2. **P5 (Pavel, second sign-in)** — **Given** he is already the seeded club admin (his user + member rows exist), **When** he signs in again on a new device, **Then** the bootstrap rule does NOT fire again (his existing member-club_admin row is preserved; no duplicate row is inserted).
3. **Any unknown email post-bootstrap** — **Given** the `users` table is non-empty (Pavel has bootstrapped), **When** a stranger submits their email to `/sign-in`, **Then** the existing v1.5 not-on-allowlist behaviour fires (`requestMagicLinkAction` returns `not-on-allowlist`; no user/member rows are created). The bootstrap rule fires once, on emptiness only.

---

### User Story 2 — Admin edits club config from the UI (Priority: P1)

Pavel (or any future club_admin) opens `/admin/config`, sees the
current club name / currency / default locale / banking profile,
edits any field, saves. The change persists to the `clubs` row and
is reflected on every screen that reads those values from the next
render onwards.

**Why this priority**: This is the core feature. Without it, Pavel
can sign in (US1) but still can't change his club's name from "Test
Club" to "TK Slávia Praha" without a redeploy. US2 unblocks the day-1
admin experience.

**Independent Test**: Sign in as the seeded admin. Navigate to
`/admin/config`. Change the club name from "Test Club" to "New Name",
save. Confirm the change persists by (a) reloading `/admin/config`
and seeing "New Name" in the field, AND (b) navigating to a
member-facing screen that shows the club name and seeing "New Name".
Repeat for currency (CZK → EUR) and verify a money-display screen
shows the new currency symbol/formatting.

**Acceptance Scenarios**:

1. **P5 (Pavel, club rename)** — **Given** he is signed in as `club_admin` and the club is currently named "Test Club", **When** he goes to `/admin/config`, changes the name to "TK Slávia Praha", and saves, **Then** the `clubs.name` column is updated AND the change is visible on every screen that displays the club name.
2. **P1 (Standa, post-currency-change)** — **Given** the admin just changed the club currency from CZK to EUR, **When** Standa next opens the app, **Then** every money amount on his screens is formatted in EUR (currency symbol + locale-appropriate spacing) via `Intl.NumberFormat`, with no stale CZK rendering.
3. **P5 (Pavel, banking profile)** — **Given** the club has no banking profile set, **When** Pavel enters a valid Czech IBAN + account holder name + optional Revolut handle and saves, **Then** the banking profile row is created AND the existing settle-up screen (US2 from v1) renders the IBAN correctly in QR / Revolut deeplink form.
4. **P5 (Pavel, validation error)** — **Given** he is editing the config, **When** he enters a malformed IBAN or a non-ISO-4217 currency code, **Then** in-app, locale-aware validation errors render in the form (no native browser bubble), and no DB write occurs.
5. **Non-admin attempted access** — **Given** a regular `member` is signed in, **When** they navigate to `/admin/config` directly via URL, **Then** they are redirected away (same RBAC pattern as the rest of `/admin/*`) and the `updateClubConfig` action rejects their request server-side.

---

### Edge Cases

- **Bootstrap race**: two emails submitted simultaneously when the `users` table is empty. Only ONE should be promoted to `club_admin`; the second submission becomes a regular not-on-allowlist response. Implementation MUST use a transactional select-for-update on the users-count check OR an atomic insert with conflict handling — not two separate reads.
- **Bootstrap on a non-empty club but empty users**: the seeded club exists but no users have ever signed in. The first sign-in attaches to THAT seeded club (not a new one). v1.8 does not handle the "no club seeded either" case — that remains a deploy-time requirement (a single `clubs` row must exist).
- **Currency change affecting historical data**: changing the club's currency does NOT retroactively re-denominate past consumption/payment rows. Historical money amounts stay in whatever currency they were recorded in (currently the column is amount-only without a per-row currency tag). v1.8 must surface this in the admin UI as a warning when changing currency: "This changes how future amounts display; existing entries stay in {oldCurrency}." Long-term, per-row currency is a separate spec.
- **Banking profile partial edit**: an admin saves an IBAN but leaves account-holder blank. The settle-up screen needs the holder name for the QR code per CZ banking conventions. Either (a) require all banking fields together, or (b) allow partial save but make settle-up fall back gracefully. v1.8 chooses (a): banking fields are saved as one transactional unit.
- **Locale change affecting active sessions**: if the admin changes the club's default locale from `cs-CZ` to `en-US`, currently-signed-in users with the explicit locale-cookie set are unaffected (their per-user preference wins); new visitors and users without an explicit preference see the new default.
- **i18n parity**: all new admin-config strings (field labels, save button, error messages, bootstrap-success flash) ship in `cs` and `en` from day one; `pnpm i18n:check` MUST pass.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST auto-create a `club_admin` member row on the seeded club for the first user whose magic-link sign-in completes against an empty `users` table. The check MUST be transactional to avoid race conditions when two emails arrive simultaneously.
- **FR-002**: The bootstrap rule MUST be one-shot. Once the `users` table is non-empty, subsequent unknown-email sign-in attempts MUST fall through to the existing v1.5 `not-on-allowlist` behaviour (no auto-admission, no role assignment).
- **FR-003**: Bootstrap MUST require a successful magic-link round-trip (Turnstile passed, magic-link sent + verified). A submission that doesn't complete the round-trip MUST NOT promote any user.
- **FR-004**: An `/admin/config` route MUST exist, accessible only to users whose member row on the active club has `role = 'club_admin'`. RBAC is enforced server-side via the existing `requireRole('club_admin')` helper.
- **FR-005**: The admin-config form MUST allow editing the following club-scoped fields: club name, currency code (ISO 4217), default locale (one of the supported `routing.locales`), banking profile (IBAN, account holder name, Revolut handle as optional).
- **FR-006**: Validation MUST happen through the existing v1.2 forms layer (react-hook-form + Zod schemas). Server-side, the same Zod schemas validate the action input. No native HTML5 validation. Locale-aware error messages.
- **FR-007**: A successful save MUST persist atomically (single transaction for club row + banking profile row) and revalidate the admin-config page plus any path that displays the changed fields (`revalidatePath`).
- **FR-008**: A currency change MUST display a warning in the form before saving: "Future amounts will display in {newCurrency}; existing entries stay in {oldCurrency}." Save proceeds only after the admin confirms.
- **FR-009**: Banking-profile fields MUST be saved as a transactional unit (all-or-nothing). A partial state (IBAN set but holder blank) MUST NOT persist.
- **FR-010**: The SEED_CLUB_NAME / SEED_CLUB_CURRENCY / SEED_CLUB_LOCALE / SEED_ADMIN_EMAIL env vars MUST remain in `.env.example` AND in `scripts/seed.ts` for first-deploy bootstrap. The spec does NOT remove them. Documentation MUST clarify that they are bootstrap-only and that subsequent edits happen via `/admin/config`.
- **FR-011**: All new user-facing strings MUST exist in both `messages/cs.json` and `messages/en.json` under appropriate namespaces (`admin.config.*`, `auth.signIn.bootstrapWelcome` if a bootstrap flash is added). `pnpm i18n:check` MUST pass.
- **FR-012**: All seven verification gates MUST pass after implementation: typecheck, lint, test:unit, i18n:check, forms:check, build, test:e2e.

### Security Requirements

- **SR-001**: The bootstrap rule MUST NOT introduce a new public sign-up path. The condition is strictly "users table is empty" — a transient state that exists at most once per deployment. The constitution's Principle IV ("Invitation-only; no public sign-up flow") remains satisfied because the bootstrap is single-shot and effectively self-invites only the deployment operator.
- **SR-002**: The bootstrap rule MUST run inside the same code path as the v1.5 `requestMagicLinkAction` (or its post-verification callback), gated by Turnstile + the existing rate limiter. An attacker hitting a fresh deployment cannot bypass bot protection by exploiting the bootstrap.
- **SR-003**: The `updateClubConfig` action MUST verify the caller's `club_admin` role on the active club server-side, regardless of any client-side guard. The existing `requireRole('club_admin')` helper is the enforcement point.
- **SR-004**: Currency code, IBAN, and locale inputs MUST be validated against the same Zod schemas the existing screens use (ISO 4217 for currency, RFC 7064 / mod-97 for IBAN, `routing.locales` for locale). Invalid values MUST be rejected before any DB write.

### Key Entities

- **`clubs` row**: the existing v1 entity. `name`, `currency_code`, `default_locale` are the fields the admin can now edit. No new column needed.
- **`club_banking_profiles` row**: existing entity (added in v1). `iban`, `account_holder_name`, `revolut_handle` (or similar field names — exact names verified during /speckit-plan). If `account_holder_name` (or equivalent) is missing from the schema, a small migration adds it.
- **`members` row**: existing entity. The bootstrap rule inserts a row with `role = 'club_admin'` for the first user, on the seeded club. No new column needed.

## Success Criteria

### Measurable Outcomes

- **SC-001**: On a freshly deployed beeromat (one seeded club, empty users), the first end-to-end magic-link sign-in promotes that user to `club_admin` on the seeded club, with zero out-of-band setup (no terminal access to the prod server, no env-var rewrite).
- **SC-002**: A signed-in `club_admin` can change the club name / currency / default locale / banking profile through `/admin/config` and see the change reflected on every member-facing screen on the next render (no app restart, no cache invalidation required).
- **SC-003**: A change to the club currency triggers a confirmation prompt explaining that existing entries stay in the old currency, before the save proceeds.
- **SC-004**: A non-admin who navigates directly to `/admin/config` via URL is redirected away; their attempted `updateClubConfig` action is rejected server-side with a 403-equivalent.
- **SC-005**: Race condition: two emails submitted in the same second against an empty `users` table result in exactly ONE user being promoted to `club_admin` (the bootstrap is atomic). The second submission gets the standard not-on-allowlist response.
- **SC-006**: All seven verification gates pass: typecheck, lint, test:unit, i18n:check, forms:check, build, and test:e2e (with the existing auth + email-i18n specs continuing green, plus the new admin-config spec from `/speckit-tasks`).

## Assumptions

- **Single-club deployment**: this spec is the v1 product shape (one seeded `clubs` row per deployment). Multi-club admin UI is explicitly out of scope (see Out of Scope). Routing of `updateClubConfig` to "the" club is unambiguous because there is only one.
- **Banking-profile schema already covers the fields the admin needs**: confirmed during /speckit-plan. If not, ONE small Drizzle migration adds the missing column(s). The spec authors v1.8 NOT to introduce a deeper banking-profile redesign.
- **The existing `requireRole('club_admin')` helper** already enforces the role check on the v1 admin routes. The new `/admin/config` route reuses that helper unchanged.
- **Currency change does NOT retroactively re-denominate** historical amounts. Per-row currency tagging is a separate, future spec.
- **No new test infrastructure**: existing Vitest + Playwright + Mailpit cover the bootstrap and admin-config paths via straightforward additions (one new bootstrap unit test + one new admin-config E2E spec).
- **No new dependency**: the form, validation, RBAC, server-action, and i18n layers are all present (v1 / v1.2 / v1.5 / v1.6). v1.8 is composition over those.

## Out of Scope

- **Multi-club admin UI**: switching between clubs, admin-of-many-clubs surface. The schema is already multi-tenant per Principle II, but the v1 product remains single-club.
- **SEED env var elimination**: the SEED_* env vars remain in `.env.example` and `scripts/seed.ts` for first-deploy bootstrap. They become bootstrap-only (documented as such), not removed.
- **Member role escalation/de-escalation by admins**: changing other members from `member` to `treasurer` to `club_admin` is its own admin surface (separate spec).
- **Per-row currency tagging**: if you change currency from CZK to EUR mid-year, existing entries stay denominated in CZK and just display as such. Retroactive re-tagging or migration is its own spec.
- **Audit log of config changes**: the `clubs` row is updated in place; v1.8 does NOT add a `club_config_changes` history table. Per Principle V, the *user-facing reversibility* of a config change is the retry-and-save loop (the admin can re-save the old value); a richer history is deferred.
- **Public sign-up beyond the single-shot bootstrap**: explicitly out. The bootstrap fires once per deployment when `users` is empty; after that, invitation-only remains the rule (Principle IV).
