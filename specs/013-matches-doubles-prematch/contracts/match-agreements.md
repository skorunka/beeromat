# Contract: Match Agreement Server Actions (v1.13)

**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data Model**: [../data-model.md](../data-model.md)

The interfaces below are the Next.js Server Actions exposed from
`app/[locale]/(app)/match/actions.ts`. They form the
client-to-server contract for v1.13.

Conventions:

- All actions are async server functions; clients call them
  through `react-hook-form`'s submit handlers or via
  `useTransition` for non-form interactions.
- All inputs are validated with Zod schemas living in
  `lib/validation/match-agreement.ts`. Server-side validation is
  authoritative; client-side validation (same schema via
  `@hookform/resolvers/zod`) is for UX.
- All actions return a discriminated union `{ ok: true, ... } |
  { ok: false, code: '...', ... }`. No exceptions cross the
  client boundary — every error case has a typed code.
- All actions call `requireUnlocked()` first to ensure session +
  PIN + tenant scope.

---

## `createAgreementAction(rawInput): Promise<CreateAgreementResult>`

Creates a new pre-match agreement in OPEN state.

### Input (Zod-validated)

```ts
{
  format: 'singles' | 'doubles',
  forBeer: boolean,
  sides: {
    A: { seat1: string /* member_id */, seat2?: string /* required for doubles */ },
    B: { seat1: string /* member_id */, seat2?: string /* required for doubles */ },
  },
  pairingKind?: 'straight' | 'crossed', // required for doubles, omitted for singles
}
```

### Output

```ts
type CreateAgreementResult =
  | { ok: true; agreementId: string }
  | { ok: false; code: 'VALIDATION_FAILED'; fieldErrors: Record<string, string[]> }
  | { ok: false; code: 'DUPLICATE_MEMBER' }       // FR-014
  | { ok: false; code: 'MEMBER_NOT_IN_CLUB' }     // tenant scope violation
  | { ok: false; code: 'PAIRING_REQUIRED_FOR_DOUBLES' }
  | { ok: false; code: 'PAIRING_NOT_ALLOWED_FOR_SINGLES' };
```

### Side effects

- Inserts 1 row in `match_agreements` + 2 or 4 rows in
  `match_agreement_sides` under one DB transaction.
- Revalidates `/match` route cache.

### Authorization

Any signed-in club member (FR-001 unchanged by clarifications).

---

## `editAgreementAction(rawInput): Promise<EditAgreementResult>`

Edits an OPEN agreement's lineup, pairing, or for-beer flag.

### Input

```ts
{
  agreementId: string,
  // Any subset of these may be present; omitted fields stay as-is.
  forBeer?: boolean,
  sides?: { A: {...}, B: {...} },   // same shape as createAgreementAction
  pairingKind?: 'straight' | 'crossed',
}
```

### Output

```ts
type EditAgreementResult =
  | { ok: true }
  | { ok: false; code: 'VALIDATION_FAILED'; fieldErrors: Record<string, string[]> }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'NOT_EDITABLE' }    // FR-013 — already recorded
  | { ok: false; code: 'DUPLICATE_MEMBER' }
  | { ok: false; code: 'MEMBER_NOT_IN_CLUB' };
```

### Side effects

- UPDATEs the `match_agreements` row + replaces the
  `match_agreement_sides` rows (DELETE + INSERT under one tx) if
  the lineup changed. Append-only principle V is respected
  because the agreement has not yet transitioned past OPEN —
  there's no historical record to preserve.
- Revalidates `/match` and `/match/[agreementId]`.

### Authorization

Any signed-in club member (FR-011).

---

## `cancelAgreementAction(rawInput): Promise<CancelAgreementResult>`

Cancels an OPEN agreement before any result is recorded.

### Input

```ts
{ agreementId: string }
```

### Output

```ts
type CancelAgreementResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'NOT_CANCELLABLE' };  // already RECORDED or already CANCELLED
```

### Side effects

- Sets `cancelled_at = now()` + `cancelled_by_user_id` on the
  agreement row. `match_agreement_sides` rows are kept (audit
  trail of who was assigned).
- Revalidates `/match`.

### Authorization

Any signed-in club member (FR-012).

---

## `recordResultAction(rawInput): Promise<RecordResultResult>`

Records the winning side and (when `for_beer = true`) auto-fires
the bet-transfer pipeline.

### Input

```ts
{
  agreementId: string,
  winningSide: 'A' | 'B',
}
```

### Output

```ts
type RecordResultResult =
  | {
      ok: true;
      matchRowIds: string[];           // 1 for singles, 2 for doubles
      transferredCount: number;        // sum of beers transferred (0 for for_beer=false)
      requestedCount: number;          // sum of beers requested (0 for for_beer=false)
    }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'NOT_AUTHORIZED' }      // FR-007 — not a participant, not treasurer
  | { ok: false; code: 'ALREADY_RECORDED'; recordedAt: Date; recorderDisplayName: string }
  | { ok: false; code: 'CANCELLED' };
```

### Side effects

