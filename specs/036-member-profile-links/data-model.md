# Data Model: Member-name profile links (spec 036)

**No data-model changes.** This feature is purely presentational.

The link targets are already present on the existing read shapes (no new fields, no
migration):

| Shape (existing) | Field used for the link | Source spec |
|---|---|---|
| `BeerDebtRow` (`lib/db/queries/match-bet-debts.ts`) | `counterpartyMemberId` (+ `counterpartyAvatarKey`, `counterpartyAvatarUploadAt`) | 030 |
| `MemberTabEntry` (`lib/db/queries/consumption.ts`) | `loggerMemberId` (+ `loggerAvatarKey`, `loggerAvatarUploadAt`) | 019 / 023 |

Both ids are already consumed by the components to render `MemberAvatar`; this feature
just additionally uses them as the `/members/[id]` link target. No query `select`
changes required.
