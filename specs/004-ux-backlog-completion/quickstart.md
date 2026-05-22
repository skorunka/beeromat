# Quickstart: UX Backlog Completion (v1.3)

How to build, run, and verify v1.3. The dev/test infrastructure is unchanged
from v1–v1.2 — see `specs/002-ux-hardening/quickstart.md` for the Docker
stack (Postgres 5433, neon-proxy 14444/14445, Mailpit 11025/18025).

## Setup

```powershell
docker compose up -d            # Postgres, neon proxies, Mailpit — unchanged
pnpm install                    # no new dependencies in v1.3
pnpm dev                        # http://localhost:3000
```

v1.3 adds **no dependencies**, **no env vars**, **no migrations**.

## Verification gates

v1.3 is "done" when all seven gates pass:

```powershell
pnpm typecheck                  # tsc --noEmit
pnpm lint                       # ESLint
pnpm test                       # Vitest unit/integration
pnpm i18n:check                 # catalog parity + every t() key resolves
pnpm forms:check                # no native date/time inputs, no required/pattern
pnpm build                      # production build
pnpm exec playwright test       # E2E against the production build
```

## Manually verifying the v1.3 findings

With `pnpm dev` running and a seeded member:

**US1 — payment history (F20)**: tap the greeting on the home screen → the
account hub → **Payment history**. A member with past payments sees each one
with its amount, date, and state (pending / confirmed / disputed); a member
with none sees a friendly empty state.

**US2 — friendlier stock (F9/F10)**: `/admin/beer-types` → Restock is the
prominent action on each row. Open Adjust → it asks for a quantity and an
**Add stock / Remove stock** choice — no negative numbers. Removing more than
the current stock is rejected in-app.

**US3 — home balance (F2)**: note the home balance, log a beer, return home →
the balance has gone up. Undo the beer → it goes back down.

**US4 — sign-out (F15)**: home greeting → account hub → **Sign out** → the app
returns to the signed-out entry point; reopening a protected screen requires
signing in again.

**US5 — guidance (F16/F19)**: open the log screen for a club with no beer
types → a friendly empty state. As a member with a disputed payment, the
dispute banner offers a link to a next step, not just text.

**US6 — polish (F17/F12)**: a money-amount input shows helper text stating the
accepted format. On the bet screen, a member with transfers this session sees
a running tally of them.

## What did NOT change

- No database tables, columns, or migrations.
- No Server Action signature or return type (FR-018) — `getPaymentHistory` is
  a read query contracted in v1, implemented now; the stock-adjust action
  keeps its signed-delta contract (the form computes the sign).
- No balance, payment, stock, or bet calculation.
- No new dependencies or infrastructure.

## Definition of done

- All seven gates pass.
- Every acceptance scenario in spec.md has a passing E2E assertion (SC-008).
- The v1 UX review is fully discharged — all 15 items of §5 shipped across
  v1.1, v1.2, and v1.3 (SC-009).
