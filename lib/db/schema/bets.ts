import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { users } from './auth';
import { clubs } from './clubs';
import { consumptions } from './consumption';
import { members } from './members';

// data-model.md §10 — bet_transfers
// Moves the financial weight of one consumption from the original
// drinker (winner) to the loser of the bet. Append-only; a transfer is
// undone by a compensating bet_transfer_voids row, never a delete.
export const betTransfers = pgTable(
  'bet_transfers',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    sourceConsumptionId: uuid()
      .notNull()
      .references(() => consumptions.id, { onDelete: 'restrict' }),
    fromMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    toMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    index('idx_bet_transfers_from_member').on(t.fromMemberId, t.createdAt),
    index('idx_bet_transfers_to_member').on(t.toMemberId, t.createdAt),
    index('idx_bet_transfers_source').on(t.sourceConsumptionId),
    // FR-022 — no self-transfer.
    check('chk_bet_transfers_distinct_members', sql`${t.fromMemberId} <> ${t.toMemberId}`),
  ],
);

// data-model.md §11 — bet_transfer_voids (compensating events)
export const betTransferVoids = pgTable(
  'bet_transfer_voids',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    betTransferId: uuid()
      .notNull()
      .references(() => betTransfers.id, { onDelete: 'restrict' }),
    reason: text(),
    voidedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    voidedByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  // At most one void per transfer (FR-023 — forbid double-void).
  (t) => [uniqueIndex('uniq_bet_transfer_voids_transfer').on(t.betTransferId)],
);

export type BetTransfer = typeof betTransfers.$inferSelect;
export type NewBetTransfer = typeof betTransfers.$inferInsert;
export type BetTransferVoid = typeof betTransferVoids.$inferSelect;
