# Contract: Payments

**Feature**: `001-beer-consumption-ledger` | **Phase**: 1 — Design

Server actions and queries for member self-pay (QR Platba), claim recording, treasurer confirmation/dispute, treasurer manual recording, and voiding.

Status machine recap:

```
claimed ──[treasurer confirm]──▶ confirmed ──[treasurer void]──▶ voided
   │
   └─[treasurer dispute]──▶ disputed
```

Treasurer-initiated payments are created directly in `confirmed`.

---

## `Q` `getMyBalance() → { balanceMinor, pendingConfirmationMinor, currencyCode }`

Member dashboard fetch. Used on the home screen and the settle screen.

```ts
{
  balanceMinor: bigint,                  // outstanding (excluding claimed)
  pendingConfirmationMinor: bigint,      // sum of own claimed payments
  currencyCode: string,
}
```

**Calculation**:
- `balanceMinor` = `sum(effective consumption) - sum(payments where status='confirmed')` — what the member still owes after confirmed payments.
- `pendingConfirmationMinor` = `sum(payments where status='claimed' AND member=me)` — what the member has claimed but not yet confirmed.

Display: "You owe **125.00 Kč** (pending confirmation: 52.00 Kč)" if both are non-zero.

**Role**: any member (own data).

**Related FR**: FR-031.

---

## `SA` `initiateSettle() → { settle: SettleInstructions | null }`

The "Pay my tab" entry point. Generates payment instructions without yet creating a claim.

**Input**: none.

**Output**:
```ts
| { settle: {
      amountMinor: bigint,
      currencyCode: string,
      variableSymbol: bigint,
      spaydPayload: string,             // the SPAYD/SPD string for QR rendering
      qrSvg: string,                    // pre-rendered SVG markup of the QR
      revolutUrl: string | null,        // e.g. "https://revolut.me/foo/52.00CZK"
      messageText: string,              // human-readable MSG (e.g. "beeromat Pavel")
    }
  }
| { settle: null, reason: 'NO_BALANCE' | 'BANKING_NOT_CONFIGURED' | 'CLAIM_PENDING' }
```

**Behaviour**:
1. `requireMember()` + `requireUnlocked()`.
2. Compute current balance. If zero → `{ settle: null, reason: 'NO_BALANCE' }`.
3. Check `payments WHERE member_id = me AND status = 'claimed'`. If any exists → `{ settle: null, reason: 'CLAIM_PENDING' }` (FR-032 edge case: one pending claim at a time).
4. Load `club_banking_profiles` for the club. If `iban IS NULL` → `{ settle: null, reason: 'BANKING_NOT_CONFIGURED' }` (FR-038).
5. Allocate the next variable symbol: `UPDATE club_banking_profiles SET next_variable_symbol = next_variable_symbol + 1 RETURNING next_variable_symbol - 1` (atomic).
6. Build SPAYD string: `buildSpaydString({ iban, amount, currencyCode, variableSymbol, message: "beeromat " + displayName })`.
7. Render QR SVG via `qrcode` package, error correction level `M`.
8. If `revolut_handle` is set, build `https://revolut.me/<handle>/<amount>CZK` (or just the handle URL if amount-prefill not possible for that currency).
9. Return the payload. **No DB row in `payments` yet** — that happens on `confirmTransferMade`.

**Errors**: `NO_BALANCE`, `BANKING_NOT_CONFIGURED`, `CLAIM_PENDING` (returned as `reason`, not thrown).

**Role**: member (own data).

**Related FR**: FR-032, FR-038.

---

## `SA` `confirmTransferMade({ variableSymbol, note? }) → { paymentId }`

After the member completes the transfer in their banking app, this Server Action records the claim.

**Input**:
```ts
z.object({
  variableSymbol: z.bigint().positive(),
  note: z.string().max(500).optional(),
});
```

**Output**: `{ paymentId: string }`.

**Behaviour** (transaction):
1. `requireMember()`.
2. Verify the variable symbol was generated for **this** member's most recent `initiateSettle` (compare against `club_banking_profiles.next_variable_symbol - 1` and a small server-side cache of recent allocations — or recompute by re-reading balance + comparing). Reject `INVALID_VS` if mismatched.
3. Compute current balance again. Reject `BALANCE_CHANGED` if balance ≠ amount allocated to this VS (member added a consumption between Initiate and Confirm).
4. Insert `payments` row:
   ```
   status = 'claimed', origin = 'member_initiated',
   amount_minor = currentBalance,
   variable_symbol = variableSymbol,
   note = note,
   created_by_user_id = me,
   member_id = my_member_id,
   ```
5. Insert `payment_state_transitions` row with `from_status = NULL, to_status = 'claimed'`.

**Errors**: `INVALID_VS`, `BALANCE_CHANGED`, `CLAIM_PENDING` (another claim already pending).

**Role**: member (own data). FR-033.

---

## `SA` `markPaidOtherMethod({ amountMinor, note }) → { paymentId }`

Member's "I paid in cash / by direct Revolut" path — no QR generated.

**Input**:
```ts
z.object({
  amountMinor: z.bigint().positive(),
  note: z.string().min(1).max(500),       // mandatory — describes the method
});
```

