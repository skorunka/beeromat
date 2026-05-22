# Phase 0 Research: UX Backlog Completion (v1.3)

v1.3 introduces **no new libraries** and **no external integrations** — it is
presentation work over the v1 data model and the v1.2 forms layer. There is
nothing to web-verify. This document records the design decisions the plan
rests on; the spec carried no `[NEEDS CLARIFICATION]` markers.

## Decision 1 — Where payment history and sign-out live

**Decision**: Add a member **account hub** at `/account`, reached by making
the existing home-screen greeting (`Ahoj {name}`) a tappable link. The hub
holds the **sign-out** control (F15) and a link to the **payment-history**
screen at `/account/payments` (F20).

**Rationale**:
- F15 and F20 both need a home, and neither is a high-frequency *daily* flow
  (the bottom nav is for Home/Log/Tab/Bet) — an account hub is the natural
  place, and it is exactly the "More" surface the review's F14 envisaged.
- Making the greeting a link adds the hub with zero new bottom-nav slots and
  zero re-architecture of the v1.1 navigation — the lowest-risk placement.
- A member visiting `/account` already expects "things about me": their
  name, their payments, signing out.

**Alternatives considered**:
- *A new bottom-nav item* — crowds a nav already carrying role-gated entries;
  payment history doesn't earn a permanent slot.
- *Payment history as a tab on the Settle screen* — Settle is about the
  *next* payment; history is a separate concern and confirmed payments have
  left Settle entirely (that gap is the finding).

## Decision 2 — Implementing `getPaymentHistory`

**Decision**: Implement `getPaymentHistory` in the existing
`lib/db/queries/payments.ts` as a read-only query: the signed-in member's own
`payments` rows, each with its current `status`, `amountMinor`,
`currencyCode`, `origin`, `createdAt`, and — for confirmed/disputed payments —
the timestamp and (for disputes) the reason from `payment_state_transitions`.
Ordered most-recent-first. Member-scoped by `ctx.member.id`.

**Rationale**:
- The query is **already specified** in
  `specs/001-beer-consumption-ledger/contracts/payments.md` (`Q getPaymentHistory`)
  — it was never built because no v1 screen consumed it. Building it now is
  completing a contracted read path, not adding a contract (FR-018 holds).
- The contract's role rule — "any member for self" — is satisfied by scoping
  to the session's member; the treasurer/club-wide variant is out of v1.3
  scope (the member screen is the finding).
- Pagination: the contract is cursor-paginated; a ~20-member club's member
  has few payments, so v1.3 renders the first page and treats deeper
  pagination as unneeded — the query still returns an ordered page so a
  future "load more" is a pure UI addition.

**Alternatives considered**:
- *Reusing the treasurer's balances/pending queries* — those are
  treasurer-scoped and omit a member's own confirmed history; wrong shape.

## Decision 3 — Home balance refresh after a log (F2)

**Decision**: The log and undo Server Actions
(`app/[locale]/(app)/log/actions.ts`) additionally call
`revalidatePath('/')`. The home screen is a Server Component computing
`memberBalance(...)`; once the action revalidates `/`, the next render of the
home screen recomputes the balance from fresh data.

**Rationale**:
- The balance is *already* correct on the server — the bug is purely a stale
  cached render of `/` because the log action revalidates only `/log` and
  `/tab`. Adding `/` is a one-line cache-freshness fix; the balance
  *calculation* is untouched (FR-009/FR-018).
- This covers both directions (a new consumption and an undo) because both
  actions revalidate.

**Alternatives considered**:
- *Optimistic client update of the balance* — would duplicate the balance
  arithmetic on the client and risk drift; server revalidation keeps one
  source of truth.

## Decision 4 — Add/Remove stock instead of a signed delta (F9/F10)

**Decision**: The stock-adjust form collects a **positive quantity** and an
**Add-stock / Remove-stock** choice. The form computes the signed `delta`
(`remove → -quantity`, `add → +quantity`) and calls the **unchanged**
`recordStockAdjustmentAction({ beerTypeId, delta, reason })`. The shared form
schema in `lib/validation/stock.ts` changes from a signed-`delta` string to
`{ quantity: positive-int string, mode: 'add' | 'remove', reason }`.

**Rationale**:
- The Server Action's signed-delta contract and the stock arithmetic /
  audit trail stay exactly as in v1 (FR-008/FR-018) — only the *input
  affordance* changes, and the sign is computed at the form boundary.
- A non-negative-quantity field plus a two-way choice matches Standa's mental
  model ("we used 5 / we got 5") and removes the negative number entirely.
- `WOULD_GO_NEGATIVE` from the action still surfaces — for a Remove that
  over-draws — via the v1.2 `FormRootError`.

## Decision 5 — Actionable dispute banner (F19)

**Decision**: The dispute banner gains a link to the **Settle screen**, where
the member can re-initiate payment — the concrete next step after a payment
was flagged. The banner keeps its per-device dismiss. The link is a catalog
string.

**Rationale**: A flagged payment means "this didn't reconcile — pay again /
sort it out"; Settle is where a member acts on that. The banner currently
informs and dead-ends; one link turns it into guidance (FR-013).

## Decision 6 — Money-input helper text (F17 remainder)

**Decision**: Each money-amount input renders helper text stating the
accepted format, using the **`FormDescription`** primitive already built in
`components/ui/form.tsx` during v1.2. The text is a catalog string.

**Rationale**: v1.2 already added `FormDescription` (used for the IBAN hint);
reusing it gives the helper text consistent styling and `aria-describedby`
wiring for free. No new component.

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| Where payment history + sign-out are reached | `/account` hub via the home greeting (Decision 1) |
| Is `getPaymentHistory` implemented? | No — contracted in v1, never built; implemented here (Decision 2) |
| How the home balance becomes fresh | `revalidatePath('/')` in the log/undo actions (Decision 3) |
| How Add/Remove avoids a contract change | form computes the signed delta; action unchanged (Decision 4) |
| Where the dispute banner link goes | the Settle screen (Decision 5) |
| Helper-text component | the existing `FormDescription` primitive (Decision 6) |

## Sources

No external sources — v1.3 uses only the existing project stack and the v1
contracts (`specs/001-beer-consumption-ledger/contracts/payments.md`).
