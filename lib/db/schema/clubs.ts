import { sql } from 'drizzle-orm';
import { bigint, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './auth';

// data-model.md §1 — clubs (the tenant root)
export const clubs = pgTable('clubs', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  currencyCode: varchar({ length: 3 }).notNull().default('CZK'),
  defaultLocale: varchar({ length: 8 }).notNull().default('cs-CZ'),
  defaultLowStockThreshold: integer().notNull().default(5),
  consumptionUndoWindowSeconds: integer().notNull().default(300),
  // PIN re-prompt threshold: how long a device stays unlocked between
  // PIN entries. The magic-link sign-in is the root of trust; the PIN
  // is just a fast per-device re-unlock, so a long window is fine for
  // this low-stakes beer-tab app. 30 days == the Better Auth session
  // lifetime, so a member effectively re-PINs only when they'd have to
  // re-sign-in anyway. (Was 8h; widened 2026-06-11 — too aggressive for
  // weekly-after-match usage.)
  deviceInactivityLockSeconds: integer().notNull().default(2592000),
  // Spec 012 — how many beers the loser owes after losing a match.
  // Editable via /admin/config. Defaults to 1 (the canonical "loser
  // buys the winner one beer" rule).
  matchLoserBeerCount: integer().notNull().default(1),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`),
});

// data-model.md §2 — club_banking_profiles (one row per club)
export const clubBankingProfiles = pgTable('club_banking_profiles', {
  clubId: uuid()
    .primaryKey()
    .references(() => clubs.id, { onDelete: 'restrict' }),
  iban: text(),
  accountHolderName: text(),
  revolutHandle: text(),
  defaultQrMessage: text(),
  nextVariableSymbol: bigint({ mode: 'bigint' })
    .notNull()
    .default(sql`1`),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
});

export type Club = typeof clubs.$inferSelect;
export type NewClub = typeof clubs.$inferInsert;
export type ClubBankingProfile = typeof clubBankingProfiles.$inferSelect;