**Output**: `{ paymentId: string }`.

**Behaviour**: Like `confirmTransferMade` but without the VS check and without requiring an `initiateSettle` first. Status = `claimed`.

**Errors**: `INVALID_AMOUNT` (≤ 0 or > balance).

**Role**: member (own data). FR-032 (scenario 5).

---

## `SA` `confirmPayment({ paymentId }) → { ok }`

Treasurer: single-tap confirmation of a claimed payment. **One tap, no form, no dialog** (SC-007a).

**Input**: `z.object({ paymentId: z.string().uuid() })`.

**Output**: `{ ok: true }`.

**Behaviour** (transaction):
1. `requireRole('treasurer', 'club_admin')`.
2. Load `payments` row scoped to the club. Verify `status = 'claimed'`. Else `INVALID_STATE`.
3. `UPDATE payments SET status = 'confirmed' WHERE id = $1`.
4. Insert `payment_state_transitions` (`from = 'claimed'`, `to = 'confirmed'`, `created_by_user_id = $treasurerId`).

**Errors**: `INVALID_STATE`, `FORBIDDEN`.

**Role**: treasurer or club_admin. FR-034.

---

## `SA` `bulkConfirmPayments({ paymentIds }) → { confirmed: string[], skipped: { paymentId, reason }[] }`

Bulk variant. Selection + one tap = ≤ N+1 taps (SC-007a).

**Input**:
```ts
z.object({ paymentIds: z.array(z.string().uuid()).min(1).max(100) });
```

**Output**:
```ts
{
  confirmed: string[],            // ids successfully transitioned
  skipped:   Array<{ paymentId: string, reason: 'INVALID_STATE' | 'NOT_FOUND' }>,
}
```

**Behaviour**: same per-row logic as `confirmPayment`, in one transaction. Failures don't abort the batch.

**Role**: treasurer or club_admin. FR-034 (c).

---

## `SA` `disputePayment({ paymentId, reason }) → { ok }`

Treasurer rejects a claim that doesn't match the bank statement.

**Input**:
```ts
z.object({
  paymentId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});
```

**Output**: `{ ok: true }`.

**Behaviour**:
1. `requireRole('treasurer', 'club_admin')`.
2. Verify `status = 'claimed'`. Else `INVALID_STATE`.
3. `UPDATE payments SET status = 'disputed'`.
4. Insert `payment_state_transitions` with reason. Balance is restored automatically (only `confirmed` payments count).
5. Schedule in-app notification to the member (handled lazily on next visit; FR-034 (b)).

**Role**: treasurer or club_admin. FR-034.

---

## `SA` `voidConfirmedPayment({ paymentId, reason }) → { ok }`

Reverses a previously confirmed payment.

**Input**:
```ts
z.object({
  paymentId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});
```

**Output**: `{ ok: true }`.

**Behaviour**: `UPDATE payments SET status = 'voided'` + state transition row. Balance restored.

**Errors**: `INVALID_STATE` if status ≠ `confirmed`.

**Role**: treasurer or club_admin. FR-036.

---

## `SA` `recordManualPayment({ memberId, amountMinor, note? }) → { paymentId }`

Treasurer escalation path (US 4). Skips the `claimed` state.

**Input**:
```ts
z.object({
  memberId: z.string().uuid(),
  amountMinor: z.bigint().positive(),
  note: z.string().max(500).optional(),
});
```

**Output**: `{ paymentId: string }`.

**Behaviour**:
1. `requireRole('treasurer', 'club_admin')`.
2. Insert `payments` row with `status = 'confirmed'`, `origin = 'treasurer_initiated'`, `variable_symbol = NULL`.
3. Insert `payment_state_transitions` (`from = NULL`, `to = 'confirmed'`).

**Role**: treasurer or club_admin. FR-035.

---

## `Q` `getPendingClaimsForTreasurer() → PendingClaim[]`

Treasurer dashboard data fetch.

```ts
type PendingClaim = {
  paymentId: string,
  memberId: string,
  memberDisplayName: string,
  amountMinor: bigint,
  currencyCode: string,
  variableSymbol: bigint | null,
  note: string | null,
  createdAt: Date,                  // when member tapped "I paid"
};
```

Default sort: `created_at` DESC (most recent claim first).

**Filters supported** (URL query params): `?from=2026-05-01&to=2026-05-31&memberId=...&minAmount=...&maxAmount=...`.

**Role**: treasurer or club_admin. FR-034 (c).

---

## `Q` `getAllMemberBalances() → MemberBalance[]`

Treasurer's all-members view.

```ts
type MemberBalance = {
  memberId: string,
  displayName: string,
  isActive: boolean,
  balanceMinor: bigint,
  pendingConfirmationMinor: bigint,
};
```

Default sort: `balanceMinor` DESC (biggest debtors first). FR-032 scenario.

**Role**: treasurer or club_admin.

---

## `Q` `getPaymentHistory({ memberId?, limit, cursor? }) → PaymentHistoryPage`

Audit timeline for a member or club-wide. Shows every state transition (creation, confirmation, dispute, void) with actor and timestamp.

**Role**: any member for self; treasurer/admin for any member or club-wide.
