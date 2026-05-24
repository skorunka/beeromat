# Data Model — Fresh-Install Onboarding Wizard (v1.9)

Spec 009 introduces **zero** new entities, **zero** new columns, and **zero** schema migrations. Every row inserted by the wizard maps to a column that already exists for spec 001 (`members`, `users`) or spec 008 (`clubs`, `club_banking_profiles`). What 009 *does* introduce is a new state at the front of spec 008's bootstrap state machine and a new transactional entry point that materialises three rows at once.

## 1. Affected entities (existing)

### `clubs` (defined in `lib/db/schema/clubs.ts`)

| Column | Wizard contribution | Source |
|---|---|---|
| `id` | Generated server-side (UUID) | Default |
| `name` | Wizard form `clubName` (trimmed, 1–120 chars) | User input |
| `currency_code` | Wizard form `currencyCode` (uppercased, ISO 4217 shape) | User input |
| `default_locale` | Wizard form `defaultLocale` (one of `routing.locales`) | User input |
| `created_at` | Default `now()` | Default |
| `updated_at` | Default `now()` | Default |

### `club_banking_profiles` (defined in `lib/db/schema/clubs.ts`)

| Column | Wizard contribution | Source |
|---|---|---|
| `id` | Generated server-side (UUID) | Default |
| `club_id` | The just-inserted clubs row's id | Transaction context |
| `holder_name`, `iban`, `revolut_handle`, etc. | `null` (admin sets later via `/admin/config`) | Empty by design |

This mirrors `scripts/seed.ts` line 53–55 — same empty banking profile, populated post-bootstrap through spec 008's admin form.

### `users` (Better Auth schema, `lib/db/schema/auth.ts`)

| Column | Wizard contribution | Source |
|---|---|---|
| `id` | Generated server-side (UUID) | Default — see `lib/auth/better-auth.ts:37` (`generateId: 'uuid'`) |
| `email` | Wizard form `adminEmail` (trimmed, lowercased) | User input |
| `name` | Derived: local-part of email (e.g., `pavel@example.test` → `pavel`) | Mirror of spec 008's bootstrap pre-create at `lib/auth/actions.ts:193` |
| `emailVerified` | `false` | Critical — flips to `true` only when the magic-link verify completes; this is what gates the spec 008 promotion hook |
| `createdAt`, `updatedAt` | Default `now()` | Default |

### `members` (defined in `lib/db/schema/members.ts`)

**Not inserted by the wizard.** The `members` row with `role = 'club_admin'` is created by spec 008's `promoteFirstUserIfNeeded` hook at `lib/auth/bootstrap.ts:61-70`, firing from the `session.create.after` databaseHook when the user clicks the magic link. Spec 009 explicitly does NOT touch this code path.

## 2. State machine (extends spec 008's `data-model.md §2`)

Spec 008 defined three deployment states:

| State | clubs count | users count | members count | Meaning |
|---|---|---|---|---|
| **A** | 1 | 0 | 0 | Seeded but no user has signed in yet — bootstrap candidate |
| **B** | 1 | ≥1 | ≥1 | Bootstrapped — first user has been promoted to `club_admin` |
| **C** | 1 | ≥1 | 0 | Anomaly: user pre-created but `members` insert failed; should self-heal on next sign-in or be operator-recovered |

Spec 009 prefixes one new state and one new transition:

| State | clubs count | users count | members count | Meaning |
|---|---|---|---|---|
| **X (new)** | 0 | 0 | 0 | Truly fresh deployment — no club row exists yet. Wizard window is open. |

**New transition X → A**: triggered by a successful `bootstrapClubAction` submit. In one transaction, holding `pg_advisory_xact_lock(1008)`:

1. Re-COUNT both tables; if either is non-zero, the precondition is violated (lost the race) — return `{ ok: false, code: 'BOOTSTRAP_ALREADY_COMPLETE' }` and roll back.
2. Insert one `clubs` row from the wizard fields.
3. Insert one empty `club_banking_profiles` row referencing #2.
4. Insert one `users` row with `emailVerified = false` from the wizard's admin email.
5. (Outside the transaction, after commit) Set `NEXT_LOCALE` cookie to the chosen `defaultLocale`; call `auth.api.signInMagicLink({ body: { email: adminEmail } })` — Better Auth's existing `sendMagicLink` callback dispatches the email via the spec 007 locale-aware mailer.

