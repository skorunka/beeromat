import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './auth';
import { clubs } from './clubs';
import { stockChangeKind } from './enums';

// data-model.md §6 — beer_types
export const beerTypes = pgTable(
  'beer_types',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    unitPriceMinor: bigint({ mode: 'bigint' }).notNull(),
    currentStock: integer().notNull().default(0),
    lowStockThreshold: integer().notNull().default(5),
    isArchived: boolean().notNull().default(false),
    displayOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    check('beer_types_stock_non_negative', sql`${t.currentStock} >= 0`),
    check('beer_types_threshold_non_negative', sql`${t.lowStockThreshold} >= 0`),
    index('idx_beer_types_club_active_order').on(t.clubId, t.isArchived, t.displayOrder),
    uniqueIndex('uniq_beer_types_club_name_active')
      .on(t.clubId, t.name)
      .where(sql`${t.isArchived} = false`),
  ],
);

// data-model.md §12 — stock_changes (append-only audit ledger)
export const stockChanges = pgTable(
  'stock_changes',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    beerTypeId: uuid()
      .notNull()
      .references(() => beerTypes.id, { onDelete: 'restrict' }),
    delta: integer().notNull(),
    kind: stockChangeKind().notNull(),
    reason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [index('idx_stock_changes_beer_created').on(t.beerTypeId, t.createdAt)],
);

export type BeerType = typeof beerTypes.$inferSelect;
export type NewBeerType = typeof beerTypes.$inferInsert;
export type StockChange = typeof stockChanges.$inferSelect;
