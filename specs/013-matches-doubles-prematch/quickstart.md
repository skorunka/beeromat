# Quickstart: Doubles + Pre-Match Agreement (v1.13)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This guide walks through verifying the v1.13 feature manually
after `/speckit-implement` lands the code. It's the test plan a
human (or a fresh-pair-of-eyes review) follows to confirm the
spec's Acceptance Scenarios behave as described.

---

## Prerequisites

- Local docker stack up: `pnpm docker:up` (postgres, neon
  proxies, mailpit healthy — see `docker-compose.yml`).
- Dev DB migrations applied: `pnpm db:migrate`.
- Dev DB seeded with **at least 4 active members** in one club:
  `pnpm db:reset:bootstrap` then sign in as the bootstrap admin
  and invite 3 more from `/admin/members`. Or use
  `pnpm db:seed` if a richer seed script lands first.
- Dev server: `/dev` skill (or `pnpm dev`) on port 3010.
- Mailpit UI: http://localhost:18025 (for any invite-flow emails).

---

## US1 — Doubles for beer, full loop (P1, headline)

### Setup

- Sign in as **Member A**. Make sure Members B, C, D are active.

### Steps

1. Tap **Match** in the bottom nav → lands on `/match` hub.
2. Confirm the **Upcoming** zone says "No matches scheduled" (empty
   state). Tap **New match**.
3. Confirm the format selector defaults to **Doubles**.
4. Assign players: side A seat 1 = A, side A seat 2 = B; side B
   seat 1 = C, side B seat 2 = D.
5. Toggle **For beer** to YES (should be visually distinct from
   the OFF state).
6. Pick a pairing: tap **straight** (A1↔B1, A2↔B2). The
   submission CTA stays disabled until a pairing is chosen
   (Q4 clarification).
7. Tap **Create**. Confirm:
   - Toast: "Match scheduled — A+B vs C+D" (or equivalent).
   - Redirected to `/match/[agreementId]` showing the lineup
     + a "Record result" CTA visible to you (you're a participant).
   - Browser back → `/match` now lists the agreement in **Upcoming**.

### Record result

1. From `/match` hub, tap the upcoming agreement row.
2. Tap **Side B won**.
3. Confirm:
   - Toast: "Side B won — 2 beers transferred" (or equivalent,
     localised).
   - The Upcoming list no longer shows this agreement.
   - On home page (`/`), Member C's tab shows -1 beer (Pavel paid
     Standa); Member D's tab shows -1 (Tereza paid Karel). Sign in
     as A and confirm their tab shows +1 (owes Standa).
   - **Undo** affordance is visible in the toast for 5 minutes.

### Verify undo

1. Within 5 minutes, tap **Undo**.
2. Confirm:
   - Toast: "Result reversed".
   - The agreement returns to **Upcoming**.
   - All bet transfers are voided (tabs return to pre-record state).

### Spec mapping

- Acceptance Scenarios 1, 2, 3 of US1.
- FRs exercised: 001, 002, 003, 005, 006, 007, 008, 010, 015, 015a.

---

## US2 — Singles via the agreement flow (P2)

### Setup

- Sign in as **Member A**. Member B exists.

### Steps

1. `/match` → **New match**.
2. Toggle format to **Singles**. Confirm the lineup collapses to
   2 seats (A1 and B1 only); the pairing toggle is hidden.
3. Assign: A1 = Member A; B1 = Member B. For beer = YES.
4. Create. Lands on `/match/[agreementId]`.
5. Tap **Side A won**.
6. Confirm:
   - 1 beer-debt entry (B owes A).
   - Match history (visit `/history` or whichever route 012
     established) shows 1 match row with the agreement_id back-pointer.

### Sunset verification

1. Browse the source tree (or check the `/match` page): confirm
   the legacy 012 one-step quick-log UI is GONE. No second form
   on `/match`, no `/match/log` route, no legacy `MatchForm.tsx`
   import.
