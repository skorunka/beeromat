# Research: Doubles + Pre-Match Agreement (v1.13)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This phase resolves the remaining design decisions left open after
`/speckit-clarify`. The big five (data-model shape, recorder
authorization, hub location, pairing UX, legacy sunset) are already
locked by the spec's Clarifications section; this document tackles
the implementation-level questions that bubbled up during planning.

---

## R1 — How to encode the doubles pairing in the schema

**Decision**: a single `pairing_kind` enum on `match_agreements`,
values `straight` (A1↔B1, A2↔B2) and `crossed` (A1↔B2, A2↔B1).
NULL for singles agreements.

**Rationale**: with 2 vs 2, the bijection between sides A and B
has exactly 2 possible shapes — there's no benefit to a more
general representation. Compact storage, trivial constraint
(`pairing_kind IS NOT NULL` iff `format = 'doubles'`), trivial
UI rendering (a single 2-option radio / toggle that the user must
explicitly pick per the Q4 clarification). Settlement code reads
one column and resolves both pairings.

**Alternatives considered**:

- *Per-side `paired_to_seat` column on `match_agreement_sides`*.
  Doubles the constraint surface (must enforce mutual-consistency
  between A and B rows), no benefit at 2v2 since the only choice
  is straight or crossed.
- *Separate `match_doubles_pairings` table* with `(agreement_id,
  a_seat, b_seat)` rows. Maximum expressiveness — but again,
  zero practical benefit at 2v2 (would only earn its keep at
  3v3 or larger, which is explicitly out of scope per the spec's
  "Out of Scope" section).

---

## R2 — How to compute settlement at result-record time

**Decision**: a single transactional helper `recordResultTx` that,
given an agreement_id + winning_side + recording user, performs
the full chain: insert N `matches` rows (1 for singles, 2 for
doubles), insert N `betTransfer` rows + `matchBetTransfer` links
via the existing 012 best-effort pipeline (when for_beer = yes),
and stamp `result_recorded_at` + `result_recorded_by_user_id` on
the agreement. All under one DB transaction.

**Rationale**: the constitution's append-only ledger principle
(V) demands atomicity — partial state where the agreement is
recorded but transfers missing (or vice versa) is the
multi-failure-mode bug class we explicitly avoid. The existing
012 `logMatchTx` already wraps consumption→bet-transfer in one
transaction; the 013 helper just spans one more insert (the
second matches row for doubles) inside the same boundary.

**Alternatives considered**:

- *Two-step orchestration* (record result, then queue a
  background settlement job). Would let the result land before
  settlement completes — but introduces job infrastructure on
  the free tier (out of scope) and gives the user a confusing
  "result saved, but no debts yet, check back in a minute" UX.
- *Loop over pairings in application code, one tx per pairing*.
  Splits the doubles match across 2 transactions; if the second
  fails the first commits → inconsistent. Rejected.

---

## R3 — How the result-record action authorizes the caller

**Decision**: action-layer guard that loads the agreement +
joined `match_agreement_sides`, checks whether
`ctx.member.id` is in the participants set, and falls back to
`roleSatisfies(ctx.member.role, 'treasurer')` if not. UI hides
the "Record result" CTA when the predicate fails (server-rendered
based on the same check) — defence in depth, not relying on the
UI alone.

**Rationale**: matches the Q2 clarification and the project's
existing pattern (`lib/permissions/index.ts`'s `roleSatisfies` +
`requireRole`). No new abstractions; participants list is a
trivial JOIN query.

**Alternatives considered**:

- *Middleware-level guard*. Overkill for one route — the action
  is the natural boundary because it already loads the agreement.
- *Database-level RLS*. Neon supports it but the project doesn't
  use it elsewhere; introducing it for one feature breaks the
  prevailing "auth at the action layer" convention.

---

## R4 — Where to place the agreement-format toggle in the create UI

**Decision**: a 2-option toggle at the top of the
NewMatchAgreementForm — visually the first decision the user
makes — defaulting to doubles per FR-002. Switching to singles
collapses the lineup section from 4 seats to 2 and hides the
pairing toggle (only doubles uses it).

**Rationale**: doubles being the club default (Wednesday-night
regular) means the happy path is zero interaction with the toggle.
Singles users tap once to switch. Conditional form sections are
already used in the codebase (e.g., `BeerTypeForm`'s
buy-price-vs-margin radio per spec 011).

**Alternatives considered**:

- *Separate routes* `/match/new?format=singles` vs `?format=doubles`.
  Discoverability cost (two URLs to remember); browser-back
  semantics confusing if the user toggles mid-form.
- *Default to singles* (the format 012 shipped). Contradicts
  the explicit user statement that doubles is the default.

---

## R5 — How to surface "your matches that need a result"

**Decision**: server-component `UpcomingAgreementsList` queries
`match_agreements` for the club WHERE `result_recorded_at IS NULL`,
ordered `created_at DESC`. Each row renders a small card with the
matchup, format chip, "for beer" chip (if yes), and a "Record
result" CTA visible iff the predicate from R3 passes for the
viewer. Empty state shows "No matches scheduled — tap below to
start one."

