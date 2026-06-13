import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { clubs } from './clubs';
import { members } from './members';

// Spec 035 — persisted, sticky badge unlocks. The badge CATALOG (what each key
// means: emoji, predicate, progress, i18n) lives in code (lib/achievements/
// catalog.ts), NOT here — same call spec 034 made keeping thresholds in
// lib/stats/constants.ts. This table only records who holds which badge key and
// when it was first earned. Insert-only / sticky: rows are never updated or
// deleted under normal operation, so a later voided beer that drops a member back
// below a threshold never strips a badge they already earned.
export const memberAchievements = pgTable(
  'member_achievements',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    // A BadgeKey from the in-code catalog (lib/achievements/types.ts). Free text,
    // not a DB enum — adding a future badge is then a code change, not a migration.
    badgeKey: text('badge_key').notNull(),
    // First-earned moment. Backfill stamps a single release timestamp (see
    // scripts/backfill-achievements.ts) so historical earns don't read as "today".
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // At most one of each badge per member; also the conflict target for the
    // insert-if-absent reconcile (concurrency-safe — no double award).
    uniqueIndex('uniq_member_achievements_member_badge').on(t.memberId, t.badgeKey),
    // The profile read: all badges for one member.
    index('idx_member_achievements_member').on(t.memberId),
  ],
);

export type MemberAchievement = typeof memberAchievements.$inferSelect;
export type NewMemberAchievement = typeof memberAchievements.$inferInsert;
