# Data Model: Post-Shipping Polish Round (A-E)

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

## Schema

**No changes.** Reuses the existing avatar fields on `members`
(`avatar_key`, `avatar_upload_at`) from specs 020 + 021.

## Query shape diff

### `getOnBehalfReviewForMember` (lib/db/queries/on-behalf-review.ts)

The query feeding the home on-behalf review banner gains
three logger fields per row.

```diff
 export interface OnBehalfReviewRow {
   consumptionId: string;
   loggerDisplayName: string;
+  loggerMemberId: string;
+  loggerAvatarKey: string | null;
+  loggerAvatarUploadAt: Date | null;
   beerName: string;
 }
```

The query already joins `users` for `loggerDisplayName`;
add a join (or extend an existing one) to `members` on
`userId = createdByUserId AND clubId = consumptions.clubId`
to surface the logger's avatar row. Same alias pattern as
spec 023 used in `consumption.ts` for the tab on-behalf
attribution.

## Authorization

Unchanged. The on-behalf-review query already filters by
the consumer's club + the consumer's member id. The new
avatar fields are scoped to the same club (the logger is a
member of the same club as the consumer by definition of
the on-behalf log).

## Data volume

- One extra JOIN to `members` per query call. The query
  already returns ≤ 20 rows per consumer per session (one
  per unreviewed on-behalf log). Bytes-level overhead.
- No new indexes.

## Migration note

None.