**Rationale**: matches the FR-015 + FR-015a spec wording.
Server-component approach avoids client-side state for what is
fundamentally a read.

**Alternatives considered**:

- *Filter "your matches" only*. Spec says "all open agreements
  for the member's club" — Standa might want to see whose match
  hasn't been settled yet for social pressure. Keep the full list.
- *Push notifications when an agreement is created*. Out of scope
  per Assumptions ("No notifications: members open the app").

---

## R6 — Migration strategy for the existing 012 schema

**Decision**: single Drizzle migration (auto-generated then
hand-reviewed) that:

1. Creates two new enums: `match_format` ('singles' | 'doubles'),
   `match_pairing_kind` ('straight' | 'crossed').
2. Creates `match_agreements` table.
3. Creates `match_agreement_sides` table.
4. Adds nullable `agreement_id uuid` column on existing `matches`
   table, FK → `match_agreements(id) ON DELETE RESTRICT`.
5. Adds index `idx_matches_agreement` on `matches.agreement_id`.

Existing 012 rows keep `agreement_id = NULL`. No data
backfill, no UPDATE of historical rows (constitution V).

**Rationale**: additive-only migration is safe on Neon's
production branch (no schema lock risk on tiny tables). The
nullable FK + ON DELETE RESTRICT means a `match_agreements` row
cannot be deleted while linked matches exist — the void path goes
through `voided_at` on the matches row + `result_recorded_at = NULL`
reset on the agreement, not via hard delete.

**Alternatives considered**:

- *NOT NULL `agreement_id` with backfill*. Would require
  inventing fictitious agreements for the 012 one-step rows —
  contradicts the audit principle (don't rewrite history).
- *Separate enum strings as VARCHAR with CHECK constraints*.
  Loses Drizzle's typed enum + Postgres-native enum benefits;
  rejected to stay consistent with the existing schema style
  (member_role, payment_status, etc., are all pgEnum).

---

## R7 — Singles fast-create-then-record path (replacing the legacy quick-log)

**Decision**: after `createAgreementAction` returns success, the
NewMatchAgreementForm presents a "Record result now?" affordance
that opens RecordResultForm inline (no nav). For spontaneous
singles, the user taps through both forms back-to-back in ~3 taps
total — equivalent friction to the sunset 012 quick-log path.

**Rationale**: spec Q5 explicitly mandates "every singles match
goes through the agreement flow"; this design honours that without
penalising the spontaneous-singles UX Standa relies on.

**Alternatives considered**:

- *Auto-redirect to `/match/[agreementId]` after create*. Adds a
  navigation step + flash; the inline expansion is smoother.
- *Combined "create-and-result" composite action*. Hides the two
  states from the audit log — defeats the purpose of having
  agreements as first-class objects.

---

## R8 — How to handle the "concurrent result recording" edge case

**Decision**: optimistic concurrency via the
`result_recorded_at IS NULL` predicate in the UPDATE statement.
First writer wins (sets the field non-null in one row); the
second writer's UPDATE matches zero rows, the action returns a
`{ ok: false, code: 'ALREADY_RECORDED', recordedAt, recorderName }`
error which the client renders as the toast spec'd in the
edge-case section ("already settled by [name] N seconds ago —
undo if wrong"). No row-level locks needed at this scale.

**Rationale**: cheapest correct approach. Postgres's MVCC
guarantees only one of the two concurrent UPDATEs touches the row
when both filter on `result_recorded_at IS NULL`. The retry-storm
risk (typical of optimistic concurrency) is irrelevant here — the
user manually presses a button, doesn't retry automatically.

**Alternatives considered**:

- *SELECT FOR UPDATE then UPDATE*. Holds a row lock for the
  duration of the transaction; works but adds latency under the
  rare contention scenario. Optimistic UPDATE is faster + simpler.
- *Application-level "click once" guard*. Doesn't survive two
  tabs / two devices recording the same agreement.

---

## R9 — Testing strategy for the four user stories

**Decision**: one Playwright spec `tests/e2e/match-agreement.spec.ts`
with four `test.describe` blocks (US1, US2, US3, US4), each block
containing one test per Acceptance Scenario. Unit-level transaction
tests live in `tests/unit/match-agreement-tx.spec.ts` using PGlite
(same pattern as `tests/unit/match-tx.spec.ts`). Schema tests in
`tests/unit/match-agreement-schema.spec.ts` per the spec 009
pattern.

**Rationale**: matches constitution gate 5's "every Acceptance
Scenario MUST have a matching Playwright assertion" requirement
and the existing 012 test layout — reviewers find the right test
file by spec number.

**Alternatives considered**:

- *One spec per user story*. Four files is more navigation cost
  for reviewers; the one-spec-multiple-describes pattern is what
  012, 010, 008 all use.

---

## Open items deferred to /speckit-tasks

- Exact message-catalog string set (cs / en parity is a gate, not
  a research question).
- Performance benchmark numbers — SC-001, SC-002, SC-007 in spec
  are testable in E2E timing assertions.
- The "treasurer override" UI affordance for non-participant
  recording (a small "Override (treasurer)" link below the
  participant-only CTA, or a hidden-by-default expansion) — task
  phase will design the exact UX during implementation.
