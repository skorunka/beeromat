# Phase 1 Data Model: Recreate Last Match

**No schema change.** This feature reads and clones existing entities. Documented here for completeness.

## Entities (existing, unchanged)

### match_agreements

The scheduled-match record. Relevant columns for this feature:

| Column | Role in this feature |
|--------|---------------------|
| `id` | Identifies the source agreement to clone and the new clone. |
| `club_id` | Tenant scope — the last-match query and the create both filter by it. |
| `format` | `'singles' \| 'doubles'` — cloned verbatim. |
| `for_beer` | Boolean — cloned verbatim. |
| `pairing_kind` | `'straight' \| 'crossed' \| null` — cloned verbatim (null for singles). |
| `created_at` | The ordering key — "last match" = max `created_at` among the member's agreements. |
| `result_recorded_at`, `cancelled_at` | **Ignored** for source resolution — any state is a valid clone source (Q4). The clone is always a fresh OPEN agreement (these are null on the new row). |

### match_agreement_sides

Per-seat participant assignment.

| Column | Role in this feature |
|--------|---------------------|
| `agreement_id` | Links a side row to its agreement. |
| `side` | `'A' \| 'B'` — cloned verbatim. |
| `seat` | `1 \| 2` — cloned verbatim. |
| `member_id` | The participant. The set of these for the source agreement is the lineup. Used to (a) filter "agreements the member is in", (b) build the matchup label, (c) re-validate active membership before cloning. |

### members

| Column | Role in this feature |
|--------|---------------------|
| `id`, `club_id` | Participant identity + tenant scope. |
| `display_name` | Builds the matchup label ("Franta + Pepa vs Honza + Standa"). |
| `is_active` | **The active-participant guard** — recreate blocks if any source participant has `is_active = false`. |

## Derived shapes (no persistence)

### LastAgreementSummary (query output)

Mirrors the existing `OpenAgreementSummary` shape so the hub reuses `joinSideNames`:

```text
{
  id: string
  format: 'singles' | 'doubles'
  forBeer: boolean
  pairingKind: 'straight' | 'crossed' | null
  createdAt: Date
  sides: {
    A: { memberId, displayName, seat }[]
    B: { memberId, displayName, seat }[]
  }
}
```

`null` when the member has participated in no agreement.

### Clone input (transient)

The `recreateLastMatchAction` maps a re-resolved `LastAgreementSummary` into the existing `CreateAgreementInput`:

```text
singles → { format: 'singles', forBeer, sides: { A: { seat1: A1 }, B: { seat1: B1 } } }
doubles → { format: 'doubles', forBeer, pairingKind,
            sides: { A: { seat1: A1, seat2: A2 }, B: { seat1: B1, seat2: B2 } } }
```

Then delegates to `createAgreementTx`, which validates and inserts.

## Invariants

- The source agreement is **never mutated or deleted** (Constitution V). Recreate is purely additive.
- The clone is always OPEN (`result_recorded_at` / `cancelled_at` null), regardless of the source's state.
- The clone's lineup is byte-identical to the source's (same members in the same side+seat positions).
- Both source resolution and create are `club_id`-scoped (Constitution II).
