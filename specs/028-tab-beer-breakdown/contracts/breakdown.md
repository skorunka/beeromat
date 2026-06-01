# Contract: Beer Breakdown on the Tab

## Pure helper: `groupTabEntriesByBeer`

**Location**: `lib/tab/group-beer-breakdown.ts`

**Signature**:
```text
export interface BeerBreakdownGroup {
  beerTypeName: string;
  dayKey: string;            // 'YYYY-MM-DD' (UTC day of createdAt)
  representativeDate: Date;
  count: number;
  subtotalMinor: bigint;
}

export function groupTabEntriesByBeer(entries: MemberTabEntry[]): BeerBreakdownGroup[]
```

**Behaviour**:
- Counts entries where `!voided && kind !== 'transfer_out'`.
- Buckets by `(beerTypeName, dayKey)`; `dayKey = createdAt.toISOString().slice(0,10)`.
- `count` = entries in bucket; `subtotalMinor` = Σ their `unitPriceMinor`; `representativeDate` = any (e.g. first) entry's `createdAt`.
- Sorted by `dayKey` desc, then `subtotalMinor` desc.
- Returns `[]` for no countable entries.

**Unit test cases**:
1. Groups multiple same-type beers into one group with correct count + subtotal.
2. Keeps distinct beer types as separate groups (even at equal price).
3. Excludes `voided` entries from count + subtotal.
4. Excludes `transfer_out` entries (won-away beers).
5. Includes `transfer_in` entries in their beer-type group (lost-bet beers).
6. Multi-day: buckets per (type, day); days sorted newest-first.
7. Sort within a day: biggest subtotal first.
8. Invariant: Σ subtotalMinor equals the sum of the same counted predicate over the input (== tab total).
9. Empty input → `[]`. Single countable entry → one group, count 1.

## Component: `TabBeerBreakdown`

**Location**: `components/tab/tab-beer-breakdown.tsx`

**Props**: `{ groups: BeerBreakdownGroup[]; currencyCode: string; locale: string; multiDay?: boolean }`
(or derive `multiDay` from groups spanning >1 dayKey).

**Behaviour**:
- Renders one row per group: "{beerTypeName} ×{count} · {subtotal}" with plural-aware count copy.
- When groups span multiple days, shows a per-day sub-heading (locale-formatted `representativeDate`).
- Renders a section heading.
- Renders nothing when `groups` is empty (caller already guards, but defensive).

**Component test cases**:
1. Renders a row per group with name, count, subtotal.
2. Plural count copy renders (cs + en) — e.g. "×3" / Czech plural form.
3. Summed displayed subtotals equal the expected grand total.
4. Empty groups → nothing rendered.

## Hub wiring: `/tab` page

- After loading `tab` (`getMyTabForSession`), compute `groupTabEntriesByBeer(tab.entries)`.
- Render `TabBeerBreakdown` above the existing chronological `<TabEntryRow>` list **only when** the group array is non-empty.
- The existing total card + chronological list + per-beer Undo are unchanged.

## i18n keys (cs + en)

- `tab.breakdown.heading` — section heading ("What you've had" / "Cos měl/a").
- `tab.breakdown.line` — `"{beer} ×{count} · {amount}"` with next-intl plural on `{count}` where Czech reads naturally.
