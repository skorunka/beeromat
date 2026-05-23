# Data Model: Admin Configuration + Self-Bootstrap (v1.8)

**Feature**: `008-admin-config` | **Phase**: 1 — Design

v1.8 reads/writes two existing entities (`clubs` and
`club_banking_profiles`). **No new entity. No migration needed** —
verified against `lib/db/schema/clubs.ts`: every column the admin
form needs already exists in the v1 schema. The bootstrap branch
writes one new row into the existing `members` table.

## 1. Entities edited via `/admin/config`

### `clubs` (existing)

The single tenant row. Three columns become user-editable in v1.8;
the rest stay system-managed.

| Column | Type | v1.8 user-editable? | Notes |
|---|---|---|---|
| `id` | uuid PK | no | seed-time only |
| `name` | text NOT NULL | **YES** | admin renames "Test Club" → "TK Slávia Praha" |
| `currencyCode` | varchar(3) NOT NULL, default 'CZK' | **YES** | ISO 4217. Change triggers the FR-008 warning. |
| `defaultLocale` | varchar(8) NOT NULL, default 'cs-CZ' | **YES** | One of `routing.locales` (normalised — see §3). |
| `defaultLowStockThreshold` | integer NOT NULL default 5 | no (v1.8) | Belongs to a future stock-management surface. |
| `consumptionUndoWindowSeconds` | integer NOT NULL default 300 | no | System policy. |
| `deviceInactivityLockSeconds` | integer NOT NULL default 28800 | no | System policy. |
| `createdAt` / `updatedAt` | timestamp | no | `updatedAt` auto-updates via `$onUpdate(() => sql\`now()\`)` on every write. |

### `club_banking_profiles` (existing)

One row per club. Composite primary key on `clubId` so insertion is
idempotent — the admin form does an UPSERT (`onConflictDoUpdate`)
which means a first-time save on a fresh deployment creates the row;
subsequent saves update it.

| Column | Type | v1.8 user-editable? | Notes |
|---|---|---|---|
| `clubId` | uuid PK FK → clubs.id | no | derived from session |
| `iban` | text NULLABLE | **YES** | RFC 7064 / mod-97 validation in the Zod schema (existing `validIban` helper). |
| `accountHolderName` | text NULLABLE | **YES** | Required if `iban` is set (FR-009 — banking is all-or-nothing). |
| `revolutHandle` | text NULLABLE | **YES** | Free-text handle (e.g. `@frantisek`). |
| `defaultQrMessage` | text NULLABLE | **YES** *(opportunistic)* | The default "message for recipient" baked into generated QR codes. The spec hedged "possibly banking profile fields" — exposing this is in-spirit since the QR-display screen uses it. |
| `nextVariableSymbol` | bigint NOT NULL default 1 | no | System counter, not user policy. |
| `updatedAt` / `updatedByUserId` | timestamp + uuid | no | Auto-stamped by the action on every save. |

### `members` (existing — written by the bootstrap branch only)

The bootstrap inserts ONE row, on the seeded club, with `role =
'club_admin'`, for the first user that completes the magic-link
round-trip when the `users` table is empty.

```ts
{
  clubId: <the single seeded club's id>,
  userId: <newly-created user's id, returned by Better Auth>,
  email: <the verified email>,
  displayName: <derived — name from Better Auth user or local-part of email>,
  role: 'club_admin',
  isActive: true,
  acceptedInvitationAt: new Date(),
  createdByUserId: null,  // self-bootstrap has no inviter
}
```

After this row exists, subsequent unknown-email sign-in attempts fall
through to the existing v1.5 `not-on-allowlist` behaviour. The
bootstrap branch never fires again until/unless `users` is emptied
(which only happens via direct DB intervention or a fresh deploy).

## 2. Bootstrap state machine

Three states, gated on `count(*) FROM users` and the `clubs` row:

```
                ┌─────────────────────────┐
                │ state A — fresh deploy  │
                │ users = 0, clubs = 1    │
                └────────────┬────────────┘
                             │ (1) first email submitted
                             │     + Turnstile passed
                             │     + rate limit OK
                             │     + magic link sent
                             │     + magic link verified
                             ▼
        ┌──────────────────────────────────────┐
        │ TRANSACTION (single PG transaction): │
        │  - select count(*) from users        │
        │    for update                        │
        │  - IF count = 0:                     │
        │      insert user (Better Auth)       │
        │      insert members row              │
        │       (role=club_admin)              │
        │      → state B                       │
        │  - ELSE (race lost):                 │
        │      insert user (Better Auth)       │
        │      do NOT insert members row       │
        │      → state C (not-on-allowlist)    │
        └──────────────────┬───────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        ▼                                     ▼
┌────────────────────┐               ┌─────────────────────┐
│ state B            │               │ state C             │
│ admin bootstrapped │               │ subsequent unknown  │
│ users ≥ 1          │               │ users ≥ 1 (someone  │
│                    │               │ else got in first)  │
└────────────────────┘               └─────────────────────┘
       │                                      │
       │ subsequent unknown-email sign-in     │
       └─────────────► state C ◄──────────────┘
                       (v1.5 not-on-allowlist)
```

**Key invariants**:

- **Idempotency on second sign-in**: Pavel signs in again on a new device after bootstrap. His `users` row exists, his `members.role = 'club_admin'` row exists. The bootstrap branch's count check returns ≥1, so the branch does NOT fire. His existing rows are preserved unchanged. (US1 acceptance scenario 2.)
- **Race safety**: two emails submitted in the same second when `users = 0`. The `SELECT count(*) ... FOR UPDATE` (PostgreSQL's row-level lock acquired during the bootstrap transaction) serialises the two requests. Whichever transaction commits first reaches state B; the second sees `count ≥ 1` and reaches state C. Exactly one `club_admin` member row is created. (US1 acceptance scenario 3 / spec §Edge Cases.)
- **State A is irreversible by user action** — there's no UI affordance to delete the `users` table. Once any user has bootstrapped, no other user can backdoor into state A via the form.

## 3. Validation rules (Zod schema)

Lives at `lib/validation/admin-config.ts`. Shared between the
client form (react-hook-form resolver) and the server action input
guard — same schema, both sides.

| Field | Zod rule | Notes |
|---|---|---|
| `name` | `string().trim().min(1).max(120)` | Club name. 120 chars is the upper bound based on typical club-name length. |
| `currencyCode` | `string().regex(/^[A-Z]{3}$/)` | ISO 4217. Server side may additionally validate against a known-codes list, but the regex is sufficient for v1.8. |
| `defaultLocale` | `enum([...routing.locales])` | Strict subset — `'cs'` or `'en'` only. Stored as the bare code; the existing `defaultLocale` column accepts the bare code (the seed's `'cs-CZ'` is the legacy form — v1.8 stores bare). |
| `banking.iban` | `string().refine(validIban).optional()` | Reuses the existing `validIban` helper from `lib/iban.ts` (mod-97 check). |
| `banking.accountHolderName` | `string().trim().min(1).max(120)` IF `banking.iban` is set, else `.optional()` | Cross-field rule — banking is all-or-nothing (FR-009). |
| `banking.revolutHandle` | `string().trim().min(2).max(64).optional()` | Free-text, no `@` prefix enforced (a future polish could). |
| `banking.defaultQrMessage` | `string().trim().min(1).max(140).optional()` | 140 = typical bank-statement memo cap. |

All validation errors render in-app, locale-aware, via the v1.2 forms
layer (`FormMessage`) — no native HTML5 popups. The constitution's
`forms:check` gate catches any regression.
