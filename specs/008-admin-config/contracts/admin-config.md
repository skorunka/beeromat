# Contract: Admin Configuration + Self-Bootstrap (v1.8)

**Feature**: `008-admin-config` | **Phase**: 1 — Design

Two contracts:

1. **New** Server Action `updateClubConfig` — what the admin form invokes when saving.
2. **Extension** to the existing magic-link verify path — the self-bootstrap branch.

The existing v1.0 / v1.5 contracts (`specs/001-beer-consumption-ledger/contracts/auth.md` superseded for `requestMagicLinkAction` by `specs/006-allowlist-feedback/contracts/auth.md`) remain authoritative for everything else.

---

## 1. `SA` `updateClubConfig(input) → { ok, status }`

The admin form's save action. Loads, validates, persists, revalidates.

**Input**:

```ts
{
  name: string,                  // club name (1-120 chars, trimmed)
  currencyCode: string,          // ISO 4217 (^[A-Z]{3}$)
  defaultLocale: 'cs' | 'en',    // one of routing.locales
  banking: {
    iban?: string,               // mod-97 valid, optional
    accountHolderName?: string,  // required if iban set, optional otherwise
    revolutHandle?: string,
    defaultQrMessage?: string,
  },
}
```

The Zod schema at `lib/validation/admin-config.ts` is the authoritative shape — both the client form's resolver and the action's server-side guard use it. Cross-field rule: `banking.iban` set ⇒ `banking.accountHolderName` required (FR-009 — banking is all-or-nothing).

**Output**:

```ts
type Status = 'ok' | 'validation-failed' | 'forbidden';
type Response = { ok: true; status: Status };
```

| Status | When | Client sees |
|---|---|---|
| `ok` | The Zod parse + the DB write both succeeded. | Toast "Saved." + form re-renders with the just-saved values. |
| `validation-failed` | Zod parse rejected the input. | Per-field error messages render via FormMessage. No DB write occurred. |
| `forbidden` | Caller's session is not a `club_admin` on the active club. | The page should never render the form for a non-admin (route-guarded), so this status is a defensive seatbelt — surfacing as a generic error toast. |

**Behaviour**:

1. `requireRole('club_admin')` — returns `forbidden` if caller doesn't have it. Same enforcement helper that guards `/admin/members` (no new RBAC machinery).
2. Parse the input through the shared Zod schema. Failure → `validation-failed`.
3. Open a single Drizzle transaction:
   - `UPDATE clubs SET name, currencyCode, defaultLocale WHERE id = $ctx.club.id`
   - `INSERT INTO club_banking_profiles (...) ON CONFLICT (clubId) DO UPDATE SET ...` — upsert because a fresh club has no banking row until first save.
   - Stamp `updatedByUserId = $ctx.user.id` on the banking row.
4. `revalidatePath('/admin/config')` AND `revalidatePath('/admin')` AND `revalidatePath('/')` (the home + tab screens render the club name and money formatted in the club's currency — both must reflect the change on next visit).
5. Return `{ ok: true, status: 'ok' }`.

**FR** (from spec 008): FR-004, FR-005, FR-006, FR-007, FR-009.

**SR** (from spec 008): SR-003, SR-004.

---

## 2. Bootstrap branch — magic-link verify hook

The self-bootstrap branch lives at the moment Better Auth confirms a magic-link verification, NOT at the moment of magic-link request. Reason: only a successful round-trip (user actually owns the inbox) earns the auto-admin promotion. A bare dispatch is insufficient (the requestor might have typo'd or be a phisher).

**Hook surface**: Better Auth's magic-link plugin exposes a verification-complete callback. The exact wiring (`callbacks.after.signIn` vs an explicit `onVerify`) is determined at implementation time — they're functionally equivalent for our needs. The IMPORTANT property is that the hook runs **inside the same DB transaction as the user creation**, so the bootstrap's `SELECT count(*) FROM users FOR UPDATE` and the `INSERT INTO members ...` are atomic.

**Pre-conditions**:

- A magic-link round-trip is completing successfully (Better Auth has verified the token + identified the email + is about to create or look up the user).
- This is the v1 single-club product shape: exactly one `clubs` row exists (the seeded one). Multi-club deployments are explicitly out of scope (Out of Scope item 1).

**Transactional procedure**:

```ts
await db.transaction(async (tx) => {
  // 1. The user row that Better Auth is about to insert (or has just
  //    inserted) is the one we'll promote. Better Auth gives us the
  //    user id; we treat the existence of this user as the post-
  //    creation observable.
  const userId = /* from Better Auth callback */;

  // 2. Lock the users count — any concurrent bootstrap attempt
  //    serialises here.
  const count = await tx.execute(
    sql`SELECT count(*) AS n FROM users FOR UPDATE`
  );

  // 3. If this is the very first user (count after Better Auth's
  //    insert == 1), promote. Otherwise no-op — they're a
  //    not-on-allowlist case for the v1.5 contract's purposes.
  if (count.rows[0].n === 1) {
    const [seededClub] = await tx
      .select({ id: clubs.id })
      .from(clubs)
      .limit(1);
    if (!seededClub) {
      // pre-condition violated — no seeded club; nothing to bootstrap
      // onto. Surface in logs; let Better Auth finish normally; the
      // resulting user has no member row and gets a not-on-allowlist
      // experience on next sign-in.
      console.error('[bootstrap] no seeded club; cannot self-promote');
      return;
    }
    await tx.insert(members).values({
      clubId: seededClub.id,
      userId,
      email: /* from BA */,
      displayName: /* from BA name or local-part */,
      role: 'club_admin',
      isActive: true,
      acceptedInvitationAt: new Date(),
      createdByUserId: null,
    });
  }
});
```

**Post-conditions**:

| Pre-state | Post-state | Effect |
|---|---|---|
| users = 0, clubs = 1 (state A) | users = 1, members = 1 (state B) | New user is `club_admin` of the seeded club. Lands authenticated, can navigate to `/admin/config`. |
| users ≥ 1 (state B or C) | users incremented by 1, members unchanged | New user has NO member row. The existing v1.5 not-on-allowlist flow handles their next sign-in attempt. They're effectively a created-but-orphan user. |
| users = 0 but clubs ≠ 1 (no seeded club, or multi-seed in error) | users = 1, members = 0 | Logged warning. Same as state C — user is orphan. v1.8 does NOT auto-create a club; that's a deploy-time concern. |

**FR** (from spec 008): FR-001, FR-002, FR-003.

**SR** (from spec 008): SR-001, SR-002.

**Idempotency note**: re-running the verify hook for a user that already exists (Pavel signs in again on a new device) does NOT fire the bootstrap branch — `count(*)` returns ≥1, the branch short-circuits. Pavel's existing `members.role = 'club_admin'` row is preserved unchanged. (US1 acceptance scenario 2.)

---

## What this contract does NOT change

- The v1.5 `requestMagicLinkAction` 3-status reply (`sent` / `not-on-allowlist` / `rate-limited`) — same shape, same semantics. The bootstrap branch fires AFTER the verify, not at request time, so the request-time response is unchanged.
- The v1.0 PIN actions (`setPinAction`, `unlockDeviceAction`, `signOutDeviceAction`) — completely unaffected.
- The v1.0 `acceptInvitationAction` (the post-invite onboarding flow) — completely unaffected. Bootstrap is the empty-users self-invite; acceptInvitation is the admin-mediated invite flow. They don't overlap.
- The v1.0 magic-link route handler at `/api/auth/[...all]` — Better Auth's mount; v1.8 only adds a callback inside `lib/auth/better-auth.ts`, not new routes.
