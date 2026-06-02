import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, smallint, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './auth';
import { beerTypes } from './catalog';
import { clubs } from './clubs';
import { matchAgreements, matches } from './matches';
import { members } from './members';

// Spec 030 — match_bet_debts ("beer IOU" / dlužné pivo).
//
// A pending obligation that one member (loser, from_member) owes
// another (winner, to_member) a beer, arising from a recorded
// for-beer match. Created at result-record time (NO money/stock
// moves then). Settled on delivery — "Předáno" — which reuses the
// existing consumption + bet_transfer settlement so balances stay
// consistent; voided when a still-pending recorded result is
// reversed. Status transitions only (constitution V — no hard
// deletes). See specs/030-match-bet-iou/data-model.md.

export const matchBetDebtStatus = pgEnum('match_bet_debt_status', [
  'pending',
  'settled',
  'voided',
]);

export const matchBetDebts = pgTable(
  'match_bet_debts',
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: 'restrict' }),
    // The specific pair's history row (one matches row = one pair = one debt).
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: 'restrict' }),
    // Grouping: a doubles agreement produces two debts sharing this id.
    agreementId: uuid()
      .notNull()
      .references(() => matchAgreements.id, { onDelete: 'restrict' }),
    // The loser — owes the beer.
    fromMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    // The winner — is owed the beer.
    toMemberId: uuid()
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    // The beer the match was for (copied from the agreement); the default
    // shown at delivery. NULL for pre-030 agreements / when none chosen.
    plannedBeerTypeId: uuid().references(() => beerTypes.id, { onDelete: 'set null' }),
    beerCount: smallint().notNull().default(1),
    status: matchBetDebtStatus().notNull().default('pending'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Set on delivery.
    settledAt: timestamp({ withTimezone: true }),
    settledByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    // The beer actually handed over (may differ from planned).
    settledBeerTypeId: uuid().references(() => beerTypes.id, { onDelete: 'set null' }),
    // Set when a still-pending result is reversed.
    voidedAt: timestamp({ withTimezone: true }),
    voidedByUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    check('chk_match_bet_debts_distinct_members', sql`${t.fromMemberId} <> ${t.toMemberId}`),
    check('chk_match_bet_debts_beer_count_positive', sql`${t.beerCount} >= 1`),
    // status ⇔ which timestamp is set.
    check(
      'chk_match_bet_debts_status_consistency',
      sql`(${t.status} = 'settled' AND ${t.settledAt} IS NOT NULL AND ${t.voidedAt} IS NULL)
       OR (${t.status} = 'voided' AND ${t.voidedAt} IS NOT NULL AND ${t.settledAt} IS NULL)
       OR (${t.status} = 'pending' AND ${t.settledAt} IS NULL AND ${t.voidedAt} IS NULL)`,
    ),
    // Per-member open-IOU lookups (home + match hub).
    index('idx_match_bet_debts_from_pending')
      .on(t.fromMemberId)
      .where(sql`${t.status} = 'pending'`),
    index('idx_match_bet_debts_to_pending')
      .on(t.toMemberId)
      .where(sql`${t.status} = 'pending'`),
    index('idx_match_bet_debts_agreement').on(t.agreementId),
    index('idx_match_bet_debts_match').on(t.matchId),
    index('idx_match_bet_debts_club').on(t.clubId, t.createdAt),
  ],
);

export type MatchBetDebt = typeof matchBetDebts.$inferSelect;
export type NewMatchBetDebt = typeof matchBetDebts.$inferInsert;
