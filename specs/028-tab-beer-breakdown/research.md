# Phase 0 Research: Beer Breakdown on the Tab

All four design questions were resolved in the spec's Clarifications session (2026-06-01). No open `NEEDS CLARIFICATION`. Technical decisions below.

## Decision 1 — Pure grouping helper over the existing entries

**Decision**: Add `groupTabEntriesByBeer(entries: MemberTabEntry[]): BeerBreakdownGroup[]` in `lib/tab/group-beer-breakdown.ts`. The `/tab` page already loads `MemberTabEntry[]` via `getMyTabForSession`; the helper is a pure O(n) transform of that array — no new query, no DB access, no schema change.

**Rationale**: FR-010 forbids a new fetch. The entries already carry everything needed (`kind`, `beerTypeName`, `unitPriceMinor`, `createdAt`, `voided`). A pure function is the cheapest test layer (Principle VIII) and keeps the component presentational.

**Alternatives considered**:
- *A new grouped DB query* — rejected: redundant round-trip; the data is already in memory, and a second query risks diverging from the tab total.
- *Group inside the component* — rejected: harder to unit-test; mixing logic into JSX.

## Decision 2 — Inclusion rules (bet-adjusted, sums to the tab total)

**Decision**: An entry is counted iff `!entry.voided && entry.kind !== 'transfer_out'`. That includes `consumption` (self/on-behalf, still held) and `transfer_in` (picked up from a lost bet); it excludes `transfer_out` (won away) and any voided row.

**Rationale**: This is exactly the predicate `getMyTabForSession` already uses to compute `totalMinor` (it sums non-voided, non-`transfer_out` entries). Using the identical predicate makes "breakdown grand total == tab total" true by construction (FR-004), satisfying the SC-002 invariant.

**Alternatives considered**:
- *Count only `consumption`* — rejected: would drop a lost-bet beer the member genuinely owes, so the breakdown would undercount vs the total.
- *Count `transfer_out` too* — rejected: would include a beer the member won away, overcounting vs the total.

## Decision 3 — Grouping key + sort

**Decision**: Group by `(beerTypeName, dayKey)` where `dayKey` is the calendar day of `entry.createdAt`. Each group carries `{ beerTypeName, dayKey, representativeDate, count, subtotalMinor }`. Sort: `dayKey` descending (newest day first), then `subtotalMinor` descending within a day. `subtotalMinor = sum of the group's entry unitPriceMinor` (not count × a single price — robust if a beer's price ever changed mid-round, since entries snapshot price).

**Rationale**: FR-007. Subtotal-desc surfaces the biggest spend. The day key only visibly matters for a multi-day round (manual round-close means a round can span days); a single evening collapses to one day so the breakdown reads as pure "by beer type". Summing actual entry prices (not count×price) keeps the invariant exact even with historical price snapshots.

**Alternatives considered**:
- *count × current price* — rejected: entries snapshot the price at log time; multiplying by a single price could disagree with the summed total. Sum the snapshots.
- *No day key* — rejected: a multi-day round would merge two evenings' counts, surprising the member.

## Decision 4 — Day key derivation (pure + locale-stable)

**Decision**: Derive `dayKey` as the `YYYY-MM-DD` of `createdAt` in the club's locale/timezone via the caller, OR — to keep the helper pure and deterministic — bucket by the date's `toISOString().slice(0,10)` (UTC day) inside the helper, and format the human date in the component with `Intl.DateTimeFormat`. For a pet-scale single-club app whose evenings don't straddle UTC midnight in practice, UTC-day bucketing is acceptable and fully deterministic for tests. (If timezone edge-cases ever bite, the caller can pass a pre-computed day key; out of scope now.)

**Rationale**: Determinism for unit tests trumps timezone perfection at this scale; the spec's multi-day case is about genuinely different evenings, which UTC-day bucketing handles fine. The component owns display formatting (locale-aware), the helper owns bucketing (deterministic).

**Alternatives considered**:
- *Locale/timezone-aware bucketing inside the helper* — deferred: introduces non-determinism / timezone config into a pure function; unnecessary at single-club scale.

## Decision 5 — Empty handling

**Decision**: The helper returns `[]` when no entries are countable; the `/tab` page renders the `TabBeerBreakdown` only when the group array is non-empty (FR-006). No empty-state markup inside the component.

**Rationale**: Mirrors the existing hub pattern (render-nothing-on-empty). Keeps the component free of a null branch.
