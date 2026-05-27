# Data Model: Bet-Beer Tile Picker

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

## Schema

**No changes.** Reuses two existing query paths:

- `betBeerOptions` — inline query in
  `app/[locale]/(app)/match/[agreementId]/page.tsx` that
  selects `{ id, name }` from `beer_types` filtered by
  `clubId` + `isArchived = false` + `currentStock > 0`.
  Unchanged.
- `lastBeerForMember(memberId, clubId)` — existing helper
  in `lib/db/queries/consumption.ts` returning the member's
  most recent unvoided consumption's beer type
  (`{ id, name, currentStock, isArchived, unitPriceMinor }`)
  or `null`. Used unchanged.

## Page query shape diff

`app/[locale]/(app)/match/[agreementId]/page.tsx` adds one
field to its `Promise.all`:

```diff
 const [agreement, members, betBeerOptions, /* …other parallel calls */ ] = await Promise.all([
   loadAgreement(/* … */),
   isOpen ? listActiveClubMembers(ctx.club.id) : [],
   isOpen && agreement.forBeer && viewerCanRecord
     ? db.select({...}).from(beerTypes).where(...)
     : [],
+  // Spec 025 — name surfaced on the picker's Auto tile.
+  // Runs in parallel; falls back to null when the recorder
+  // has never logged a beer.
+  isOpen && agreement.forBeer && viewerCanRecord
+    ? lastBeerForMember(ctx.member.id, ctx.club.id)
+    : null,
 ]);
```

The new `lastBeerForMember` result is destructured as e.g.
`recorderLastBeer` and then passed to `RecordResultForm` as
`loserLastBeerName={recorderLastBeer?.name ?? null}`.

## Form payload shape

The `recordResultAction` payload is **unchanged**. Today's
form already supports `betBeerOverrideId?: string`, and this
spec only changes which UI surface sets that value. The
spread pattern that omits the field when falsy stays in place:

```ts
const payload = {
  agreementId,
  winningSide: side,
  ...(betBeerOverrideId ? { betBeerOverrideId } : {}),
};
```

`betBeerOverrideId` is held as `string | null` in component
state:

| Picker selection | `betBeerOverrideId` | Wire field |
|------------------|---------------------|------------|
| Auto tile (default) | `null` | omitted |
| Non-Auto tile picked | beer-type-id | `betBeerOverrideId: <id>` |

## Renderer fallback

If `loserLastBeerName` is null (recorder has no last-beer),
the Auto tile label renders with the localized
`match.betPicker.autoFallback` string instead of
`match.betPicker.autoLabel` parameterized on `{beer}`.

## Authorization

Unchanged. The picker only renders when:

- `agreement.forBeer === true`
- `viewerCanRecord === true` (existing gate on the page)

Both conditions are evaluated server-side; the picker
itself does no authz check.

## Data volume

- One extra query per agreement-detail page load
  (`lastBeerForMember`). Already optimized — single
  `SELECT … LIMIT 1` from `consumptions`.
- No new indexes.

## Migration note

None. All required columns + queries exist.
