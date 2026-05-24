# Quickstart — Fresh-Install Onboarding Wizard (v1.9)

Manual smoke test that exercises the v1.9 happy path end-to-end. Mirrors how a real fresh-deploy admin (Pavel) would experience the app. Run after `/speckit-implement` completes and all seven verification gates pass.

## Prerequisites

- `docker compose up -d` has been run; the four `beeromat-*` containers are healthy (`beeromat-postgres`, `beeromat-neon-proxy`, `beeromat-neon-proxy-test`, `beeromat-mailpit`).
- `.env.local` is configured with the *infra* env vars (DATABASE_URL pointing at the local proxy, BETTER_AUTH_SECRET, SMTP_URL pointing at Mailpit, Turnstile dev keys, Upstash Redis URL + token). The `SEED_*` vars MAY be unset — v1.9 makes them optional at runtime.
- `pnpm install` has been run and is current.

## Walkthrough

### 1. Reset to true-fresh state

```powershell
pnpm db:reset       # bare wipe — no clubs row, no users row
```

Expected output: `[db:reset] Truncated N table(s) in public schema` followed by `[db:reset] DB is bare (no clubs row). Use --with-club to seed one.`

This puts the deployment in **state X** (spec 009 data-model.md). Note: do NOT use `pnpm db:reset:bootstrap` — that inserts a club and would land in state A, skipping the wizard.

### 2. Start the app

```powershell
pnpm dev
```

Wait for `Ready in NNNms`. App is on `http://localhost:3010`; Mailpit is on `http://localhost:18025`.

### 3. Hit any route → see the redirect to /setup

Open `http://localhost:3010/` in a clean browser (private window — no `NEXT_LOCALE` cookie, no Better Auth session). **Expected**: browser is redirected to `http://localhost:3010/setup` (Czech default — no locale prefix), the wizard renders in Czech.

Try `http://localhost:3010/admin/config` — also redirected to `/setup`. Try `/sign-in` — also redirected to `/setup`. The redirect-everywhere behaviour is FR-011.

### 4. Switch to English via the locale switcher

The wizard page has a small language switcher (inherited from the existing layout). Click it; verify the URL becomes `/en/setup` and every visible string flips to English. Form input values, if any were entered, are preserved across the locale switch.

### 5. Submit the wizard

Fill in:

| Field | Value |
|---|---|
| Club name | `Tenisový klub Šafařík` |
| Currency | `czk` (lowercase — schema canonicalises) |
| Default locale | `cs` |
| Admin email | `pavel@example.test` |

Click **Submit**. **Expected**: browser navigates to `/sign-in?bootstrap-sent=1` (or the equivalent confirmation copy), showing "Check your email" messaging.

### 6. Verify the DB rows

In a separate terminal:

```powershell
pnpm db:studio
```

(Or use `psql` directly against the local Postgres on port 15432 if Studio isn't preferred.) Confirm:

- `clubs` has exactly ONE row: name = `Tenisový klub Šafařík`, currency_code = `CZK` (uppercased), default_locale = `cs`.
- `club_banking_profiles` has exactly ONE row referencing that club's id, with all banking fields null.
- `"user"` (Better Auth table) has exactly ONE row: email = `pavel@example.test`, emailVerified = `false`.
- `members` has ZERO rows. The `club_admin` row gets inserted at magic-link verify time by spec 008's promotion hook — not yet.

### 7. Open the magic-link email

Visit `http://localhost:18025`. Mailpit's inbox should show one email to `pavel@example.test`:

- **Subject**: `Tvůj přihlašovací odkaz do beeromatu` (Czech — matches the chosen `defaultLocale`).
- **From**: whatever `EMAIL_FROM` is set to.
- **Body**: localized Czech magic-link template, with the sign-in link rendered as a button.

If the email is in English instead of Czech: the cookie-set step in the action did not take effect — check that `cookies().set('NEXT_LOCALE', ...)` runs BEFORE `auth.api.signInMagicLink(...)`.

### 8. Click the magic link

Click through. Expected sequence:

1. Browser navigates to `/api/auth/magic-link/verify?token=...&callbackURL=/` (Better Auth's verify endpoint).
2. Verify completes; session created; `session.create.after` databaseHook fires `promoteFirstUserIfNeeded` (spec 008). Lock acquired, members count = 0, clubs count = 1 → inserts `members` row with `role='club_admin'` for the verified user.
3. Redirect to `/` (callback URL). User lands on the home screen, signed in.

### 9. Verify post-bootstrap state

Back in the DB:

- `members` now has exactly ONE row: role = `club_admin`, user_id = the just-verified user's id, club_id = the just-created club's id, accepted_invitation_at set to verify time.

### 10. Verify /setup is now invisible (US2)

In the same authenticated browser:

- Navigate to `/setup`. **Expected**: redirected to `/` (signed-in member, regardless of role, gets sent home).

Open a fresh private window (no session):

- Navigate to `/setup`. **Expected**: redirected to `/sign-in` (anonymous post-bootstrap behaviour).

Try `/cs/setup` and `/en/setup` directly. Same redirects.

### 11. Verify /admin/config works for the new admin (spec 008 integration)

In the authenticated session:

- Navigate to `/admin/config`. **Expected**: the spec 008 admin form renders with the values you just entered in the wizard pre-filled (name = `Tenisový klub Šafařík`, currency = `CZK`, default locale = `cs`).
- Change the club name to `Tenisový klub Šafařík 1898`, click Save. Reload `/`. The header reflects the new name.

This proves the wizard → admin form continuity: what the wizard wrote is what the admin form edits, no schema mismatch.

## Failure modes worth verifying manually

### Submit with bad input

`db:reset` again to return to state X. In the wizard, submit with currency = `CZ` (2 letters). **Expected**: form re-renders with an inline error reading "Currency must be a 3-letter ISO 4217 code" (or the localised equivalent). No rows inserted. No email sent.

### Two concurrent submits

`db:reset` to state X. Open the wizard in two browser windows. Fill both with different emails. Click submit in both as close to simultaneously as you can. **Expected**: exactly one form completes; the other shows a "Looks like someone just finished setting up. Go sign in instead." friendly error.

Verify: clubs count = 1, users count = 1 (the winner's email), members count = 0 (pending magic-link click).

### Crafted POST after bootstrap

Complete the wizard normally. Then send a crafted POST to the action's URL (the action route — discoverable via DevTools while a normal submit is in flight). **Expected**: returns `{ ok: false, code: 'BOOTSTRAP_ALREADY_COMPLETE' }`. No second clubs row inserted.

## Cleanup

```powershell
pnpm db:reset:bootstrap   # back to state A — one club, no users (the state spec 008 expected at deploy time)
```

Or `pnpm db:seed` to land in state B with the admin pre-baked from SEED_* env vars (legacy path).