- Under one transaction:
  - Inserts 1 (singles) or 2 (doubles) rows into `matches`, each
    with `agreement_id = input.agreementId`.
  - If `for_beer = true`: for each match row, runs the existing
    012 best-effort transfer (winner's eligible consumptions →
    `bet_transfers` + `match_bet_transfers` link).
  - Sets `result_recorded_at = now()` +
    `result_recorded_by_user_id` on the agreement.
- Uses the optimistic-concurrency UPDATE filter from research R8:
  `WHERE agreement_id = ? AND result_recorded_at IS NULL AND
  cancelled_at IS NULL`. Zero affected rows → returns
  `ALREADY_RECORDED` or `CANCELLED` depending on which condition
  failed.
- Revalidates `/match`, `/match/[agreementId]`, `/` (home shows
  tab balances).

### Authorization

Match participants (any of the 2 in singles, 4 in doubles) OR
members with role ≥ `treasurer` (FR-007 + Q2 clarification).

### Performance

End-to-end < 2 s P95 per SC-002. Local benchmark target: < 300 ms
for the DB write portion against the test proxy.

---

## `reverseResultAction(rawInput): Promise<ReverseResultResult>`

Undoes a recently recorded result. Restricted to the 5-minute
window.

### Input

```ts
{ agreementId: string }
```

### Output

```ts
type ReverseResultResult =
  | { ok: true; voidedTransferCount: number; voidedMatchCount: number }
  | { ok: false; code: 'NOT_FOUND' }
  | { ok: false; code: 'NOT_AUTHORIZED' }       // same actor set as record
  | { ok: false; code: 'NOT_RECORDED' }         // never had a result
  | { ok: false; code: 'UNDO_WINDOW_EXPIRED' }; // > 5 min since record
```

### Side effects

- Under one transaction:
  - Soft-voids every linked `matches` row (sets `voidedAt` +
    `voidedByUserId`).
  - For each match row, writes `bet_transfer_voids` for every
    non-voided linked `bet_transfer` (existing 012 `voidMatchTx`
    logic).
  - Stamps `reversed_at = now()` + `reversed_by_user_id` on the
    agreement and nulls `result_recorded_at` so the agreement
    returns to OPEN state.
- Revalidates `/match`, `/match/[agreementId]`, `/`.

### Authorization

Same as `recordResultAction` (FR-010).

---

## Read-side queries (server components)

These are not Server Actions but pure read helpers used by
server components. They live in
`lib/db/queries/match-agreements.ts`.

### `listOpenAgreements(clubId): Promise<OpenAgreement[]>`

Drives the UpcomingAgreementsList. Returns agreements WHERE
`result_recorded_at IS NULL AND cancelled_at IS NULL`, ordered
`created_at DESC`. Each row includes:

```ts
{
  id: string;
  format: 'singles' | 'doubles';
  forBeer: boolean;
  pairingKind: 'straight' | 'crossed' | null;
  createdAt: Date;
  sides: {
    A: { displayName: string; memberId: string; seat: 1 | 2 }[];
    B: { displayName: string; memberId: string; seat: 1 | 2 }[];
  };
}
```

### `getAgreement(agreementId, clubId): Promise<Agreement | null>`

Drives `/match/[agreementId]/page.tsx`. Returns the full
agreement with sides, recorded result (if any), reversal state,
and a flag for whether the viewer can record (computed
participant + role check).

```ts
{
  ...OpenAgreement,
  recordedAt: Date | null;
  reversedAt: Date | null;
  cancelledAt: Date | null;
  winningSide: 'A' | 'B' | null;
  viewerCanRecord: boolean;     // R3 authorization check
  viewerIsParticipant: boolean; // used to render "your match" hint
}
```

---

## Error code reference (i18n keys)

Every typed error code has a matching catalog key under
`match.errors.*` in `messages/cs.json` + `messages/en.json`. The
client renders the catalog string in a `sonner` toast. Key list
(to be added in implementation):

| Code | Catalog key |
|---|---|
| `VALIDATION_FAILED` | per-field; `match.errors.<field>.<rule>` |
| `DUPLICATE_MEMBER` | `match.errors.duplicateMember` |
| `MEMBER_NOT_IN_CLUB` | `match.errors.memberNotInClub` |
| `PAIRING_REQUIRED_FOR_DOUBLES` | `match.errors.pairingRequired` |
| `PAIRING_NOT_ALLOWED_FOR_SINGLES` | `match.errors.pairingNotAllowed` |
| `NOT_FOUND` | `match.errors.notFound` |
| `NOT_EDITABLE` | `match.errors.notEditable` |
| `NOT_CANCELLABLE` | `match.errors.notCancellable` |
| `NOT_AUTHORIZED` | `match.errors.notAuthorized` |
| `ALREADY_RECORDED` | `match.errors.alreadyRecorded` (interpolated with recorder name + relative time) |
| `CANCELLED` | `match.errors.cancelled` |
| `NOT_RECORDED` | `match.errors.notRecorded` |
| `UNDO_WINDOW_EXPIRED` | `match.errors.undoWindowExpired` (reuses 012 string) |
