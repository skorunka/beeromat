import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { users } from './auth';
import { clubs } from './clubs';
import { members } from './members';
import { paymentOrigin, paymentStatus } from './enums';

// data-model.md §13 — payments
// Status machine: claimed → confirmed | disputed; confirmed → voided.
// Treasurer-initiated payments are created directly in `confirmed`.
export const payments = pgTable(
  'payments',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    amountMinor: bigint({ mode: 'bigint' }).notNull(),
    currencyCode: varchar({ length: 3 }).notNull(),
    status: paymentStatus().notNull(),
    origin: paymentOrigin().notNull(),
    variableSymbol: bigint({ mode: 'bigint' }),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    index('idx_payments_club_status').on(t.clubId, t.status),
    index('idx_payments_member_status').on(t.memberId, t.status),
    // SPAYD variable symbols are unique within a club.
    uniqueIndex('uniq_payments_club_vs')
      .on(t.clubId, t.variableSymbol)
      .where(sql`${t.variableSymbol} IS NOT NULL`),
  ],
);

// data-model.md §14 — payment_state_transitions (append-only audit log)
export const paymentStateTransitions = pgTable(
  'payment_state_transitions',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    paymentId: uuid()
      .notNull()
      .references(() => payments.id, { onDelete: 'restrict' }),
    fromStatus: paymentStatus(),
    toStatus: paymentStatus().notNull(),
    reason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    index('idx_payment_transitions_payment').on(t.paymentId, t.createdAt),
    index('idx_payment_transitions_club_created').on(t.clubId, t.createdAt),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentStateTransition = typeof paymentStateTransitions.$inferSelect;
