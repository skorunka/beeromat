# UI Contract — Home review banner + /tab row variants

## `<OnBehalfReviewBanner />` (home)

Sits on `/` above the spec-018 `<MatchBetModule />` (which sits
above the spec-017 `<HomeOneTapLog />`). Renders nothing when no
unreviewed on-behalf rows exist.

### Inputs

From a new `onBehalfReviewSummaryForMember(ctx.member.id,
ctx.club.id)` query, folded into the home page's existing
`Promise.all`:

```ts
{
  count: number;
  rows: Array<{
    consumptionId: string;
    loggerDisplayName: string;
    beerName: string;
    createdAt: Date;
  }>;
}
```

### Variants

- **V1** (count === 0): renders `null`.
- **V2** (count === 1): single row with logger + beer + two
  buttons.
  ```
  ┌──────────────────────────────────────────┐
  │ 🍺 Pavel ti zapsal: Kozel                │
  │   [Vrátit]  [Nechat]                     │
  └──────────────────────────────────────────┘
  ```
  - `Vrátit` → calls `voidConsumptionAction(consumptionId)` +
    `dismissOnBehalfReviewAction(consumptionId)`.
  - `Nechat` → calls `dismissOnBehalfReviewAction(consumptionId)`
    only (keeps the consumption).
- **V3** (count > 1): aggregated list — one row per
  consumption, each with its own Vrátit/Nechat buttons OR a
  single "Nechat vše" + per-row Vrátit. Keep simple: per-row.

### Catalog (en + cs)

| Key | cs | en |
|-----|----|----|
| `home.onBehalfReview.one` | `{logger} ti zapsal: {beer}` | `{logger} logged for you: {beer}` |
| `home.onBehalfReview.heading` | `Zápisy pro tebe` | `Logged for you` |
| `home.onBehalfReview.reject` | `Vrátit` | `Reverse` |
| `home.onBehalfReview.keep` | `Nechat` | `Keep` |

No "dlužíš" anywhere — the rejected wording stays away from
accusatory framings.

## `/tab` row variants (extended `MemberTabEntry.kind`)

Today `/tab` renders only `kind === 'consumption'` rows. Spec 019
expands to four origin types, each visually distinguishable per
FR-007:

| Kind | Source | Visual treatment |
|------|--------|------------------|
| `consumption` (self-logged) | the member logged it for themselves | Default row, no badge |
| `consumption` (on-behalf) | another member logged it for them | "od {logger}" subtitle below beer name |
| `consumption` + bet-linked (winner's tab) | spec 018 shipped this | "ze zápasu →" subtitle (already shipped) |
| `transfer_in` (loser's tab) | spec 018 created a bet_transfer with `to_member_id = $1` | Distinct row layout: "z prohrané sázky: Pavel · Kozel" + link to source match |

Row sorting: ALL kinds in one chronological list (newest first),
sorted by `createdAt`.

### Catalog (en + cs)

| Key | cs | en |
|-----|----|----|
| `tab.byOther` | `od {logger}` | `by {logger}` |
| `tab.fromBet` | `z prohrané sázky: {logger} · {beer}` | `lost bet: {logger} · {beer}` |
| `tab.fromMatch` (existing — shipped spec 018) | `ze zápasu →` | `from the match →` |

## Acceptance gates

A passing implementation MUST:

1. Render exactly the structures above (component tests).
2. Pass `pnpm i18n:check` — every new key in both catalogs.
3. Pass `pnpm forms:check` — no native validation added.
4. Pass the nag-tone grep (no `dluž*` in the new strings).
5. `/tab` row count matches the member's balance arithmetic
   (consumption + transfer_in = total). Integration test
   verifies.
