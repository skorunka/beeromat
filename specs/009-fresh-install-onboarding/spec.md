# Feature Specification: Fresh-Install Onboarding Wizard (v1.9)

**Feature Branch**: `009-fresh-install-onboarding`

**Created**: 2026-05-24

**Status**: Draft

**Input**: User description: "Add a fresh-install onboarding wizard at /setup that handles the case spec 008 explicitly left out: the deployment has no clubs row AND no users yet. When the app detects this state, every incoming route redirects to /setup. The wizard collects from the very first visitor: club name (min 1, max 120 chars), currency code (ISO 4217, e.g. CZK), default locale (from routing.locales — currently cs | en), and the admin's email address. On submit: inserts the clubs row + empty club_banking_profiles row + pre-creates the user with emailVerified=false and dispatches a magic-link email. Clicking the magic link verifies normally; spec 008's session.create.after databaseHook then auto-promotes that user to club_admin on the just-created club. Once a clubs row + a users row both exist, /setup MUST NOT be accessible. SEED_* env vars and scripts/seed.ts remain available for CI fixtures but become OPTIONAL for production bootstrap."

Spec 008 closed the *user → admin* leg of self-bootstrap: if a `clubs`
row exists and the `users` table is empty, the first email to complete
a magic-link round-trip auto-promotes to `club_admin`. But 008 left
one leg open by explicit choice (spec.md:118):

> v1.8 does not handle the "no club seeded either" case — that remains
> a deploy-time requirement (a single `clubs` row must exist).

That assumption is exactly what bit us in dev iteration just now:
clearing `.env.local` of `SEED_*` and `pnpm db:reset`-ing left a
deployment that the running app could not bootstrap from the browser
— because `promoteFirstUserIfNeeded` (lib/auth/bootstrap.ts:49)
short-circuits with `no-seeded-club` when no clubs row exists. The
deploy-time precondition was hidden, undocumented in the user-facing
flow, and impossible to satisfy without terminal access to the
running stack (psql, `pnpm db:seed`, or a SQL console).

v1.9 closes that gap with a single browser-driven onboarding wizard
at `/setup` that runs ONLY when the deployment is in true zero-state
(no clubs row AND no users row). The wizard collects the four fields
needed to materialise the `clubs` row plus the first admin's email,
then hands off to the existing magic-link sign-in plumbing — which in
turn triggers spec 008's promotion hook. State A (zero clubs, zero
users) → state B (one club, one users row, one members row,
role=`club_admin`) happens entirely through the browser. No SSH, no
env-var rewrite, no `scripts/seed.ts` execution.

After v1.9: a production deployment is fully self-serve. `git push`,
wait for the deploy, open the URL, fill four fields, click the email
link. That's it.

## Personas *(mandatory — constitution v1.4.0)*

- **P5 — Pavel, 45 · Fresh-install club admin**: New to beeromat.
  Deploys it for his tennis club (or has his cousin do it) and opens
  the live URL on his phone. He's never seen this app before; he
  expects something that behaves like signing up for any modern web
  service — fill in a few fields, click a link in your inbox, you're
  in. He does NOT expect to ssh into a server, edit env vars, or run
  a seed script. **This persona is the spec's primary user.**
