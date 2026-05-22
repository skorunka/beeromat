# Data Model: UX Backlog Completion (v1.3)

## Database & domain entities — NO CHANGE

v1.3 adds **no tables, no columns, no migrations, no domain entities**. The v1
data model (`specs/001-beer-consumption-ledger/data-model.md`) and every
Server Action contract are unchanged (FR-018). This feature is presentation
plus one read query over existing tables.

## Read model — `getPaymentHistory`

The one new code-level "model" is the shape of the `getPaymentHistory` read
query (contracted in `specs/001-beer-consumption-ledger/contracts/payments.md`,
implemented in v1.3 — see research.md Decision 2). It reads existing tables
and persists nothing.

### Source tables (unchanged)

- **`payments`** — `id`, `clubId`, `memberId`, `amountMinor`, `currencyCode`,
  `status` (`claimed` | `confirmed` | `disputed`), `origin`
  (`member_initiated` | `treasurer_initiated`), `variableSymbol`, `note`,
  `createdAt`.
- **`payment_state_transitions`** — `paymentId`, `fromStatus`, `toStatus`,
  `reason`, `createdByUserId`, `createdAt`. Gives the *when* and *why* of a
  confirmation or dispute.

### Returned shape (per the member-history screen, US1)

A page of the signed-in member's own payments, **most-recent-first**:

| Field | Source | Used for |
|-------|--------|----------|
| `id` | `payments.id` | row key |
| `amountMinor` | `payments.amountMinor` (serialised string at the client boundary) | the amount, formatted via `Intl` |
| `currencyCode` | `payments.currencyCode` | money formatting |
| `status` | `payments.status` | the state badge — pending (`claimed`) / confirmed / disputed |
| `origin` | `payments.origin` | distinguishes a treasurer-recorded payment |
| `createdAt` | `payments.createdAt` | the payment date |
| `resolvedAt` | latest `payment_state_transitions.createdAt` for a `confirmed`/`disputed` transition | "confirmed on …" / "flagged on …" |
| `disputeReason` | `payment_state_transitions.reason` of the `disputed` transition | shown on a disputed row |

### Query rules

- **Scope**: `payments.memberId = ctx.member.id` AND `payments.clubId =
  ctx.club.id` — a member sees only their own payments (FR-003).
- **Order**: `createdAt` descending.
- **Pagination**: the contract is cursor-paginated; v1.3 renders the first
  page (a ~20-member club's member has few payments). The query still returns
  an ordered, limited page so a future "load more" is a pure UI addition.
- **No writes, no state transitions** — read-only.

## UI state (no persistence)

| Surface | State | Owner |
|---------|-------|-------|
| Stock-adjust form | `quantity` (string), `mode` (`add` \| `remove`), `reason` — the form computes the signed `delta` for the unchanged action | react-hook-form, client memory (see research.md Decision 4) |
| Dispute banner | dismissed-ids set | unchanged — `localStorage`, per device |
| Home balance | recomputed server-side after `revalidatePath('/')` | Server Component; no client state |

No persisted state changes anywhere in v1.3.
