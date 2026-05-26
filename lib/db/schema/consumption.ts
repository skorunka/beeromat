import { bigint, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { users } from './auth';
import { clubs } from './clubs';
import { beerTypes } from './catalog';
import { members } from './members';
import { drinkSessions } from './sessions';

// data-model.md §8 — consumptions (the core domain row; append-only)
export const consumptions = pgTable(
  'consumptions',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    drinkSessionId: uuid()
      .notNull()
      .references(() => drinkSessions.id, { onDelete: 'restrict' }),
    memberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    beerTypeId: uuid()
      .notNull()
      .references(() => beerTypes.id, { onDelete: 'restrict' }),
    unitPriceMinorSnapshot: bigint({ mode: 'bigint' }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Spec 019 — set when the consumer (member.user_id) has
    // dismissed the home review banner for an on-behalf log.
    // Null for self-logged rows and for unreviewed on-behalf
    // rows. The home banner query filters by this column.
    onBehalfReviewedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('idx_consumptions_session_member').on(t.drinkSessionId, t.memberId),
    index('idx_consumptions_member_created').on(t.memberId, t.createdAt),
    index('idx_consumptions_club_created').on(t.clubId, t.createdAt),
  ],
);

// data-model.md §9 — consumption_voids (compensating events)
export const consumptionVoids = pgTable(
  'consumption_voids',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    consumptionId: uuid()
      .notNull()
      .references(() => consumptions.id, { onDelete: 'restrict' }),
    reason: text(),
    voidedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    voidedByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    // At most one void per consumption (FR-018 forbid double-void).
    uniqueIndex('uniq_consumption_voids_consumption').on(t.consumptionId),
    index('idx_consumption_voids_club_voided').on(t.clubId, t.voidedAt),
  ],
);

export type Consumption = typeof consumptions.$inferSelect;
export type NewConsumption = typeof consumptions.$inferInsert;
export type ConsumptionVoid = typeof consumptionVoids.$inferSelect;
