# Contract: `uploadAvatarAction` + `removeAvatarUploadAction`

**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md) | **Date**: 2026-05-27

Two new server actions in `app/[locale]/(app)/account/actions.ts`,
alongside the spec-020 `setAvatarAction`.

## `uploadAvatarAction`

### Signature

```ts
export type UploadAvatarResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | 'INVALID_CONTENT_TYPE'
        | 'OVERSIZE'
        | 'EMPTY_IMAGE'
        | 'NO_MEMBERSHIP';
    };

export async function uploadAvatarAction(input: {
  imageBase64: string;       // base64-encoded image bytes (no data: prefix)
  contentType: string;       // one of: image/jpeg | image/png | image/webp
}): Promise<UploadAvatarResult>;
```

### Preconditions

- Caller MUST have an unlocked session (`requireUnlocked()`).
- Caller MUST have an active membership row (`ctx.member`).
- `input.imageBase64` MUST decode to ≤ 262144 bytes (256 KB).
- `input.contentType` MUST be in the allowlist
  (`image/jpeg`, `image/png`, `image/webp`).

### Postconditions (happy path)

- UPSERT into `avatar_uploads`: if a row exists for
  `ctx.member.id`, UPDATE `image`, `content_type`, `byte_size`,
  `updated_at = now()`. Otherwise INSERT.
- UPDATE `members SET avatar_upload_at = now()` for the same
  member.
- Both writes happen in a single transaction.
- `revalidatePath('/', 'layout')` so the AppHeader avatar +
  `/account` picker pick up the change on the next render tick.
- Returns `{ ok: true }`.

### Failure cases

| Code | When |
|------|------|
| `INVALID_CONTENT_TYPE` | `contentType` not in the allowlist |
| `OVERSIZE` | Decoded bytes > 262144 (256 KB) |
| `EMPTY_IMAGE` | Decoded bytes length === 0 (defensive — never happens via the UI) |
| `NO_MEMBERSHIP` | Session valid but `ctx.member` is null (edge — shouldn't happen via the UI) |

### Authorization

- Any active member of a club can upload THEIR OWN avatar.
- No role required.
- No way to upload for another member (the action writes only
  to `ctx.member.id`).

### Side effects

- One INSERT or UPDATE on `avatar_uploads`.
- One UPDATE on `members`.
- One `revalidatePath('/', 'layout')` call.
- No event log entry (spec Assumptions — avatar changes are
  low-stakes).

## `removeAvatarUploadAction`

### Signature

```ts
export type RemoveAvatarUploadResult =
  | { ok: true }
  | { ok: false; code: 'NO_MEMBERSHIP' };

export async function removeAvatarUploadAction(): Promise<RemoveAvatarUploadResult>;
```

### Preconditions

- Caller MUST have an unlocked session.
- No input.

### Postconditions

- DELETE FROM `avatar_uploads` WHERE `member_id = ctx.member.id`.
  No-op if no row exists.
- UPDATE `members SET avatar_upload_at = NULL` for the same
  member.
- Both writes in a single transaction.
- `revalidatePath('/', 'layout')`.
- Returns `{ ok: true }`.

### Side effects

- One DELETE on `avatar_uploads` (may affect 0 rows).
- One UPDATE on `members`.
- One `revalidatePath` call.

## Interaction with spec-020 `setAvatarAction`

Spec 020's `setAvatarAction` already exists. It also needs a
small change: when a member picks a glyph or the Default tile,
any existing upload MUST be dropped so the glyph/default wins
(FR-006). Implementation: inside `setAvatarAction`, before the
`UPDATE members SET avatar_key = $1` line, add:

```ts
// Picking a glyph or Default clears any existing upload.
await tx.delete(avatarUploads).where(eq(avatarUploads.memberId, ctx.member.id));
await tx
  .update(members)
  .set({ avatarKey: finalKey, avatarUploadAt: null })
  .where(eq(members.id, ctx.member.id));
```

(The UPDATE merges the two members-row changes into one
statement.)

## Test obligations

`tests/integration/upload-avatar-action.spec.ts`:

1. **Happy first upload** — no existing row → INSERT, member row
   updated, returns `{ ok: true }`.
2. **Replace existing** — pre-seed an upload, upload again →
   UPDATE (no new id), `updated_at` advanced, member's
   `avatar_upload_at` matches.
3. **Invalid content-type** — `application/pdf` → `INVALID_CONTENT_TYPE`.
4. **Oversize** — base64 of 300 KB of bytes → `OVERSIZE`.
5. **Empty image** — empty base64 string → `EMPTY_IMAGE`.
6. **No membership** — session without active member → `NO_MEMBERSHIP`.

`tests/integration/remove-avatar-action.spec.ts`:

1. **Happy remove** — existing upload → row deleted, member's
   `avatar_upload_at` is NULL.
2. **No-op remove** — no existing upload → returns `{ ok: true }`,
   member's `avatar_upload_at` is still NULL.
3. **Picking a glyph also clears upload** — pre-seed an upload,
   call `setAvatarAction({ avatarKey: 'star' })` → upload row
   gone, member's `avatar_upload_at` NULL, `avatar_key = 'star'`.
4. **Cascade on member delete** — pre-seed an upload, delete the
   member → upload row also gone (cascade).
