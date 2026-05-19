# Contract: Bet Transfers

**Feature**: `001-beer-consumption-ledger` | **Phase**: 1 — Design

Server actions and queries for inter-member bet settlement (US 6, P2).

---

## `SA` `createBetTransfer({ sourceConsumptionId }) → { betTransferId, balanceAfterMinor }`

The loser of the bet transfers a winner's consumption onto themselves.

**Input**:
```ts
z.object({ sourceConsumptionId: z.string().uuid() });
```

**Output**:
```ts
{
  betTransferId: string,
  balanceAfterMinor: bigint,         // requesting member's new session balance
}
```

**Behaviour** (transaction):
1. `requireMember()` → resolve `clubId`, `memberId` (= the loser, `to_member_id`), `userId`.
2. Load `consumptions` row by id, scoped to `clubId`. If not found → `NOT_FOUND`.
3. **FR-020 scope check**: the source consumption MUST belong to a `drink_session` where `ended_at IS NULL` (currently open). Else `OUT_OF_SCOPE`.
4. Verify the source consumption is not already transferred:
   - `SELECT 1 FROM bet_transfers bt LEFT JOIN bet_transfer_voids btv ON bt.id = btv.bet_transfer_id WHERE bt.source_consumption_id = $1 AND btv.id IS NULL` — if row exists → `ALREADY_TRANSFERRED`.
5. Verify the source consumption belongs to a different member: `source.member_id != requester.member_id`. Else `SELF_TRANSFER`.
6. Insert `bet_transfers`:
   - `source_consumption_id = $sourceConsumptionId`
   - `from_member_id = source.member_id` (winner)
   - `to_member_id = requester.member_id` (loser)
   - `created_by_user_id = $userId`
7. Recompute balance.

**Errors**: `NOT_FOUND`, `OUT_OF_SCOPE`, `ALREADY_TRANSFERRED`, `SELF_TRANSFER`.

**Role**: any member (their own data). Either side of a bet may initiate, but the loser is the typical actor.

**Related FR**: FR-020, FR-021, FR-022, FR-024.

**UX note**: The pick list in the UI must filter consumptions to:
- Belong to the currently open session AND
- Be owned by some OTHER member AND
- Not already transferred (i.e., no active `bet_transfers` row pointing at them).

The list is rendered by the query below.

---

## `SA` `voidBetTransfer({ betTransferId, reason? }) → { ok, balanceAfterMinor }`

Reverses an existing bet transfer. Permission gates per FR-023: original logger of the transfer OR treasurer/admin.

**Input**:
```ts
z.object({
  betTransferId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
```

**Output**: `{ ok: true, balanceAfterMinor }`.

**Behaviour** (transaction):
1. `requireMember()`.
2. Load `bet_transfers` row, scope to `clubId`. Else `NOT_FOUND`.
3. Permission:
   - If `requester.userId == bet_transfer.created_by_user_id` → allowed.
   - Else `requireRole('treasurer', 'club_admin')`. Else `FORBIDDEN`.
4. Verify not already voided: `SELECT 1 FROM bet_transfer_voids WHERE bet_transfer_id = $1`. Else `ALREADY_VOIDED`.
5. Insert `bet_transfer_voids` row.
6. Recompute balance.

**Errors**: `NOT_FOUND`, `FORBIDDEN`, `ALREADY_VOIDED`.

**Related FR**: FR-023.

---

## `Q` `getTransferableConsumptionsForCurrentSession() → TransferableConsumption[]`

Powers the bet-transfer pick list.

```ts
type TransferableConsumption = {
  consumptionId: string,
  beerTypeName: string,
  unitPriceMinor: bigint,
  ownerMemberId: string,
  ownerDisplayName: string,
  loggedAt: Date,
};
```

**Behaviour**: SELECT from `consumptions` joined to `drink_sessions` (open), `members`, `beer_types`, LEFT JOIN `bet_transfers` LEFT JOIN `bet_transfer_voids`, WHERE no active transfer exists AND `member_id != requester.memberId` AND `ended_at IS NULL`.

**Role**: any member.

**Performance**: a single SQL with at most ~30 rows at v1 scale. Negligible.

---

## `Q` `getBetTransfersForSession({ sessionId, memberId? }) → BetTransferRow[]`

Audit view for a session's bets.

```ts
type BetTransferRow = {
  id: string,
  sourceConsumptionId: string,
  fromMemberName: string,         // winner
  toMemberName: string,           // loser
  beerTypeName: string,
  unitPriceMinorSnapshot: bigint,
  createdAt: Date,
  createdByUserId: string,
  voided: boolean,
  voidedAt: Date | null,
  voidedByUserId: string | null,
  voidReason: string | null,
};
```

Used in:
- Session history detail (US 8 scenario 3).
- "My history" filter for transfers in/out.

**Role**: any member for sessions they participated in; treasurer/admin for any.
