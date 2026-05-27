import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth';
import { clubs } from './clubs';
import { invitationStatus, memberRole } from './enums';

// data-model.md §3 — members
export const members = pgTable(
  'members',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    email: text().notNull(),
    displayName: text().notNull(),
    role: memberRole().notNull().default('member'),
    isActive: boolean().notNull().default(true),
    acceptedInvitationAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    // spec 020 — picked avatar palette key (one of AVATAR_KEYS in
    // lib/avatars/palette.tsx) or NULL for "use initials fallback".
    // Per-club seat — same person in two clubs picks independently.
    avatarKey: text('avatar_key'),
    // spec 021 — non-null when this member has an uploaded avatar
    // image (the row lives in avatar_uploads.member_id = this row's
    // id). The value is the upload time + doubles as the cache-buster
    // query param on the image URL. Renderer precedence: upload >
    // avatarKey > initials > CircleUser.
    avatarUploadAt: timestamp('avatar_upload_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uniq_members_club_user').on(t.clubId, t.userId),
    index('idx_members_club_active').on(t.clubId, t.isActive),
    index('idx_members_club_role').on(t.clubId, t.role),
  ],
);

// data-model.md §4 — invitations
export const invitations = pgTable(
  'invitations',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    email: text().notNull(),
    role: memberRole().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    status: invitationStatus().notNull().default('pending'),
    acceptedAt: timestamp({ withTimezone: true }),
    acceptedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    // At most one open invite per (club, email). Partial unique index
    // — Drizzle expresses this via SQL `where` clause.
    uniqueIndex('uniq_invitations_club_email_pending')
      .on(t.clubId, t.email)
      .where(sql`${t.status} = 'pending'`),
    index('idx_invitations_token_hash').on(t.tokenHash),
    index('idx_invitations_expires_at')
      .on(t.expiresAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);

// data-model.md §5 — device_sessions (hashed PIN per device)
export const deviceSessions = pgTable(
  'device_sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    deviceLabel: text(),
    pinHash: text().notNull(),
    failedAttempts: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
    lastUnlockAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_device_sessions_user').on(t.userId)],
);

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type DeviceSession = typeof deviceSessions.$inferSelect;
