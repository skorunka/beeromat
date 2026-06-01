# Contract: Recreate Last Match

## Query: `lastAgreementForMember(clubId, memberId)`

**Location**: `lib/db/queries/match-agreements.ts`

**Signature**:
```text
lastAgreementForMember(clubId: string, memberId: string): Promise<OpenAgreementSummary | null>
```

**Behaviour**:
- Returns the single most-recently-created (`created_at` desc) `match_agreements` row in `clubId` for which `memberId` appears in `match_agreement_sides`, assembled into the `OpenAgreementSummary` shape (sides grouped A/B with seats + display names).
- State-agnostic: open, recorded, and cancelled agreements are all eligible.
- Returns `null` when the member participates in no agreement in the club.
- Scoped to `clubId` — never returns another club's agreement.

**Integration test cases**:
1. Returns the member's most recent agreement when several exist (ordering by createdAt).
2. Returns a RECORDED agreement if it is the member's latest (state-agnostic).
3. Returns a CANCELLED agreement if it is the member's latest (Q4).
4. Excludes agreements the member is NOT a participant in (returns an older one they ARE in, or null).
5. Per-club scoping: another club's newer agreement does not shadow this club's result.
6. Returns null when the member has no agreements.

## Server Action: `recreateLastMatchAction()`

**Location**: `app/[locale]/(app)/match/actions.ts`

**Signature**:
```text
recreateLastMatchAction(): Promise<RecreateLastMatchResult>

type RecreateLastMatchResult =
  | { ok: true; agreementId: string }
  | { ok: false; code: 'NO_LAST_MATCH' }
  | { ok: false; code: 'STALE_PARTICIPANT'; memberName: string | null }
  | { ok: false; code: 'DUPLICATE_MEMBER' }       // inherited from createAgreementTx
  | { ok: false; code: 'MEMBER_NOT_IN_CLUB' }     // inherited from createAgreementTx
```

**Behaviour**:
1. `requireUnlocked()` — same session gate as `createAgreementAction`. Takes **no input** (server re-resolves the source).
2. Resolve `lastAgreementForMember(ctx.club.id, ctx.member.id)`. If null → `{ ok: false, code: 'NO_LAST_MATCH' }`.
3. Active-participant guard: if any source participant is no longer an active club member → `{ ok: false, code: 'STALE_PARTICIPANT', memberName }` (the offending name when resolvable), create nothing.
4. Map the source into `CreateAgreementInput` and call `createAgreementTx` (inherits members-in-club + duplicate-member guards → those error codes propagate).
5. On success: `revalidatePath('/match')` and return `{ ok: true, agreementId }`. The client navigates to `/match/{agreementId}`.

**Integration test cases**:
1. Happy clone — SINGLES: new OPEN agreement with the same 2 players + forBeer; returns its id.
2. Happy clone — DOUBLES: new OPEN agreement with the same 4 seats + pairingKind + forBeer.
3. Cancelled source clones fine (Q4).
4. `NO_LAST_MATCH` when the member has no prior agreement.
5. `STALE_PARTICIPANT` when a source participant is now inactive — no agreement created.
6. Per-club scoping: action only ever clones the acting member's own-club last match.

## Component: `RecreateLastMatchButton`

**Location**: `components/match/recreate-last-match-button.tsx`

**Props**: `{ sideA: string; sideB: string }` (pre-joined side labels from the server).

**Behaviour**:
- Renders a labelled control: "Recreate: {sideA} vs {sideB}".
- On tap: calls `recreateLastMatchAction()`; on `ok` → toast success + `router.push('/match/{agreementId}')`; on `STALE_PARTICIPANT` → error toast naming the member; on any other error → generic error toast.
- Disabled + pending state while the action is in flight.

**Component test cases**:
1. Renders the matchup label from props.
2. Tap dispatches the action and navigates on success.
3. `STALE_PARTICIPANT` result surfaces an error toast (no navigation).
4. Generic failure surfaces a generic error toast.

## Hub wiring: `/match` page

- Server-resolves `lastAgreementForMember`. When non-null, renders `RecreateLastMatchButton` (with `joinSideNames`-built labels) at the top of the hub, above the Upcoming list. When null, renders nothing extra.

## i18n keys (cs + en)

- `match.recreate.cta` — "Recreate: {sideA} vs {sideB}" / "Zopakovat: {sideA} vs {sideB}"
- `match.recreate.staleParticipant` — error when a participant left the club.
- `match.recreate.failed` — generic failure.
- `match.recreate.created` — success toast.
