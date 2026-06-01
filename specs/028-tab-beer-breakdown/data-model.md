# Phase 1 Data Model: Beer Breakdown on the Tab

**No schema change. No new persisted entity.** This feature derives a view over data the tab screen already loads.

## Input (existing, unchanged)

### MemberTabEntry (existing type, `lib/db/queries/consumption.ts`)

The per-line tab entry the breakdown reads. Relevant fields:

| Field | Role in the breakdown |
|-------|----------------------|
| `kind` | `'consumption' \| 'transfer_in' \| 'transfer_out'` — selects what's counted. |
| `beerTypeName` | The group key (primary). |
| `unitPriceMinor` | Summed into the group subtotal. |
| `createdAt` | Derives the day key (secondary group key) + display date. |
| `voided` | Excluded when true. |

Counted predicate (identical to the tab-total predicate): `!voided && kind !== 'transfer_out'`.

## Derived shape (not persisted)

### BeerBreakdownGroup

```text
{
  beerTypeName: string       // e.g. "Pilsner Urquell"
  dayKey: string             // 'YYYY-MM-DD' (UTC day of createdAt) — bucketing key
  representativeDate: Date   // a createdAt from the group, for locale-aware display
  count: number              // number of countable entries in the group
  subtotalMinor: bigint      // sum of the group's entry unitPriceMinor
}
```

Produced by `groupTabEntriesByBeer(entries) → BeerBreakdownGroup[]`, sorted by `dayKey` desc then `subtotalMinor` desc.

## Invariants

- `Σ group.subtotalMinor === getMyTabForSession(...).totalMinor` — the breakdown grand total equals the tab total, by construction (same counted predicate). Asserted in tests.
- `Σ group.count === number of countable entries`.
- A `transfer_in` beer joins the same `beerTypeName` group as a self-logged beer of that type (no origin split).
- Empty input → `[]` → the component is not rendered.
