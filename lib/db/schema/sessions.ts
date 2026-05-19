import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { users } from './auth';
import { clubs } from './clubs';

// data-model.md §7 — drink_sessions (after-match drink containers)
export const drinkSessions = pgTable(
  'drink_sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    title: text(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    endedAt: timestamp({ withTimezone: true }),
    openedByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    closedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // FR-015: at most one open session per club at any time.
    uniqueIndex('uniq_drink_sessions_club_open')
      .on(t.clubId)
      .where(sql`${t.endedAt} IS NULL`),
    index('idx_drink_sessions_club_started').on(t.clubId, t.startedAt),
  ],
);

export type DrinkSession = typeof drinkSessions.$inferSelect;
export type NewDrinkSession = typeof drinkSessions.$inferInsert;
