# Contract: Consumption & Drink Sessions

**Feature**: `001-beer-consumption-ledger` | **Phase**: 1 — Design

Server actions and queries for logging, viewing, and voiding beer consumption, plus opening/closing drink sessions.

---

## `SA` `logBeer({ beerTypeId }) → { consumptionId, sessionId, balanceAfterMinor }`

The flagship daily action.

**Input**:
```ts
z.object({ beerTypeId: z.string().uuid() });
```

**Output**:
```ts
{
  consumptionId: string,
  sessionId: string,             // the session this consumption was logged into
  balanceAfterMinor: bigint,     // member's running session balance after this insert
}
```

**Behaviour** (single transaction):
1. `requireMember()` → resolve `clubId`, `memberId`, `userId`.
2. Verify `beer_types.id = beerTypeId` AND `club_id = clubId` AND `is_archived = false`. Else `BEER_NOT_AVAILABLE`.
3. Find or auto-open `drink_sessions` for the club:
   - `SELECT … WHERE club_id = $1 AND ended_at IS NULL` — if found, use it.
   - Else `INSERT INTO drink_sessions (club_id, started_at, opened_by_user_id, title)` with title = today's date in club's default locale.
4. Atomically decrement stock:
   ```sql
   UPDATE beer_types SET current_stock = current_stock - 1
     WHERE id = $beerTypeId AND current_stock > 0
     RETURNING current_stock;
   ```
   0 rows → `OUT_OF_STOCK`.
5. Insert `stock_changes` row (`kind = 'consumption_decrement'`, `delta = -1`).
6. Insert `consumptions` row with `unit_price_minor_snapshot = beer_types.unit_price_minor`.
7. Compute and return new session balance for this member.

**Errors**: `BEER_NOT_AVAILABLE` (404 semantic), `OUT_OF_STOCK` (409), `RATE_LIMITED` (defensive — same beer 3× in 10s might be a double-tap).

**Role**: any `member` (and above). FR-010.

**Related FR**: FR-014, FR-015, FR-016, FR-026, FR-027.

---

## `SA` `voidConsumption({ consumptionId, reason? }) → { ok, balanceAfterMinor }`

Reverses a previously-logged consumption.

**Input**:
```ts
z.object({
  consumptionId: z.string().uuid(),
  reason: z.string().max(500).optional(),
});
```

**Output**: `{ ok: true, balanceAfterMinor }`.

**Behaviour** (single transaction):
1. `requireMember()` + load consumption row (must match club).
2. Determine permission:
   - If `now() - consumption.created_at <= club.consumption_undo_window_seconds` AND requesting user is the original logger → allowed.
   - Else require role in `('stock_manager', 'treasurer', 'club_admin')` (FR-017).
   - Else `FORBIDDEN`.
3. Verify no existing `consumption_voids.consumption_id = consumptionId`. If exists → `ALREADY_VOIDED`.
4. Insert `consumption_voids` row.
5. Increment stock atomically; insert `stock_changes` (`kind = 'consumption_void_increment'`, `delta = +1`).
6. Recompute member balance and return.

**Errors**: `FORBIDDEN`, `ALREADY_VOIDED`, `NOT_FOUND`.

**Role**: original logger (within window) OR stock_manager / treasurer / club_admin (after window).

**Related FR**: FR-017, FR-018, FR-024.

---

## `SA` `endCurrentSession({ sessionId }) → { ok }`

Closes the currently-open drink session.

**Input**: `z.object({ sessionId: z.string().uuid() })`.

**Output**: `{ ok: true }`.

**Behaviour**:
1. `requireRole('treasurer', 'club_admin')`.
2. `UPDATE drink_sessions SET ended_at = now(), closed_by_user_id = $userId WHERE id = $sessionId AND club_id = $clubId AND ended_at IS NULL`. 0 rows → `SESSION_NOT_OPEN`.

**Errors**: `FORBIDDEN`, `SESSION_NOT_OPEN`.

**Role**: treasurer or club_admin. FR-012, FR-019.

---

## `SA` `openNewSession({ title? }) → { sessionId }`

Explicitly opens a new drink session. Optional — the auto-open path in `logBeer` covers the common case.

**Input**:
```ts
z.object({ title: z.string().max(200).optional() });
```

**Output**: `{ sessionId: string }`.

**Behaviour**:
1. `requireRole('treasurer', 'club_admin', 'stock_manager', 'member')` — any member can open if none is open (auto-open path).
2. Verify no currently-open session for the club (uniqueness constraint enforces this at DB layer too).
3. Insert `drink_sessions` row.

**Errors**: `SESSION_ALREADY_OPEN`.

---

## `Q` `getCurrentOpenSession() → SessionWithBeerTypes | null`

The log-screen primary data fetch. Returns the open session (or null) plus the beer-type catalog with current stock.

```ts
{
  session: { id, title, startedAt } | null,
  beerTypes: Array<{
    id, name, unitPriceMinor: bigint, currentStock,
    lowStockThreshold, isLowStock: boolean, displayOrder,
  }>,
}
```

Single SELECT with a subquery for `beer_types` ordered by `display_order`.

**Role**: any member.

---

## `Q` `getMyTabForCurrentSession() → MemberTab`

The "my tab" view.

```ts
{
  session: { id, title, startedAt } | null,   // null if no open session
  entries: Array<{
    id,
    kind: 'consumption' | 'transfer_in' | 'transfer_out',
    beerTypeName: string,
    unitPriceMinor: bigint,
    createdAt,
    canUndo: boolean,                          // true if within window AND user is the logger
    voided: boolean,
  }>,
  totalMinor: bigint,                           // effective consumption total for this session
}
```

**Role**: any member (their own data).

**Performance**: single query joining `consumptions`, `consumption_voids`, `bet_transfers` (both directions), `beer_types`. With ~20 consumptions per session per member, sub-millisecond at v1 scale.

---

## `Q` `getSessionHistory({ memberId?, limit, cursor? }) → SessionHistoryPage`

The "history" view (User Story 8, P3).

```ts
{
  sessions: Array<{
    id, title, startedAt, endedAt,
    myTotalMinor: bigint,          // effective total for the requesting (or specified) member
    paidStatus: 'unsettled' | 'partial' | 'settled',
  }>,
  nextCursor: string | null,
}
```

`memberId` defaults to the requesting member; treasurers/admins may pass another member's id.

**Role**: any member for self; treasurer/admin for others.

---

## `Q` `getSessionDetail({ sessionId, memberId? }) → SessionDetail`

Drill-down into a specific past session (User Story 8, scenario 2).

```ts
{
  session: { id, title, startedAt, endedAt, openedBy, closedBy },
  entries: Array<{ /* same shape as MemberTab.entries */ }>,
  totalMinor: bigint,
  paidStatus: 'unsettled' | 'partial' | 'settled',
}
```

**Role**: any member for self; treasurer/admin for others.
