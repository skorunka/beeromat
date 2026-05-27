# Data Model: Custom Avatar Upload

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-05-27

## Schema changes

### New table: `avatar_uploads`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `member_id` | `uuid` | no | — | FK → `members.id` ON DELETE CASCADE. UNIQUE (one upload per member seat) |
| `image` | `bytea` | no | — | The cropped + resized JPEG bytes |
| `content_type` | `text` | no | `'image/jpeg'` | One of `image/jpeg`, `image/png`, `image/webp` — though in practice the client always sends JPEG after resize |
| `byte_size` | `int` | no | — | Cached for fast metadata queries / observability without loading the blob |
| `created_at` | `timestamptz` | no | `now()` | Insert time |
| `updated_at` | `timestamptz` | no | `now()` | Touched on every re-upload (replace) |

**Indexes**:
- PK on `id` (implicit).
- UNIQUE constraint on `member_id` (the FK column itself doubles as
  the lookup index for `GET /api/avatar/[memberId]`).

### `members` — add `avatar_upload_at`

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `avatar_upload_at` | `timestamptz` | yes | `NULL` | NULL ⇒ no upload (renderer uses the spec-020 fallback chain). Non-NULL ⇒ upload exists, value is the upload time + the cache-buster query param on the image URL. Touched in lock-step with `avatar_uploads.updated_at`. |

**Migration** (`drizzle/0009_<auto>.sql`):

```sql
CREATE TABLE "avatar_uploads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "member_id" uuid NOT NULL UNIQUE REFERENCES "members"("id") ON DELETE CASCADE,
  "image" bytea NOT NULL,
  "content_type" text NOT NULL DEFAULT 'image/jpeg',
  "byte_size" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE "members" ADD COLUMN "avatar_upload_at" timestamp with time zone;
```

No backfill — every existing member starts with NULL
`avatar_upload_at` (renderer uses the spec-020 fallback chain
they see today).

### Drizzle schema (`lib/db/schema/avatar-uploads.ts`)

```ts
import { sql } from 'drizzle-orm';
import {
  customType,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { members } from './members';

// bytea custom type (Drizzle doesn't export this for pg by default).
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() { return 'bytea'; },
});

export const avatarUploads = pgTable('avatar_uploads', {
  id: uuid().primaryKey().defaultRandom(),
  memberId: uuid('member_id')
    .notNull()
    .unique()
    .references(() => members.id, { onDelete: 'cascade' }),
  image: bytea('image').notNull(),
  contentType: text('content_type').notNull().default('image/jpeg'),
  byteSize: integer('byte_size').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AvatarUpload = typeof avatarUploads.$inferSelect;
```

`members.ts` gains:

```ts
avatarUploadAt: timestamp('avatar_upload_at', { withTimezone: true }),
```

## Entity relationships

```
members (1) ─── (0..1) avatar_uploads
        member_id UNIQUE FK
```

One member can have at most one upload (UNIQUE constraint on
`avatar_uploads.member_id`). Members with no upload have no
`avatar_uploads` row at all. The `members.avatar_upload_at`
column mirrors `avatar_uploads.updated_at` (kept in sync by the
server actions in a single transaction).

## Lifecycle / state transitions

| Op | Trigger | DB effect |
|----|---------|-----------|
| Create upload | `uploadAvatarAction({ imageBase64, contentType })` (first time) | INSERT into `avatar_uploads`; UPDATE members SET `avatar_upload_at = now()` |
| Replace upload | `uploadAvatarAction(...)` (existing row) | UPDATE `avatar_uploads` SET `image`, `content_type`, `byte_size`, `updated_at = now()` WHERE `member_id = $1`; UPDATE members SET `avatar_upload_at = now()` |
| Remove upload | `removeAvatarUploadAction()` | DELETE FROM `avatar_uploads` WHERE `member_id = $1`; UPDATE members SET `avatar_upload_at = NULL` |
| Pick glyph (spec 020) | `setAvatarAction({ avatarKey: 'star' })` | UPDATE members SET `avatar_key = 'star'`. ALSO drops the upload (DELETE FROM avatar_uploads + clear avatar_upload_at) so the glyph wins per FR-006 |
| Default tile (spec 020) | `setAvatarAction({ avatarKey: null })` | UPDATE members SET `avatar_key = NULL`. ALSO drops the upload — initials win |
| Member soft-delete (existing) | n/a (no member soft-delete today) | Cascade fires only on hard delete; both columns/rows travel with the member otherwise |

**Renderer precedence** (decided per row):

```
if (member.avatar_upload_at) → render <img src=`/api/avatar/{id}?v={ts}`>
else if (member.avatar_key && isValidAvatarKey)  → render glyph
else if (displayName not empty)                  → render initials
else                                              → render CircleUser icon
```

## Validation rules

- `byte_size` MUST be ≤ 262144 (256 KB) at write time. Server
  action returns `OVERSIZE` if exceeded (defense-in-depth — the
  client always sends ~50-150 KB after the 512×512 resize).
- `content_type` MUST be one of `image/jpeg`, `image/png`,
  `image/webp`. Anything else returns `INVALID_CONTENT_TYPE`.
  In practice the client always sends `image/jpeg` after
  resize, but the column accepts the others for forward
  compatibility.
- `image` MUST be non-empty (`length > 0`).
- The Route Handler MUST 404 (not 500) when no upload exists
  for the requested `memberId`. The renderer's URL builder
  only emits the URL when `avatar_upload_at` is non-NULL, so
  404 only fires on direct URL access / stale cache.

## Data volume / scale assumptions

- ~50 members per club × ~150 KB per stored avatar ≈ 7.5 MB
  per club total (if every member uploaded).
- bytea storage in Postgres is TOAST-friendly — large columns
  get out-of-line storage automatically, so the `members`
  table itself doesn't bloat.
- No indexes on `image` or `byte_size` (they're not query
  predicates anywhere). UNIQUE index on `member_id` is the
  only access path.
