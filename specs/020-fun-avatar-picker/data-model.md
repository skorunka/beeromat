# Data Model: Fun Avatar Picker

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

## Schema change

### `members` — add `avatar_key`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `avatar_key` | `text` | yes | `NULL` | One of `AVATAR_KEYS` or NULL for "use default". Validated at write time by the server action against the allowlist; renderer also falls back to default for any unknown key (forward compat for palette changes). |

**Migration** (`drizzle/0008_<auto-named>.sql`):

```sql
ALTER TABLE "members" ADD COLUMN "avatar_key" text;
```

No backfill — every existing member starts with NULL (initials
fallback), which is the same glyph they see today.

### Drizzle schema update

`lib/db/schema/members.ts` — add the column to the `members`
table definition:

```ts
avatarKey: text('avatar_key'),
```

No relations, no indexes, no constraints beyond the column itself.

## Allowlist (application layer)

Lives in `lib/avatars/palette.tsx` — TypeScript-side source of
truth for which keys are valid.

```ts
export const AVATAR_KEYS = [
  'beer-mug',
  'tennis-ball',
  'court',
  'cheers',
  'wine',
  'trophy',
  'medal',
  'bee',
  'lion',
  'lightning',
  'target',
  'guitar',
] as const;
export type AvatarKey = (typeof AVATAR_KEYS)[number];

export function isValidAvatarKey(s: string): s is AvatarKey {
  return (AVATAR_KEYS as readonly string[]).includes(s);
}
```

The exact glyph set is the plan's working assumption; the picker
renders whatever ends up in `AVATAR_KEYS` × the matching SVG
bodies in the same file. The validator is the only thing the
server action calls, so adding / removing keys is a one-file
change.

## Entity relationships

No new entities. The change is a single nullable column on
`members`. All existing joins / queries that already select from
`members` can simply add `avatarKey` to their projection when a
glyph render is needed; no query changes are mandatory because
the renderer's null fallback covers the "didn't select it" case.

## Lifecycle / state transitions

`members.avatar_key` is a free-write field — no state machine. The
only operations:

| Op | Trigger | Effect |
|----|---------|--------|
| Set | `setAvatarAction({ avatarKey: <key> })` from /account picker | `avatar_key = <key>` |
| Clear | `setAvatarAction({ avatarKey: null })` from "Default" tile | `avatar_key = NULL` |
| Cascade | Member soft-delete (existing) | No special handling; the column travels with the row. |

## Validation rules

- `avatar_key` MUST be in `AVATAR_KEYS` at write time
  (action-side check via `isValidAvatarKey`).
- Empty string is normalized to NULL at the action boundary
  (defensive — the picker never sends `''` but it's the kind of
  thing a manual API call might).
- Read-side: unknown keys (e.g. one removed in a later version
  but still stored on an old member row) render the default
  fallback. Never throw, never empty-circle.

## Data volume / scale assumptions

- One row per member; small clubs (~10–50 members) total
  ≪ 1000 rows updated even in the multi-club future.
- `avatar_key` text is ~12 bytes per row; storage impact
  negligible.
- No indexes on `avatar_key` — it's not a query predicate
  anywhere. Always read alongside the member row that's already
  being fetched.
