# Data Model: Picker Avatars

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

## Schema

**No changes.** Reuses the existing avatar fields on `members`
(`avatar_key`, `avatar_upload_at`) from specs 020 + 021. No
new tables, columns, or indexes.

## Query result shape diffs

Two queries get extended to project two new fields per
candidate row. Both queries already return `id` +
`displayName`; this spec adds `avatarKey` (nullable text) +
`avatarUploadAt` (nullable Date).

### 1. `listActiveClubMembers` (lib/db/queries/match-agreements.ts)

Feeds the four-seat picker grid on `/match` new + edit forms.

```diff
 {
-  id, displayName,
+  id, displayName,
+  avatarKey, avatarUploadAt,
 }
```

Ordering: alphabetical by `displayName` (unchanged).

### 2. New helper: `listOtherActiveMembers` (lib/db/queries/members.ts — NEW module)

Extracts the inline query currently in `app/[locale]/(app)/
log/for/page.tsx`. Same shape as #1, with an extra
`excludingMemberId` filter so the actor never appears in
their own on-behalf picker.

```ts
// NEW
export async function listOtherActiveMembers(
  clubId: string,
  excludingMemberId: string,
): Promise<{
  id: string;
  displayName: string;
  avatarKey: string | null;
  avatarUploadAt: Date | null;
}[]>;
```

Ordering: alphabetical by `displayName` (matches current
behavior).

## Renderer fallback

Unchanged from spec 020 + 021 + 023 — `MemberAvatar`
encapsulates the precedence chain. This spec passes the
queried fields straight through to the avatar primitive.

## Authorization

- Both queries filter by `club_id` (Constitution Principle II
  — tenant-aware). The avatar URLs embedded in the picker
  options resolve via the existing `/api/avatar/[memberId]`
  endpoint, which 404s on cross-club access (spec 021
  behavior preserved).
- No new endpoint introduced.
- The `/match` "disabled if already assigned" predicate is
  computed UI-side from form state — no server query.

## Data volume

- ~30 active members per club. Two new nullable fields per
  result row is bytes-level overhead.
- No new indexes.
- Avatar URLs cached browser-side per spec 023 (same
  `?v=<avatarUploadAt>` busting). Opening a `/match` seat
  dropdown for the first time on a session reuses the
  cached avatars from `/admin/pending` or `/bet` if those
  surfaces were visited recently.

## Migration note

None. All required columns exist on `members`.
