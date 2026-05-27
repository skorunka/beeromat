import {
  customType,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { members } from './members';

// Spec 021 — uploaded avatar image bytes live here, one row per
// member (UNIQUE FK so the row IS the avatar). Members without an
// uploaded avatar have no row at all; the renderer falls back
// through the spec-020 chain (glyph → initials → icon).
//
// `members.avatar_upload_at` (the timestamp on the parent row) is
// the cheap "has an upload?" sentinel + the cache-buster query
// param on the image URL. Kept in lockstep with this row's
// updated_at by the server actions in a single transaction.

// Drizzle's pg-core doesn't export `bytea` directly — defining it
// via customType. Maps Uint8Array on the TS side; the pg driver
// already returns Buffer for bytea which IS a Uint8Array, so the
// types are compatible.
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AvatarUpload = typeof avatarUploads.$inferSelect;
export type NewAvatarUpload = typeof avatarUploads.$inferInsert;
