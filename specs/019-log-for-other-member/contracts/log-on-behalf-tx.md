# Contract — `logBeerOnBehalfAction` + `dismissOnBehalfReviewAction`

## logBeerOnBehalfAction — input

```ts
{
  beerTypeId: string;        // UUID, validated as belonging to active club + non-archived + in-stock
  targetMemberId: string;    // UUID, validated as active member of active club + not the actor
}
```

Validation (Zod + action-level):
- `beerTypeId`: UUID; belongs to `ctx.club.id`; `is_archived = false`; `current_stock > 0`.
- `targetMemberId`: UUID; belongs to `ctx.club.id` as `is_active = true`; `<> ctx.member.id`.

## logBeerOnBehalfAction — output

```ts
| { ok: true; consumptionId: string; targetMemberId: string; }
| { ok: false; code: 'NOT_FOUND' }
| { ok: false; code: 'TARGET_NOT_IN_CLUB' }
| { ok: false; code: 'TARGET_IS_SELF' }
| { ok: false; code: 'BEER_NOT_AVAILABLE' }    // mirrors logBeerAction
| { ok: false; code: 'OUT_OF_STOCK' }
```

Note: success does NOT include the actor's `balanceAfterMinor`
because the actor's balance didn't change. The TARGET's balance
changed; the actor doesn't see it.

## Transaction body

1. Validate inputs (Zod + action-level checks as above).
2. Get-or-auto-open the active drink session for the club
   (reuse existing `getOrCreateOpenSession` from spec 016/017).
3. Insert `consumptions`:
   - `club_id = ctx.club.id`
   - `member_id = targetMemberId`
   - `created_by_user_id = ctx.user.id`  ← the actor (key diff from logBeerAction)
   - `drink_session_id = session.id`
   - `beer_type_id = input.beerTypeId`
   - `unit_price_minor_snapshot = beer.unit_price_minor`
4. Decrement `beer_types.current_stock` by 1 (reuse `logBeerAction`'s
   internals if extracted into a helper, otherwise inline).
5. Insert `stock_changes` audit row (`kind = 'consumption_decrement'`).
6. Revalidate `/tab` for the target (if Next.js supports
   per-user revalidation — likely just `revalidatePath('/tab',
   'layout')` for the current actor and trust the target's next
   load).
7. Return `{ ok: true, consumptionId, targetMemberId }`.

A failure at any step rolls back the transaction.

## dismissOnBehalfReviewAction — input/output

```ts
input: { consumptionId: string }
output:
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_AUTHORIZED' | 'ALREADY_REVIEWED' }
```

Authz: the row's `member_id` must resolve to a member whose
`user_id == ctx.user.id`. Anyone else gets `NOT_AUTHORIZED`.
Already-reviewed (non-null `on_behalf_reviewed_at`) returns
`ALREADY_REVIEWED` — idempotent in spirit (no error to the
user) but the action surface tracks it for telemetry.

## Reject path

Reject reuses the existing `voidConsumptionAction({
consumptionId })`. No new server action. The home banner's
"Vrátit" button calls `voidConsumptionAction` directly + then
`dismissOnBehalfReviewAction` (in any order — they don't
conflict). Two action calls = small extra latency but the
existing void action is the audit-trail-correct path and we
don't want to fork it.

## Permissions matrix

| Actor role | Can log on behalf? | Can dismiss own banner? | Can reject (void) on-behalf log? |
|-----------|---|---|---|
| member | Yes | Yes (their own) | Yes (own consumption; existing voidConsumptionAction authz) |
| stock_manager | Yes | Yes | Yes + can void any consumption (existing override) |
| treasurer | Yes | Yes | Yes + can void any consumption |
| club_admin | Yes | Yes | Yes + can void any consumption |

No role gate on `logBeerOnBehalfAction` — every member can log
on behalf of every other active member (the trust model is
small-club + visible audit trail).
