# Data Model: Avatars Everywhere

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

## Schema

**No changes.** Reuses three existing artifacts:

- `members.avatar_key` (nullable text) — spec 020
- `members.avatar_upload_at` (nullable timestamptz) — spec 021
- `avatar_uploads` table (bytea + UNIQUE FK to members) — spec 021

## Query result shape diffs

Each query below already returns the named member's
`displayName`. This spec adds three fields per named member:
`memberId` (uuid), `avatarKey` (nullable text), and
`avatarUploadAt` (nullable Date). The renderer combines them
to pick the right avatar variant via the existing
`avatarUploadUrl(memberId, avatarUploadAt)` helper from
`lib/avatars/upload-url.ts`.

### 1. `getPendingClaimsForTreasurer` (lib/db/queries/treasurer.ts)

```diff
 {
   paymentId, memberId, memberDisplayName,
+  memberAvatarKey, memberAvatarUploadAt,
   amountMinor, currencyCode, variableSymbol, note, createdAt,
 }
```

(`memberId` is already present; only the two avatar fields are new.)

### 2. `getRecentlyConfirmedPayments` (lib/db/queries/treasurer.ts)

```diff
 {
-  paymentId, memberDisplayName,
+  paymentId, memberId, memberDisplayName,
+  memberAvatarKey, memberAvatarUploadAt,
   amountMinor, currencyCode, confirmedAt,
 }
```

### 3. `getTransferableConsumptionsForCurrentSession` (lib/db/queries/bet-transfers.ts)

Each "drink you can take" row names its current owner.

```diff
 {
   consumptionId, beerTypeId, beerTypeName,
-  ownerMemberId, ownerDisplayName,
+  ownerMemberId, ownerDisplayName,
+  ownerAvatarKey, ownerAvatarUploadAt,
   unitPriceMinor,
 }
```

### 4. `getBetTransfersForSession` (lib/db/queries/bet-transfers.ts)

Each transfer row names both members (from + to).

```diff
 {
   id, beerTypeId, beerTypeName,
-  fromMemberId, fromMemberName,
-  toMemberId, toMemberName,
+  fromMemberId, fromMemberName,
+  fromAvatarKey, fromAvatarUploadAt,
+  toMemberId, toMemberName,
+  toAvatarKey, toAvatarUploadAt,
   unitPriceMinorSnapshot, voided,
 }
```

(Both `fromMemberId` and `toMemberId` are already present; only
the avatar fields are new.)

### 5. `getMyTabForSession` + `getSessionDetail` shared `MemberTabEntry` (lib/db/queries/consumption.ts)

Only the `kind: 'on-behalf'` discriminant gets the logger's
avatar fields. The other three origin kinds (`self`,
`from-match`, `lost-bet`) do not name a person and stay
unchanged.

```diff
 // Discriminated union: existing other kinds untouched.
 type MemberTabEntry =
   | { kind: 'self'; … }                  // unchanged
   | { kind: 'from-match'; … }            // unchanged
   | { kind: 'lost-bet'; … }              // unchanged
   | {
       kind: 'on-behalf';
       id; beerTypeName; voided; canUndo; createdAt; unitPriceMinor;
-      loggerDisplayName;
+      loggerMemberId;       // new — needed to build upload URL
+      loggerDisplayName;
+      loggerAvatarKey;      // new
+      loggerAvatarUploadAt; // new
     };
```

(`getSessionDetail.transfers[]` reuses the same field-extension
pattern as #4 — bet-transfer rows on `/history/[id]` get both
members' avatar fields.)

## Renderer fallback

Unchanged from spec 020 + 021 — the `MemberAvatar` component
already encapsulates the precedence chain:

```
uploadUrl present (built from memberId + avatarUploadAt)  → <img>
else valid avatarKey                                      → glyph
else non-empty displayName                                → initials
else                                                      → CircleUser
```

This spec adds a `size` prop (`'default' | 'row' | 'inline'`)
to the same component — the precedence chain is identical
across sizes.

## Authorization

- The avatar URL endpoint (`/api/avatar/[memberId]` — spec 021)
  already enforces cross-club 404. Embedding an avatar URL in
  a list response does not leak cross-tenant existence: a
  cross-club URL request 404s.
- All five queries above already filter by the caller's
  `club_id`, so the rows themselves are tenancy-safe and the
  avatar fields they carry are by definition same-club.

## Data volume

- ~30 active members per club. Adding three nullable fields
  per result row is bytes-level overhead.
- No new indexes — none of the new fields are query predicates.
- Browser cache shares avatar fetches across rows and across
  surfaces (per spec 021's `Cache-Control: immutable` on the
  versioned URL).

## Migration note

None. All required columns exist.
