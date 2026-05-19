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
  deviceInactivityLockSeconds: integer().notNull().default(28800),
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