2. Confirm the underlying `matches` schema still accepts NULL
   `agreement_id` (run `SELECT COUNT(*) FROM matches WHERE
   agreement_id IS NULL` in a psql connection — historical 012
   rows survive).

### Spec mapping

- Acceptance Scenarios 1, 2 of US2.
- FRs exercised: 001, 004, 005, 007, 008, 017.

---

## US3 — Non-beer match (P2)

### Steps

1. Create an agreement (singles or doubles) with **For beer =
   NO** at create time.
2. Record the winning side.
3. Confirm:
   - No toast about beer transfers.
   - The agreement is visually marked as "friendly / not for beer"
     in history.
   - Zero `bet_transfers` rows were created for this agreement.
     Verify via `psql`:
     ```sql
     SELECT COUNT(*) FROM match_bet_transfers
     WHERE match_id IN (SELECT id FROM matches WHERE agreement_id = '<this-agreement>');
     -- expect: 0
     ```

### Spec mapping

- Acceptance Scenario 1 of US3.
- FR exercised: 009.

---

## US4 — Edit / cancel an open agreement (P3)

### Edit

1. Create a doubles agreement.
2. Before recording any result, return to `/match/[agreementId]`.
   Tap **Edit**.
3. Swap Member B for Member E in side A seat 2. Toggle pairing
   from straight to crossed. Save.
4. Confirm:
   - Toast: "Updated".
   - Lineup reflects the swap.
   - Agreement remains in OPEN state (still in Upcoming).

### Cancel

1. From the same agreement view, tap **Cancel match**.
2. Confirm:
   - Toast: "Cancelled".
   - Agreement disappears from Upcoming.
   - No `matches` row was ever inserted (verify via `psql`).

### Edit-after-record block

1. Create + record a new agreement.
2. Within the 5-min window (so undo is available), try to access
   `/match/[agreementId]/edit` directly.
3. Confirm: rejection / 4xx response, or UI says "Reverse the
   result first to edit" with a button.

### Spec mapping

- Acceptance Scenarios 1, 2, 3 of US4.
- FRs exercised: 011, 012, 013.

---

## Edge cases (quick sanity sweep)

| Edge case (from spec) | How to verify |
|---|---|
| Same member on both sides | Try to create with Member A on both A1 and B1. Submit MUST fail with `DUPLICATE_MEMBER`. |
| Concurrent result recording | Open the same agreement in two browser tabs (different sessions ok). Record from one tab. Switch to the other and try to record. Second submission MUST fail with `ALREADY_RECORDED` showing the first recorder's name + relative time. |
| Non-participant record attempt | Create an agreement with members A+B (singles). Sign in as Member C (not a participant, not treasurer). Visit `/match/[agreementId]`. Confirm the "Record result" CTA is hidden. If C is a treasurer, the CTA is visible (override path). |
| Undo after 5 min | Record a result, wait > 5 min, try undo. MUST reject with `UNDO_WINDOW_EXPIRED`. |
| Deactivated participant | Create an agreement involving Member D. From `/admin/members`, deactivate D. Try to record the result as Member A (still active). Recording MUST succeed; D's historical member_id is preserved on the matches row. |

---

## Gates the implementation must pass

The constitution mandates these all pass on the 013 merge commit:

1. `pnpm typecheck` — zero TS errors
2. `pnpm lint` — zero ESLint errors
3. `pnpm test:unit` — every Vitest test green; agreement-tx +
   schema specs new in 013
4. `pnpm build` — `next build` succeeds
5. `pnpm test:e2e` — `tests/e2e/match-agreement.spec.ts` covers
   every Acceptance Scenario above
6. `pnpm i18n:check` — every new string lives in cs.json + en.json
7. `pnpm forms:check` — no native `required` / `pattern` / date
   input in the new forms

Plus a **lockfile-sync** check (constitution VII): `pnpm install`
leaves no diff in `pnpm-lock.yaml`.
