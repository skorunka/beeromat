# Quickstart: Admin Configuration + Self-Bootstrap (v1.8)

**Feature**: `008-admin-config` | **Phase**: 1 — Design

How to drive the feature end-to-end against a freshly migrated test
database. Useful for manual verification during T-final exercise and
as the human-readable test plan that `/speckit-tasks` translates into
the actual E2E spec.

## Pre-requisites

- Docker stack up (`/dev` skill or `docker compose up -d`). The
  beeromat-postgres, beeromat-neon-proxy(-test), beeromat-mailpit
  containers must all be healthy.
- The constitutional version pinning: TypeScript 6.0.x, Node 24
  LTS, vitest 4, vite 8, Next 16 — i.e. the post-v1.7 dep-sweep
  state.

## Scenario A — Self-bootstrap on a fresh deployment (US1)

Demonstrates a deploy + sign-in-once = you're the admin.

1. **Wipe the dev DB and re-seed only the club** (not the admin).
   Use `pnpm db:seed` with `SEED_ADMIN_EMAIL` *unset* so the seed
   script creates the club but no user:

   ```powershell
   # Temporarily unset the admin seed; PowerShell:
   $env:SEED_ADMIN_EMAIL = ''
   pnpm db:seed
   ```

   Confirm state A: `users = 0`, `clubs = 1`.

   ```powershell
   docker exec beeromat-postgres psql -U beeromat -d beeromat -c \
     "SELECT count(*) FROM users; SELECT count(*) FROM clubs;"
   ```

2. **Start the dev server** via the `/dev` slash command (or
   `pnpm dev` + manual Mailpit check).

3. **Submit any email at `/sign-in`** — e.g. `you@example.com`.
   Open Mailpit at http://localhost:18025, click the magic-link.

4. **Verify state B**:

   ```powershell
   docker exec beeromat-postgres psql -U beeromat -d beeromat -c \
     "SELECT u.email, m.role FROM users u JOIN members m ON m.user_id = u.id;"
   ```

   Should show one row: `you@example.com | club_admin`.

5. **Confirm the bootstrap is one-shot**: sign out, submit a
   different email (e.g. `stranger@example.test`). The v1.5
   not-on-allowlist screen should render. No new admin row in
   `members`.

## Scenario B — Admin edits club config from the UI (US2)

Demonstrates the v1.8 admin section. Starts from state B (Pavel
bootstrapped per Scenario A).

1. **Navigate to `/admin/config`** as the just-bootstrapped admin.
   The form pre-fills with the seeded values: club name "Test
   Club" (or whatever `SEED_CLUB_NAME` set), currency CZK, default
   locale cs.

2. **Rename the club**: type "TK Slávia Praha" into the name field
   and save.

   ```powershell
   docker exec beeromat-postgres psql -U beeromat -d beeromat -c \
     "SELECT name FROM clubs;"
   ```

   Should now read `TK Slávia Praha`.

3. **Verify propagation to a member-facing screen**: navigate to the
   home (`/`). The club name should appear as "TK Slávia Praha" in
   any header / branding spot that reads it.

4. **Change the currency to EUR**: edit the currency field, save.
   The FR-008 confirmation prompt should appear, stating that
   future amounts will display in EUR and past amounts stay in CZK.
   Confirm.

5. **Verify currency propagation**: navigate to `/tab` or a money-
   display screen. New amounts should render with EUR / € via the
   existing `Intl.NumberFormat` chain.

6. **Set up the banking profile**: enter a valid Czech IBAN
   (e.g. `CZ65 0800 0000 1920 0014 5399`), account holder name, an
   optional Revolut handle, and the optional default QR message.
   Save.

   ```powershell
   docker exec beeromat-postgres psql -U beeromat -d beeromat -c \
     "SELECT iban, account_holder_name, revolut_handle, default_qr_message FROM club_banking_profiles;"
   ```

   Should show the just-entered values, and `updated_by_user_id`
   should be the admin's id.

7. **Verify settle-up integration**: navigate to a member's settle
   screen. The QR code should render with the new IBAN; the
   "paid another way" copy should be unchanged.

## Scenario C — Validation + RBAC checks

1. **Validation error**: in the admin config form, try to enter a
   malformed IBAN (e.g. `INVALID-IBAN`). Save. In-app, locale-aware
   error message renders via `FormMessage`. No DB write.

2. **Currency must be ISO 4217**: type `EURO` (4 chars) in the
   currency field. The Zod regex `^[A-Z]{3}$` rejects; in-app error.

3. **Non-admin attempted access**: as a `member` (not `club_admin`),
   navigate directly to `/admin/config`. Should redirect away (the
   existing `requireRole('club_admin')` enforcement). Bypass the
   redirect by hitting `updateClubConfig` server-side with a stolen
   request — action returns `{ ok: true, status: 'forbidden' }`,
   nothing is written.

## Scenario D — Bootstrap race (Edge Case)

Hard to reproduce by hand; covered by the unit test at
`tests/unit/bootstrap-rule.spec.ts`. The transactional
`SELECT count(*) ... FOR UPDATE` guarantees: of two simultaneous
sign-in completions against an empty `users` table, exactly one
gets the `club_admin` member row. The second user is created (by
Better Auth) but has no member row — they hit the v1.5 not-on-
allowlist screen on their next sign-in attempt.

## How to clean back to state A

The dev DB doesn't expose a UI for un-bootstrapping. To re-test from
scratch:

```powershell
docker exec beeromat-postgres psql -U beeromat -d beeromat -c \
  "TRUNCATE users, members, account, session, verification CASCADE;"
```

(This leaves the `clubs` + `club_banking_profiles` rows intact —
which is exactly state A.)