- **P1 — Standa, 67 · Stock manager · Czech only**: Has been using
  beeromat for months. Never sees `/setup` — for him the deployment
  has long since been bootstrapped. He is the canary persona for
  *invisibility correctness*: a regression that shows `/setup` to
  Standa (or worse, blanks out his ledger and asks him to "set up
  the club") would be catastrophic. Every acceptance scenario in US2
  protects Standa.
- **P3 — Tereza, 34 · Member · iPhone, bilingual**: Same as Standa
  for invisibility, but also the persona who notices broken UX —
  copy that's mid-translation, a missing locale option, a form field
  whose validation message reads in the wrong language. Tereza is
  the spec's i18n + UX correctness check.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — First visitor bootstraps the club via the wizard (Priority: P1)

A freshly deployed beeromat has zero `clubs` rows and zero `users`
rows. The very first HTTP visitor — to any route — is redirected to
`/setup`. The wizard presents one form with four fields: club name,
currency, default locale, admin email. On submit, the system creates
the `clubs` row (plus its empty banking profile), pre-creates the
admin user with `emailVerified = false`, and dispatches a magic-link
email to that address. The user receives the email (in the locale
they just picked as the club default), clicks the link, the magic
link verifies, the existing spec 008 `session.create.after`
databaseHook fires and auto-promotes them to `club_admin` on the
brand-new club. They land authenticated on the home screen of a
fully-configured deployment.

**Why this priority**: This is the persona-blocker for P5. Without
US1, Pavel cannot bootstrap a deployment without somebody with shell
access. With US1, Pavel deploys → opens the URL → completes the
wizard → clicks the email link → done. The whole spec is downstream
of this story.

**Independent Test**: On a freshly migrated DB with zero clubs AND
zero users, hit any route in a clean browser — confirm the redirect
to `/setup`. Submit the form with valid values for all four fields.
Confirm: (a) one `clubs` row exists with the submitted name /
currency / default locale, (b) one `club_banking_profiles` row exists
referencing that club with banking fields null, (c) one `users` row
exists for the submitted email with `emailVerified = false`, (d) a
magic-link email arrives at Mailpit in the chosen locale, (e)
clicking the link completes verify and inserts a `members` row with
`role = 'club_admin'` for that user on the new club, (f) the user
lands at an authenticated screen.

**Acceptance Scenarios** *(each names the persona it serves)*:

1. **P5 (Pavel, fresh-deploy happy path)** — **Given** zero clubs and zero users in the database, **When** he opens the deployment URL and submits the wizard with `Tenisový klub Šafařík` / `CZK` / `cs` / `pavel@example.test`, **Then** the clubs row + banking profile row + users row are inserted in a single transaction AND a magic-link email is dispatched to `pavel@example.test` in Czech AND clicking that link lands him at an authenticated home screen AND a `members` row with `role = 'club_admin'` linking him to the new club exists.
2. **P5 (Pavel, refreshes /setup mid-flow without submitting)** — **Given** zero clubs and zero users and he is partway through the wizard, **When** he refreshes the page, **Then** he sees the same empty wizard form (no orphan data persisted, no error state from a half-submitted form).
3. **P5 (Pavel, picks `en` locale)** — **Given** zero clubs and zero users, **When** he submits the wizard with `en` as the default locale, **Then** the magic-link email arrives in English AND every subsequent screen that does not have an explicit user-locale override renders in English.

---

### User Story 2 — `/setup` is invisible once bootstrapped (Priority: P1)

After US1 has happened even once (i.e., at least one `clubs` row AND
at least one `users` row exist), the `/setup` route is no longer
reachable. Anyone — anonymous or signed-in, P1 / P3 / a new attacker,
on any device — who navigates to `/setup` is redirected away. The
wizard's form never renders. The wizard's server action refuses to
execute. There is no condition under which a post-bootstrap visit
can re-trigger onboarding.

**Why this priority**: Same priority as US1 because it's the safety
counterweight. Without US2, a stranger could reach `/setup` after
Pavel has bootstrapped and either (a) be confused by a "set up the
club" form on a club they don't own, or (b) — if there's a bug —
overwrite the configured club. US2 is the invariant that makes US1
safe to ship.

**Independent Test**: After running US1 to completion (one club +
one admin user exist), navigate to `/setup` as: (a) an anonymous
visitor — confirm redirect to `/sign-in`, (b) a signed-in
non-admin member — confirm redirect to `/`, (c) a signed-in club
admin — confirm redirect to `/` (the wizard is for fresh installs,
not for re-configuration; edits live at `/admin/config`). Confirm
that the wizard server action returns an error (HTTP 403 / `ok:
false`) when invoked directly via a crafted POST after bootstrap.

**Acceptance Scenarios**:

1. **P1 (Standa, post-bootstrap, anonymous)** — **Given** the deployment has been bootstrapped (≥1 clubs row, ≥1 users row), **When** he is signed out and navigates to `/setup`, **Then** he is redirected to `/sign-in` AND no wizard form is rendered.
2. **P3 (Tereza, post-bootstrap, signed-in member)** — **Given** the deployment has been bootstrapped AND she is signed in as a regular member, **When** she navigates to `/setup`, **Then** she is redirected to `/` AND no wizard form is rendered.
3. **Stranger crafts a direct POST to the wizard's server action post-bootstrap** — **Given** a club + admin user already exist, **When** anyone (anonymous or otherwise) invokes the wizard's submit action, **Then** the action refuses to execute (no second clubs row is inserted, no second users row is inserted, no email is dispatched) AND returns an error indicating bootstrap is already complete.
4. **Race: two visitors hit /setup simultaneously on a true-fresh deployment** — **Given** zero clubs and zero users, **When** both visitors submit the wizard within milliseconds, **Then** exactly ONE submission succeeds (one clubs row, one users row, one email dispatched) AND the second submission fails with a "bootstrap already complete" error (it sees the state-A precondition is no longer true). The losing visitor sees a friendly explanation: "Someone just finished setting up — go sign in instead."

---

### User Story 3 — Wizard input validation (Priority: P2)

The wizard validates each field at submit time and reports errors
inline on the form so the first visitor never gets a generic 500 or
an unintelligible server error from bad input. Validation rules:
club name (1–120 chars after trim), currency code (3 uppercase
letters matching ISO 4217), default locale (one of the values
declared in `routing.locales` — currently `cs` and `en`), admin
email (RFC-5322-shaped, after trim + lowercase).

**Why this priority**: P2 because US1 + US2 are the persona-shipping
critical path; US3 is the "first-impression matters" layer. A wizard
that 500s on a typo'd currency would ship as broken even if US1
technically works on the happy path. But US3 is independently
testable from US1 (you can unit-test the schema without standing up
a DB).

**Independent Test**: With zero clubs + zero users, submit the
wizard with each of: empty club name → inline error; 200-char club
name → inline error; `EU` (2-letter) currency → inline error; `eur`
(lowercase) currency → inline error (or auto-uppercased — see
Assumptions); `de` locale → inline error (not in `routing.locales`);
malformed email → inline error. Confirm in each case that NO rows
are inserted, NO email is dispatched, and the form re-renders with
the error and the user's prior input preserved.

**Acceptance Scenarios**:

1. **P5 (Pavel, typo'd currency)** — **Given** zero clubs and zero users, **When** he submits the wizard with currency `CZ` (2 letters), **Then** the form re-renders with an inline error on the currency field reading something like "Currency must be a 3-letter ISO 4217 code" AND no rows are inserted AND no email is sent.
2. **P5 (Pavel, club name too long)** — **Given** zero clubs and zero users, **When** he submits a 121-character club name, **Then** the form re-renders with an inline error and his other field values preserved.

---

### User Story 4 — Wizard renders in both supported locales (Priority: P2)

The wizard itself (form labels, button text, error messages,
welcome copy) is fully i18n'd in both Czech and English. The locale
shown on first visit follows the standard next-intl middleware: it
respects the URL prefix, the `Accept-Language` header, the
`NEXT_LOCALE` cookie, then falls back to `routing.defaultLocale`.
A small locale switcher is visible on the wizard so a first visitor
landing on a `cs` URL who prefers English can switch before
submitting.

**Why this priority**: P2, same reason as US3 — i18n parity is a
constitution-level non-negotiable, but it's a quality bar, not a
prerequisite for US1/US2 to work mechanically.

**Independent Test**: Hit `/cs/setup` and `/en/setup` on a fresh
deployment. Confirm every visible string is translated — title,
field labels, placeholders, helper text, submit button, error
messages on validation failure, confirmation copy after submit.
Run `pnpm i18n:check` and confirm no hardcoded strings in the
wizard's component(s) and full catalog parity between `messages/
cs.json` and `messages/en.json` for the new `onboarding.*`
namespace.

**Acceptance Scenarios**:

1. **P3 (Tereza, bilingual on iPhone with cs default)** — **Given** zero clubs and zero users and her browser default locale is Czech, **When** she opens the deployment URL, **Then** the wizard renders in Czech AND a visible locale switcher lets her flip to English without losing form data.
2. **P5 (Pavel, prefers English)** — **Given** zero clubs and zero users, **When** he hits `/en/setup` directly, **Then** every visible string is in English AND the submit dispatches a Czech-or-English magic-link email matching the locale HE submitted as the club default (not his current UI locale — those are independent).

---

### Edge Cases

- **Magic-link email never arrives** (SMTP misconfigured at deploy
  time): the wizard's response copy must tell the user "we've sent a
  link to <email> — if it doesn't arrive in 5 minutes, check your
  spam, or your deployment's SMTP settings." We do NOT silently fail.
  The clubs row + users row WILL have been inserted at this point,
  so the user is effectively locked out until SMTP is fixed. v1.9
  accepts this risk; mitigations are out of scope (see Out of Scope).
- **User submits wizard, never clicks magic link**: the users row
  exists with `emailVerified = false`, no members row exists. The
  deployment is now in a state where `/setup` is correctly inaccessible
  (users count > 0) BUT spec 008's bootstrap promotion will fire when
  this same user eventually clicks the link, even if it's days later.
  No special handling — this is the normal asynchronous magic-link
  pattern.
- **User submits wizard, clicks magic link, then a stranger submits
  /sign-in with their own email before promotion completes**: the
  stranger sees `not-on-allowlist` (existing v1.5 behaviour) because
  no members row exists for them. Bootstrap promotion only fires for
  the user whose session was just created — see spec 008
  data-model.md §2.
- **Bootstrap precondition violated mid-request** (zero clubs at
  request entry, one clubs row by the time the transaction commits
  — i.e., a concurrent wizard submission won the race): the losing
  transaction must roll back cleanly with no partial inserts and
  must return a friendly "bootstrap already complete" error to the
  user. The race-safety mechanism (advisory lock, see spec 008's
  pattern) prevents the losing transaction from inserting a second
  clubs row.
- **Deployment is bootstrapped, admin deletes the club's only
  members row via psql** (operator self-foot-gunning): users count >
  0 but no admin member exists. `/setup` is correctly NOT shown
  (users non-empty). The deployment is in an unrecoverable state
  from the browser; recovery requires shell access. v1.9 does NOT
  attempt to detect or recover from this — it's a deploy-time
  invariant violation, not a user-facing flow.
- **Two clubs rows somehow exist** (operator manually inserted, or
  a future multi-club spec): `/setup` is correctly NOT shown (clubs
  non-empty). v1.9's wizard targets exactly the zero-clubs state;
  any non-zero-clubs state means onboarding has already happened
  (by this spec, by `scripts/seed.ts`, or by manual operator action)
  and the wizard is not the right tool.

## Requirements *(mandatory)*

### Functional Requirements

#### Bootstrap state detection

- **FR-001**: System MUST detect the "true-fresh" state on every
  incoming request by checking that BOTH `clubs` is empty AND `users`
  is empty. Only in that state is `/setup` reachable; in any other
  state, `/setup` redirects (see FR-007 / FR-008).
- **FR-002**: The detection check MUST be cheap enough to run on
  every request without measurable latency impact on signed-in users
  (target: < 5 ms p95 for the two `COUNT(*)` queries, or use a
  cached signal that invalidates when either table transitions from
  empty to non-empty).

#### Wizard form

- **FR-003**: System MUST render an onboarding wizard at `/setup`
  containing exactly four fields: club name, currency code, default
  locale, admin email. No optional fields, no progressive disclosure
  in v1.9 — one screen, one submit.
- **FR-004**: System MUST validate input at submit time with these
  rules and report failures inline on the form, preserving the
  user's prior input on re-render:
  - Club name: trim then length ∈ [1, 120].
  - Currency code: trim, optionally uppercase, then match `^[A-Z]{3}$`
    (ISO 4217 shape; no check-digit validation against a static
    currency list — that's out of scope).
  - Default locale: must be one of the values exported by
    `routing.locales` (currently `cs`, `en`).
  - Admin email: trim, lowercase, then match a permissive
    RFC-5322-shaped regex (the same one the existing sign-in form
    uses — DO NOT diverge).
- **FR-005**: System MUST localise every visible string in the
  wizard (title, field labels, placeholders, helper text, submit
  button label, validation error messages, post-submit confirmation
  copy) using next-intl, with full catalog parity between `cs` and
  `en`. New keys live under a single `onboarding.*` namespace.

#### Submit handling

- **FR-006**: On valid submit, the system MUST execute the following
  in a single atomic transaction:
  1. Insert ONE `clubs` row with the submitted name, currency,
     default locale.
  2. Insert ONE `club_banking_profiles` row referencing that club
     with banking fields null (matches `scripts/seed.ts` behaviour).
  3. Insert ONE `users` row for the submitted email with
     `emailVerified = false` (matches the existing spec 008 bootstrap
     pre-create pattern in `requestMagicLinkAction`).
  4. Acquire a transactional advisory lock (same key as spec 008,
     so the two bootstrap paths serialise with each other) to make
     the precondition check race-safe.
  If any step fails, the whole transaction MUST roll back — no
  partial bootstrap is allowed.
- **FR-007**: After a successful transaction, the system MUST
  dispatch a magic-link email to the submitted address via the same
  mailer used by `requestMagicLinkAction` (spec 007 i18n threading
  applies — email locale matches the `defaultLocale` the wizard
  user selected, NOT the locale of their current UI session).
- **FR-008**: The system MUST then redirect the user (browser-side)
  to a confirmation page (`/sign-in?bootstrap-sent=1` or
  equivalent) that tells them to check their email. The user is NOT
  yet signed in at this point — sign-in completes only when they
  click the magic link.
- **FR-009**: Spec 008's existing `session.create.after` databaseHook
  (`promoteFirstUserIfNeeded` in `lib/auth/bootstrap.ts`) MUST fire
  unchanged when the user clicks the link. v1.9 does not modify the
  promotion logic — it only fills in the missing clubs-row creation
  leg. State A → B from spec 008 data-model.md §2.

#### Route guard

- **FR-010**: When NOT in the true-fresh state (i.e., when clubs
  count > 0 OR users count > 0), the system MUST redirect every
  visit to `/setup`:
  - To `/sign-in` if the visitor is anonymous.
  - To `/` if the visitor is signed in (regardless of role — the
    wizard is for fresh installs, not re-configuration; admins edit
    via `/admin/config`).
- **FR-011**: When IN the true-fresh state, the system MUST redirect
  every visit to ANY route OTHER than `/setup` to `/setup`. Static
  assets (icons, manifest) and Better Auth's verify endpoint
  (`/api/auth/magic-link/verify`) are exempt — the verify endpoint
  must remain reachable so the just-dispatched magic link works.
- **FR-012**: The wizard's submit server action MUST itself re-check
  the precondition inside its transaction (defence in depth — the
  middleware redirect is a UX layer, not a security boundary). If
  the precondition is no longer true at submit time, the action MUST
  return an error and MUST NOT insert any rows.

#### Compatibility

- **FR-013**: `scripts/seed.ts` MUST remain functional and idempotent.
  A deployment that runs `pnpm db:seed` first and then opens the URL
  sees a non-fresh state immediately and goes straight to `/sign-in`
  (the wizard never appears). v1.9 changes the bootstrap *default*
  path but MUST NOT regress the existing seed path.
- **FR-014**: `SEED_*` env vars MUST remain optional at runtime
  (per the env.ts fix landed on main alongside this spec). The
  wizard provides the production-default bootstrap path; the seed
  script remains a developer / CI convenience.

### Key Entities *(include if feature involves data)*

No new domain entities. v1.9 reuses:

- **`clubs` row**: existing entity. The wizard creates the *first*
  one. Subsequent edits happen via spec 008's `/admin/config`.
- **`club_banking_profiles` row**: existing entity. Created empty
  alongside the clubs row, matching `scripts/seed.ts` behaviour
  exactly so post-bootstrap state is indistinguishable between the
  wizard path and the seed-script path.
- **`users` row**: existing entity (Better Auth schema). The wizard
  pre-creates with `emailVerified = false`, matching the existing
  spec 008 bootstrap pre-create branch in `requestMagicLinkAction`.
- **`members` row**: existing entity. NOT created by the wizard —
  created by spec 008's `session.create.after` hook when the user
  later clicks the magic link and the session is established.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fresh-deploy admin completes the wizard (open URL →
  submit four fields → click email link → land authenticated) in
  under 90 seconds end-to-end, on a mid-range mobile device, without
  reading any documentation outside the wizard itself.
- **SC-002**: Zero terminal-required steps in the production bootstrap
  path. `git push` → wait for deploy → open URL → finish. Verified by
  attempting the full bootstrap on a fresh deployment with no shell
  access to the running stack.
- **SC-003**: Post-bootstrap, the `/setup` route returns a redirect
  (3xx) on 100% of visits — anonymous, signed-in member, signed-in
  admin, direct POST to the server action. Zero responses serve the
  wizard form or accept a wizard submission after bootstrap.
- **SC-004**: Existing P1/P3 personas (Standa, Tereza) experience zero
  change to their flow. Their next 100 navigations after the v1.9
  ship date produce zero accidental `/setup` renders.
- **SC-005**: i18n parity: 100% of `onboarding.*` keys present in both
  `messages/cs.json` and `messages/en.json`. `pnpm i18n:check` passes.
- **SC-006**: A wizard submission that fails validation (any of the
  US3 cases) takes under 200ms server-side, returns the form with
  inline errors, and inserts zero rows. Verified by unit test.
- **SC-007**: A wizard submission under race contention (two
  near-simultaneous submits on a true-fresh deployment) results in
  exactly ONE successful bootstrap and ONE friendly-error response.
  Verified by an integration test that fires two concurrent submits
  via `Promise.all`.

## Assumptions

- **No "setup token" / out-of-band secret**: the wizard is reachable
  by *anyone* who hits the deployment URL during the true-fresh
  window. Assumed acceptable because: (a) the window closes the
  instant the first valid submission lands (clubs + users non-empty),
  (b) a freshly-deployed unknown URL is not yet shared with users,
  (c) the magic-link is delivered to whatever email is submitted, so
  whoever claims the deployment is whoever can read the inbox they
  type in. If the deployer is concerned about a race against an
  external scanner, they can run `pnpm db:seed` immediately
  post-deploy to skip the wizard window entirely.
- **Currency input is permissive of case**: `czk` and `CZK` both
  accepted; the system uppercases before validating + persisting. The
  prior v1.8 `clubConfigSchema` was strict-case; the wizard relaxes
  this for first-touch UX, then writes the canonical uppercase form
  to the DB.
- **Locale list comes from `routing.locales`**: today `cs` and `en`.
  If a future spec adds locales (e.g., `sk`, `de`), the wizard's
  dropdown updates automatically with no spec change.
- **Default copy persona**: wizard headings use a friendly,
  non-jargon-y voice matching the rest of the v1.5-redesigned auth
  surface — "Welcome to beeromat" / "Vítej v beeromatu" rather than
  "Configure your tenant."
- **Magic-link email uses the wizard's chosen `defaultLocale`, not
  the user's UI locale**: this is the deliberate semantics for the
  *first* magic-link only — the user is telling us "this club's
  primary language is X", so the email that establishes them as
  admin arrives in X. Future magic-links (sign-in after sign-out)
  follow the standard spec 007 behaviour (UI-session locale).
- **Wizard runs inside the existing `[locale]` route group**: paths
  are `/cs/setup` and `/en/setup`, not a top-level `/setup`. The
  middleware redirect from FR-011 normalises any reachable URL
  (including the locale-stripped `/setup`) into the locale-prefixed
  form. Implementation detail flagged here so the planner does not
  invent a parallel non-localised route tree.

### Out of Scope (explicitly)

- **Collecting secrets/infra config via the wizard** (Turnstile site
  keys, SMTP credentials, `BETTER_AUTH_SECRET`, etc.): these stay
  env-driven per constitution Principle II's split — secrets in env,
  tenant-scoped business config in admin UI / wizard.
- **Post-onboarding undo / "factory reset"**: one-way flow. Edits
  happen via spec 008's existing `/admin/config`. Re-running
  onboarding requires a true DB reset (operator-level action).
- **Multi-step wizard for initial members / invitations**: the
  first admin lands on `/`, navigates to the existing invitation
  flow, and invites whomever they want. v1.9 does not invent a new
  invitation UX inside the wizard.
- **Multi-club setup**: still single-club per the prevailing
  constitution. The wizard inserts exactly ONE clubs row and the
  precondition check is "zero clubs", not "this user has no clubs".
- **SMTP-failure recovery flow**: if the deployment's SMTP is
  misconfigured and the magic-link email never arrives, the
  wizard's state is "users count = 1, members count = 0", which
  locks the deployment until SMTP is fixed and the user re-requests
  a magic link. v1.9 documents this risk; a self-service SMTP
  diagnostic / re-send is a future spec.
- **Turnstile / bot protection on the wizard**: deferred. The
  wizard runs at most once per deployment (the window closes as
  soon as the first valid submit completes), so the abuse surface
  is bounded. If a future deployment pattern (e.g., shared staging
  envs that reset frequently) makes this a real concern, a new
  spec adds it.