After step 5, the deployment is in **state A** (clubs=1, users=1, members=0). The magic link is in the user's inbox. When they click it, Better Auth's verify completes → `session.create.after` hook fires → `promoteFirstUserIfNeeded` (spec 008) acquires the SAME advisory lock, observes that members count is 0 AND clubs count is 1, inserts the `members` row with `role='club_admin'`, releases the lock. State transitions A → B. **No code in spec 009 implements this leg** — it is entirely spec 008's hook running unchanged.

**Race semantics**:
- **Two wizard submits, state X** → advisory lock serialises. First commits transitioning X → A. Second's recheck observes clubs count = 1, returns `BOOTSTRAP_ALREADY_COMPLETE`, rolls back. Spec acceptance scenario US2.4.
- **Wizard submit + spec 008 `requestMagicLinkAction` bootstrap pre-create, state X** — impossible by construction: spec 008's bootstrap pre-create branch fires from the sign-in form, but the proxy redirects all non-`/setup` requests away from `/sign-in` while in state X (FR-011). The pre-create branch can only run starting at state A.
- **Wizard submit, state A or B** — proxy redirects `/setup` away before the action is reached (FR-010). If the action is invoked directly (e.g., crafted POST), the in-action recheck (FR-012) returns `BOOTSTRAP_ALREADY_COMPLETE`.

## 3. Validation rules (`lib/validation/onboarding.ts`)

The `onboardingSchema` is implemented as a Zod object. Each rule cross-references the FR that mandates it.

| Field | Rule | FR | Test |
|---|---|---|---|
| `clubName` | `z.string().trim().min(1).max(120)` | FR-004 | `onboarding-schema.spec.ts` — boundary at 1, 120, 121 chars |
| `currencyCode` | `z.string().trim().transform((v) => v.toUpperCase()).pipe(z.string().regex(/^[A-Z]{3}$/))` | FR-004 | `onboarding-schema.spec.ts` — `czk` accepted, `CZ` rejected, `CZK1` rejected |
| `defaultLocale` | `z.enum(routing.locales as readonly [Locale, ...Locale[]])` | FR-004 | `onboarding-schema.spec.ts` — `cs` accepted, `en` accepted, `de` rejected |
| `adminEmail` | `z.string().trim().toLowerCase().pipe(z.email())` (same Zod 4 form as `lib/validation/auth.ts`) | FR-004 | `onboarding-schema.spec.ts` — typical valid + malformed cases |

Schema is composed from the existing `clubConfigSchema` (`lib/validation/admin-config.ts`) for the three club fields, plus the email field. Reuse avoids drift between the wizard and the post-bootstrap admin edit screen.

## 4. Foreign-key + cascade behaviour

The wizard's three inserts have these existing constraints:

- `club_banking_profiles.club_id` → `clubs.id` ON DELETE CASCADE (existing — defined in `clubs.ts`).
- `members.user_id` → `users.id` ON DELETE CASCADE (existing — Better Auth schema).
- `members.club_id` → `clubs.id` ON DELETE CASCADE (existing).

If the wizard transaction commits and the user never clicks the magic link, the deployment sits with `users=1, members=0` (state C anomaly from spec 008's table — same as if a stranger had triggered `requestMagicLinkAction` and never clicked). Spec 008's promotion path will fire when this user eventually clicks the link, even if days later. No special handling needed.

## 5. What is NOT in the data model

- No `setup_session` table to track wizard form state across page refreshes — the form is single-page and refreshes drop in-progress entries (spec US1.2 covers this explicitly: refresh shows an empty form, not an error).
- No `bootstrap_audit` row — the wizard transaction inserts what it needs; there is no separate "bootstrap happened on date X by email Y" audit row beyond the natural `clubs.created_at` + `members.acceptedInvitationAt` timestamps.
- No "pending bootstrap" sentinel — the advisory lock + sticky cache cover the state machine without a dedicated row.
