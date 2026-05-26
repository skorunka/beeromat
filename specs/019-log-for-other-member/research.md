# Research — Log a beer on behalf of another member

Phase 0 output for spec 019. Three implementation-design
decisions captured below.

## Decision 1 — Track "reviewed" state via column, not link table

**Decision**: Add a nullable timestamp column
`consumptions.on_behalf_reviewed_at`. Null = unreviewed (banner
will surface). Non-null = dismissed (banner no longer surfaces).

**Rationale**:
- 1-to-1 relationship between consumption and review state —
  natural fit for a column, not a link table.
- Single query reads both the consumption and its review state.
- A void on the consumption indirectly satisfies "no longer
  needs reviewing" (banner query excludes voided consumptions
  anyway); the column is purely for the explicit "keep" dismiss.
- Schema migration is one ALTER TABLE — trivial.

**Alternatives considered**:
- Separate `consumption_acks(consumption_id, acked_at,
  acked_by_user_id)` table. Rejected — adds a join for every
  banner query without giving us anything (the only "acker" is
  the consumer themselves; logger is already on
  `created_by_user_id`).
- Just use the existing `consumption_voids` for both "reviewed
  + accepted" and "reviewed + rejected". Rejected — conflates
  two distinct states (Standa keeps the beer because he WAS
  there vs. Standa voids the beer because he WASN'T) into the
  same datum.

## Decision 2 — Separate `logBeerOnBehalfAction`

**Decision**: New server action `logBeerOnBehalfAction({
beerTypeId, targetMemberId })` distinct from the existing
`logBeerAction({ beerTypeId })`. The two share an internal
helper for the actual insert + stock decrement + audit row.

**Rationale**:
- Validation surface differs: `logBeerOnBehalfAction` validates
  that `targetMemberId !== ctx.member.id` AND that the target is
  an active member of the same club AND that the actor has
  permission to log on others' behalf. `logBeerAction` doesn't.
- Authz boundary clarity: future role changes (e.g., "only
  treasurer can log on behalf") apply to one action, not the
  other.
- Easier to test the on-behalf-specific edge cases in isolation
  (separate integration spec file).
- Type-safety: separate Result types make it impossible to
  accidentally return `{ ok: true, balanceAfterMinor }` from the
  on-behalf action (the actor's balance didn't change — the
  target's did). Spec-019 result returns `{ ok: true,
  consumptionId, targetMemberId, targetBalanceAfterMinor }`.

**Alternatives considered**:
- Extend `logBeerAction` with optional `targetMemberId`.
  Rejected — see above; the actions diverge in too many small
  ways to share a signature cleanly.
- Single action with a discriminated input type. Rejected — same
  reason; the consuming UI would still need two code paths
  upstream.

## Decision 3 — `/tab` query: extend existing helper

**Decision**: Extend `getMyTabForSession` in
`lib/db/queries/consumption.ts` to also emit `transfer_in` and
`transfer_out` entries from `bet_transfers`. The function's
`MemberTabEntry.kind` discriminator was always designed for
this (the v1 implementation deliberately only emitted
`'consumption'` — the comment in the existing code says
"transfers will be added alongside US6").

**Rationale**:
- The discriminator already exists. We're filling in the
  already-designed shape.
- One query path is easier to reason about than two — pagination
  / ordering / total all come from the same place.
- The bet-transfer join already exists in the spec-018 follow-up
  query (T025); this extension generalises it.

**Alternatives considered**:
- New `getTabTransfers` helper called separately + merged in the
  page. Rejected — splits the ordering + totaling concern into
  two layers (helper + page). Single query that does the right
  thing is simpler.
- Surface transfers ONLY for the LOSER (`to_member_id = $1`),
  not the WINNER's outgoing. Rejected — the winner does have
  outgoing transfers when their consumption was transferred away
  via a bet; surfacing them as `transfer_out` makes the math
  visible (consumption -50 + transfer_out +50 = net 0). Standa
  reads line items and the math should add up to the displayed
  total.

## Cross-cutting confirmations

- **Constitution v1.10.0 Principle VIII**: integration +
  component layers carry this spec. Unit layer N/A (no
  pure-function logic). E2E N/A (no new multi-system seam;
  reuses `requireUnlocked` + the existing void path).
- **No new dependencies**: all libs already present.
- **No constitution bumps**: Tech Stack table unaffected.
- **One schema migration**: `consumptions.on_behalf_reviewed_at`
  nullable timestamp. Idempotent. Reversible by dropping the
  column (no data loss for existing rows since they're all
  self-logged and the column would always be null for them).
